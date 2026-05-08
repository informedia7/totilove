const KEEP_ALIVE_INTERVAL = 25000;
const MAX_FILTER_IDS = 200;

function setupPresenceRoutes(app, { presenceService, authMiddleware, monitoringUtils }) {
    if (!app || !presenceService) {
        return;
    }

    const requireAuth = authMiddleware?.validateSession?.bind(authMiddleware);
    const authMiddlewareFn = requireAuth || ((req, _res, next) => next());

    app.get('/presence/subscribe', authMiddlewareFn, (req, res) => {
        const filterSet = parseUserIdFilter(req.query?.userIds);
        const streamingAvailable = typeof presenceService.isStreamingEnabled === 'function'
            ? presenceService.isStreamingEnabled()
            : (typeof presenceService.isEnabled === 'function'
                ? presenceService.isEnabled()
                : true);

        monitoringUtils?.trackPresenceStreamRequest?.({
            streamingAvailable,
            filterSize: filterSet?.size || 0
        });

        if (!streamingAvailable) {
            res.status(503).json({
                success: false,
                error: 'Presence stream unavailable'
            });
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
        });

        if (typeof res.flushHeaders === 'function') {
            res.flushHeaders();
        }

        res.write('retry: 5000\n\n');
        monitoringUtils?.trackPresenceStreamConnection?.();

        const listener = (payload) => {
            if (filterSet && filterSet.size > 0 && !filterSet.has(payload.userId)) {
                return;
            }

            res.write('event: presence\n');
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        };

        presenceService.on('presence:update', listener);
        sendInitialSnapshot(filterSet, res, presenceService);

        const heartbeat = setInterval(() => {
            res.write(':keep-alive\n\n');
        }, KEEP_ALIVE_INTERVAL);

        let isClosed = false;
        const cleanup = () => {
            if (isClosed) {
                return;
            }
            isClosed = true;
            clearInterval(heartbeat);
            presenceService.off('presence:update', listener);
            monitoringUtils?.trackPresenceStreamDisconnection?.();
            try {
                res.end();
            } catch (error) {
                // Ignore stream errors during cleanup
            }
        };

        req.on('close', cleanup);
        req.on('error', () => {
            monitoringUtils?.trackPresenceStreamError?.();
            cleanup();
        });
    });

    // Leadership coordination routes
    app.get('/api/presence/leadership', authMiddlewareFn, async (req, res) => {
        if (!isLeadershipEnabled(presenceService)) {
            res.status(503).json({ success: false, error: 'leadership_unavailable' });
            return;
        }

        try {
            const channel = req.query?.channel;
            const includeHistory = parseBoolean(req.query?.includeHistory) || parseBoolean(req.query?.history);
            const historyLimit = req.query?.historyLimit ? parseInt(req.query.historyLimit, 10) : 10;

            const [leader, history] = await Promise.all([
                presenceService.getLeadershipRecord(channel),
                includeHistory
                    ? presenceService.getLeadershipHistory(channel, historyLimit)
                    : Promise.resolve(null)
            ]);

            res.json({
                success: true,
                channel: safeNormalizeChannel(presenceService, channel),
                leader: leader || null,
                history: includeHistory ? (history || []) : undefined,
                serverTime: Date.now()
            });
        } catch (error) {
            presenceService.logError?.('leadership-status-route', error);
            res.status(500).json({ success: false, error: 'leadership_status_failed' });
        }
    });

    app.post('/api/presence/leadership/claim', authMiddlewareFn, async (req, res) => {
        if (!isLeadershipEnabled(presenceService)) {
            res.status(503).json({ success: false, error: 'leadership_unavailable' });
            return;
        }

        const payload = buildLeadershipPayload(req);
        if (!payload.instanceId) {
            res.status(400).json({ success: false, error: 'instance_id_required' });
            return;
        }

        try {
            const result = await presenceService.claimLeadership(payload.channel, payload, { ttlMs: payload.ttlMs });
            const statusCode = result.success ? 200 : (result.reason === 'occupied' ? 409 : 400);
            res.status(statusCode).json({
                success: result.success,
                channel: safeNormalizeChannel(presenceService, payload.channel),
                leader: result.leader || null,
                reason: result.reason || null
            });
        } catch (error) {
            presenceService.logError?.('leadership-claim-route', error);
            res.status(500).json({ success: false, error: 'leadership_claim_failed' });
        }
    });

    app.post('/api/presence/leadership/heartbeat', authMiddlewareFn, async (req, res) => {
        if (!isLeadershipEnabled(presenceService)) {
            res.status(503).json({ success: false, error: 'leadership_unavailable' });
            return;
        }

        const payload = buildLeadershipPayload(req);
        if (!payload.instanceId) {
            res.status(400).json({ success: false, error: 'instance_id_required' });
            return;
        }

        try {
            const result = await presenceService.heartbeatLeadership(
                payload.channel,
                payload.instanceId,
                { metadata: payload.metadata, reason: payload.reason },
                { ttlMs: payload.ttlMs }
            );

            const statusCode = result.success ? 200 : 409;
            res.status(statusCode).json({
                success: result.success,
                channel: safeNormalizeChannel(presenceService, payload.channel),
                leader: result.leader || null,
                reason: result.reason || null
            });
        } catch (error) {
            presenceService.logError?.('leadership-heartbeat-route', error);
            res.status(500).json({ success: false, error: 'leadership_heartbeat_failed' });
        }
    });

    app.post('/api/presence/leadership/release', authMiddlewareFn, async (req, res) => {
        if (!isLeadershipEnabled(presenceService)) {
            res.status(503).json({ success: false, error: 'leadership_unavailable' });
            return;
        }

        const payload = buildLeadershipPayload(req);
        if (!payload.instanceId) {
            res.status(400).json({ success: false, error: 'instance_id_required' });
            return;
        }

        try {
            const result = await presenceService.releaseLeadership(
                payload.channel,
                payload.instanceId,
                { reason: payload.reason }
            );
            const statusCode = result.success ? 200 : 409;
            res.status(statusCode).json({
                success: result.success,
                channel: safeNormalizeChannel(presenceService, payload.channel),
                leader: result.leader || null,
                reason: result.reason || null
            });
        } catch (error) {
            presenceService.logError?.('leadership-release-route', error);
            res.status(500).json({ success: false, error: 'leadership_release_failed' });
        }
    });
}

function parseUserIdFilter(rawValue) {
    if (!rawValue) {
        return null;
    }

    const values = Array.isArray(rawValue)
        ? rawValue
        : String(rawValue).split(',');

    const ids = new Set();
    for (const value of values) {
        const parsed = parseInt(value, 10);
        if (!Number.isInteger(parsed)) {
            continue;
        }
        ids.add(parsed);
        if (ids.size >= MAX_FILTER_IDS) {
            break;
        }
    }

    return ids.size > 0 ? ids : null;
}

async function sendInitialSnapshot(filterSet, res, presenceService) {
    if (!filterSet || filterSet.size === 0) {
        return;
    }

    if (typeof presenceService.getStatuses !== 'function') {
        return;
    }

    try {
        const snapshot = await presenceService.getStatuses([...filterSet]);
        if (snapshot && Object.keys(snapshot).length > 0) {
            res.write('event: snapshot\n');
            res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
        }
    } catch (error) {
        presenceService.logError?.('sendInitialSnapshot', error);
    }
}

module.exports = { setupPresenceRoutes };

function isLeadershipEnabled(presenceService) {
    if (!presenceService) {
        return false;
    }
    if (typeof presenceService.isLeadershipEnabled === 'function') {
        return presenceService.isLeadershipEnabled();
    }
    return typeof presenceService.redis !== 'undefined';
}

function parseBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return ['1', 'true', 'yes', 'y'].includes(normalized);
    }
    return false;
}

function buildLeadershipPayload(req) {
    const body = req.body || {};
    const channel = body.channel || req.query?.channel || undefined;
    const userId = resolveUserId(req, body);
    const ttlMs = body.ttlMs ? parseInt(body.ttlMs, 10) : undefined;

    return {
        channel,
        instanceId: body.instanceId || body.clientId || null,
        tabId: body.tabId || null,
        userId,
        metadata: {
            ...(body.metadata || {}),
            userAgent: req.headers['user-agent'] || null,
            ip: req.ip
        },
        reason: body.reason || null,
        ttlMs: Number.isFinite(ttlMs) ? ttlMs : undefined
    };
}

function resolveUserId(req, body = {}) {
    if (Number.isFinite(body.userId)) {
        return body.userId;
    }
    if (typeof body.userId === 'string' && body.userId.trim() !== '') {
        const parsed = parseInt(body.userId, 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    if (req.user?.id) {
        return req.user.id;
    }
    if (req.user?.user_id) {
        return req.user.user_id;
    }
    return null;
}

function safeNormalizeChannel(presenceService, channel) {
    if (!presenceService) {
        return channel || null;
    }
    if (typeof presenceService.normalizeLeadershipChannel === 'function') {
        return presenceService.normalizeLeadershipChannel(channel);
    }
    return channel || null;
}

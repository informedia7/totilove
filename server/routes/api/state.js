function setupStateRoutes(app, { stateService, authMiddleware }) {
    if (!app || !stateService || typeof stateService.isEnabled !== 'function') {
        return;
    }

    if (!stateService.isEnabled()) {
        return;
    }

    const authFn = authMiddleware?.validateSession?.bind(authMiddleware) || ((req, _res, next) => next());

    app.get('/api/state', authFn, async (req, res) => {
        const userId = resolveUserId(req);
        if (!userId) {
            res.status(401).json({ success: false, error: 'unauthorized' });
            return;
        }

        try {
            const keys = normalizeKeys(req.query?.keys);
            const state = await stateService.getState(userId, keys);
            res.json({ success: true, state, timestamp: Date.now() });
        } catch (error) {
            stateService.logger?.warn?.('[StateRoutes] GET failed', error?.message || error);
            res.status(500).json({ success: false, error: 'state_fetch_failed' });
        }
    });

    app.post('/api/state', authFn, async (req, res) => {
        const userId = resolveUserId(req);
        if (!userId) {
            res.status(401).json({ success: false, error: 'unauthorized' });
            return;
        }

        const updates = req.body?.updates;
        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
            res.status(400).json({ success: false, error: 'invalid_updates' });
            return;
        }

        try {
            const state = await stateService.setState(userId, updates);
            res.json({ success: true, state, timestamp: Date.now() });
        } catch (error) {
            stateService.logger?.warn?.('[StateRoutes] POST failed', error?.message || error);
            res.status(500).json({ success: false, error: 'state_persist_failed' });
        }
    });

    app.delete('/api/state', authFn, async (req, res) => {
        const userId = resolveUserId(req);
        if (!userId) {
            res.status(401).json({ success: false, error: 'unauthorized' });
            return;
        }

        const clearAll = parseBoolean(req.query?.all);
        const keys = normalizeKeys(req.query?.keys);

        try {
            if (clearAll) {
                await stateService.clearState(userId);
                res.json({ success: true, cleared: true, timestamp: Date.now() });
                return;
            }

            if (!keys) {
                res.status(400).json({ success: false, error: 'keys_required' });
                return;
            }

            const result = await stateService.deleteState(userId, keys);
            res.json({ success: true, removed: result.removed || 0, timestamp: Date.now() });
        } catch (error) {
            stateService.logger?.warn?.('[StateRoutes] DELETE failed', error?.message || error);
            res.status(500).json({ success: false, error: 'state_delete_failed' });
        }
    });
}

function resolveUserId(req) {
    if (!req) {
        return null;
    }

    if (req.user?.id) {
        return req.user.id;
    }

    if (req.user?.user_id) {
        return req.user.user_id;
    }

    return null;
}

function normalizeKeys(rawKeys) {
    if (!rawKeys) {
        return null;
    }

    const values = Array.isArray(rawKeys) ? rawKeys : [rawKeys];
    const keys = values
        .map(value => {
            if (value == null) {
                return '';
            }
            return String(value).trim();
        })
        .filter(Boolean);

    return keys.length > 0 ? keys : null;
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

module.exports = { setupStateRoutes };

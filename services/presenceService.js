const { EventEmitter } = require('events');

const LEADERSHIP_DEFAULTS = {
    enabled: true,
    channel: 'presence-engine-leadership',
    leaderKeyTemplate: 'presence:leader:{channel}',
    leaderHeartbeatKeyTemplate: 'presence:leader:heartbeat:{channel}',
    leaderHistoryKeyTemplate: 'presence:leader:history:{channel}',
    leaderHistoryMaxEntries: 50,
    leaderTtlMs: 20000,
    clientStateKeyTemplate: 'presence:client:{userId}:{instanceId}',
    clientSessionKeyTemplate: 'presence:session:{userId}',
    clientCacheKeyTemplate: 'presence:cache:{userId}:{cacheType}',
    tabMessagesKeyTemplate: 'presence:tab:messages:{userId}',
    rateLimitKeyTemplate: 'presence:ratelimit:{userId}:{action}',
    userPresenceKeyTemplate: 'presence:user:{userId}',
    userLastSeenKeyTemplate: 'presence:lastseen:{userId}'
};

const DEFAULT_OPTIONS = {
    keyPrefix: 'presence:user:',
    onlineIndexKey: 'presence:online',
    heartbeatTTL: 60000, // expected heartbeat interval in ms
    gracePeriodMs: 15000, // tolerate minor network jitter
    persistenceMs: 24 * 60 * 60 * 1000, // keep last-seen data for 24h
    cleanupIntervalMs: 60000,
    autoCleanup: true,
    eventChannel: 'presence:events',
    logger: console,
    streamingEnabled: true,
    leadership: { ...LEADERSHIP_DEFAULTS }
};

class PresenceService extends EventEmitter {
    constructor(redisClient, options = {}) {
        super();
        this.redis = redisClient || null;
        this.enabled = Boolean(redisClient);
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.options.leadership = {
            ...LEADERSHIP_DEFAULTS,
            ...(options.leadership || {})
        };
        this.logger = this.options.logger || console;
        this.cleanupTimer = null;
        this.onlineThresholdMs = this.options.heartbeatTTL + this.options.gracePeriodMs;
        this.instanceId = `presence:${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
        this.eventSubscriber = null;
        this.streamingEnabled = this.enabled && this.options.streamingEnabled !== false;

        if (this.enabled && this.options.autoCleanup) {
            this.startCleanup(this.options.cleanupIntervalMs);
        }

        if (this.streamingEnabled) {
            this.setupEventBridge().catch(error => this.logError('setupEventBridge', error));
        }
    }

    isEnabled() {
        return this.enabled;
    }

    isStreamingEnabled() {
        return this.streamingEnabled;
    }

    normalizeUserId(userId) {
        const id = parseInt(userId, 10);
        return Number.isInteger(id) ? id : null;
    }

    isLeadershipEnabled() {
        return this.enabled && this.options.leadership?.enabled !== false;
    }

    getLeadershipOptions() {
        return this.options.leadership || LEADERSHIP_DEFAULTS;
    }

    normalizeLeadershipChannel(channel) {
        const fallback = this.getLeadershipOptions().channel || 'default';
        const value = channel || fallback;
        return String(value || 'default').trim() || 'default';
    }

    formatLeadershipKey(template, replacements = {}) {
        if (!template) {
            return null;
        }

        return Object.entries(replacements).reduce((result, [key, value]) => {
            const token = new RegExp(`{${key}}`, 'g');
            return result.replace(token, String(value ?? ''));
        }, template);
    }

    getLeaderKey(channel) {
        const normalizedChannel = this.normalizeLeadershipChannel(channel);
        return this.formatLeadershipKey(
            this.getLeadershipOptions().leaderKeyTemplate,
            { channel: normalizedChannel }
        );
    }

    getLeaderHeartbeatKey(channel) {
        const normalizedChannel = this.normalizeLeadershipChannel(channel);
        return this.formatLeadershipKey(
            this.getLeadershipOptions().leaderHeartbeatKeyTemplate,
            { channel: normalizedChannel }
        );
    }

    getLeaderHistoryKey(channel) {
        const normalizedChannel = this.normalizeLeadershipChannel(channel);
        return this.formatLeadershipKey(
            this.getLeadershipOptions().leaderHistoryKeyTemplate,
            { channel: normalizedChannel }
        );
    }

    getLeaderTtlMs(customTtl) {
        const fallback = this.getLeadershipOptions().leaderTtlMs || 20000;
        const value = Number(customTtl || fallback);
        if (!Number.isFinite(value) || value <= 0) {
            return fallback;
        }
        return Math.max(5000, value);
    }

    parseLeadershipRecord(rawValue, fallbackChannel = null) {
        if (!rawValue) {
            return null;
        }

        try {
            const payload = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
            if (!payload || typeof payload !== 'object') {
                return null;
            }

            const normalized = {
                channel: payload.channel || fallbackChannel || this.normalizeLeadershipChannel(null),
                instanceId: payload.instanceId || payload.id || null,
                userId: this.normalizeUserId(payload.userId),
                tabId: payload.tabId || null,
                lastHeartbeat: typeof payload.lastHeartbeat === 'number'
                    ? payload.lastHeartbeat
                    : Date.parse(payload.lastHeartbeat || '') || Date.now(),
                claimedAt: typeof payload.claimedAt === 'number'
                    ? payload.claimedAt
                    : Date.parse(payload.claimedAt || '') || null,
                metadata: payload.metadata || null,
                reason: payload.reason || 'claim',
                event: payload.event || null,
                releaseReason: payload.releaseReason || null
            };

            if (!normalized.instanceId) {
                return null;
            }

            return normalized;
        } catch (error) {
            this.logError('parseLeadershipRecord', error);
            return null;
        }
    }

    async getLeadershipRecord(channel) {
        if (!this.isLeadershipEnabled()) {
            return null;
        }

        try {
            const key = this.getLeaderKey(channel);
            if (!key) {
                return null;
            }
            const raw = await this.redis.get(key);
            return this.parseLeadershipRecord(raw, this.normalizeLeadershipChannel(channel));
        } catch (error) {
            this.logError('getLeadershipRecord', error);
            return null;
        }
    }

    async getLeadershipHistory(channel, limit = 10) {
        if (!this.isLeadershipEnabled()) {
            return [];
        }

        try {
            const historyKey = this.getLeaderHistoryKey(channel);
            if (!historyKey) {
                return [];
            }
            const maxEntries = Math.min(
                Math.max(limit, 1),
                this.getLeadershipOptions().leaderHistoryMaxEntries || 50
            );
            const rawEntries = await this.redis.lRange(historyKey, 0, maxEntries - 1);
            return rawEntries
                .map(entry => this.parseLeadershipRecord(entry, this.normalizeLeadershipChannel(channel)))
                .filter(Boolean);
        } catch (error) {
            this.logError('getLeadershipHistory', error);
            return [];
        }
    }

    async recordLeadershipHistory(channel, entry) {
        if (!this.isLeadershipEnabled()) {
            return;
        }

        try {
            const historyKey = this.getLeaderHistoryKey(channel);
            if (!historyKey) {
                return;
            }

            const payload = JSON.stringify({
                ...entry,
                channel: this.normalizeLeadershipChannel(channel)
            });
            const maxEntries = this.getLeadershipOptions().leaderHistoryMaxEntries || 50;
            const multi = this.redis.multi();
            multi.lPush(historyKey, payload);
            multi.lTrim(historyKey, 0, Math.max(maxEntries - 1, 0));
            await multi.exec();
        } catch (error) {
            this.logError('recordLeadershipHistory', error);
        }
    }

    async claimLeadership(channel, payload = {}, options = {}) {
        if (!this.isLeadershipEnabled()) {
            return { success: false, reason: 'leadership_disabled' };
        }

        const instanceId = payload.instanceId || payload.id;
        if (!instanceId) {
            return { success: false, reason: 'instance_required' };
        }

        const normalizedChannel = this.normalizeLeadershipChannel(channel);
        const leaderKey = this.getLeaderKey(normalizedChannel);
        const ttlMs = this.getLeaderTtlMs(options.ttlMs);
        const now = Date.now();
        const record = {
            channel: normalizedChannel,
            instanceId,
            userId: this.normalizeUserId(payload.userId),
            tabId: payload.tabId || instanceId,
            lastHeartbeat: now,
            claimedAt: now,
            metadata: payload.metadata || null,
            reason: payload.reason || 'claim'
        };

        try {
            const serialized = JSON.stringify(record);
            const result = await this.redis.set(leaderKey, serialized, { PX: ttlMs, NX: true });
            if (result === 'OK') {
                await this.redis.set(this.getLeaderHeartbeatKey(normalizedChannel), String(now), { PX: ttlMs });
                await this.recordLeadershipHistory(normalizedChannel, { ...record, event: 'claim', timestamp: now });
                return { success: true, leader: record };
            }

            const existing = await this.getLeadershipRecord(normalizedChannel);
            return { success: false, reason: 'occupied', leader: existing };
        } catch (error) {
            this.logError('claimLeadership', error);
            return { success: false, reason: 'error', error: error.message };
        }
    }

    async heartbeatLeadership(channel, instanceId, updates = {}, options = {}) {
        if (!this.isLeadershipEnabled()) {
            return { success: false, reason: 'leadership_disabled' };
        }

        const normalizedChannel = this.normalizeLeadershipChannel(channel);
        const ttlMs = this.getLeaderTtlMs(options.ttlMs);
        const leaderKey = this.getLeaderKey(normalizedChannel);

        try {
            const current = await this.getLeadershipRecord(normalizedChannel);
            if (!current) {
                return { success: false, reason: 'no_leader' };
            }

            if (instanceId && current.instanceId !== instanceId) {
                return { success: false, reason: 'not_owner', leader: current };
            }

            const now = Date.now();
            const updated = {
                ...current,
                lastHeartbeat: now,
                metadata: updates.metadata
                    ? { ...(current.metadata || {}), ...updates.metadata }
                    : current.metadata,
                reason: updates.reason || current.reason
            };

            const multi = this.redis.multi();
            multi.set(leaderKey, JSON.stringify(updated), { PX: ttlMs });
            multi.set(this.getLeaderHeartbeatKey(normalizedChannel), String(now), { PX: ttlMs });
            await multi.exec();

            return { success: true, leader: updated };
        } catch (error) {
            this.logError('heartbeatLeadership', error);
            return { success: false, reason: 'error', error: error.message };
        }
    }

    async releaseLeadership(channel, instanceId, options = {}) {
        if (!this.isLeadershipEnabled()) {
            return { success: false, reason: 'leadership_disabled' };
        }

        const normalizedChannel = this.normalizeLeadershipChannel(channel);
        const leaderKey = this.getLeaderKey(normalizedChannel);
        const heartbeatKey = this.getLeaderHeartbeatKey(normalizedChannel);

        try {
            const current = await this.getLeadershipRecord(normalizedChannel);
            if (!current) {
                return { success: false, reason: 'no_leader' };
            }

            if (instanceId && current.instanceId !== instanceId) {
                return { success: false, reason: 'not_owner', leader: current };
            }

            const releaseEntry = {
                ...current,
                event: 'release',
                releaseReason: options.reason || 'manual',
                timestamp: Date.now()
            };

            const multi = this.redis.multi();
            multi.del(leaderKey);
            multi.del(heartbeatKey);
            await multi.exec();

            await this.recordLeadershipHistory(normalizedChannel, releaseEntry);

            return { success: true, leader: current };
        } catch (error) {
            this.logError('releaseLeadership', error);
            return { success: false, reason: 'error', error: error.message };
        }
    }

    getUserKey(userId) {
        return `${this.options.keyPrefix}${userId}`;
    }

    async markOnline(userId, metadata = {}) {
        if (!this.enabled) return null;
        const normalizedId = this.normalizeUserId(userId);
        if (normalizedId === null) return null;

        const now = Date.now();
        const payload = {
            userId: normalizedId,
            status: 'online',
            lastSeen: now,
            lastHeartbeat: now,
            source: metadata.source || 'unknown',
            meta: metadata.meta || null,
            version: 1,
            timestamp: now,
            origin: metadata.origin || this.instanceId
        };

        const ttlSeconds = Math.ceil(this.options.persistenceMs / 1000);
        const expiryScore = now + this.options.heartbeatTTL;

        try {
            await Promise.all([
                this.redis.set(this.getUserKey(normalizedId), JSON.stringify(payload), { EX: ttlSeconds }),
                this.redis.zAdd(this.options.onlineIndexKey, [{ score: expiryScore, value: normalizedId.toString() }])
            ]);
            const eventPayload = { ...payload, isOnline: true };
            this.emitPresenceUpdate(eventPayload);
            this.publishPresenceEvent(eventPayload);
            return payload;
        } catch (error) {
            this.logError('markOnline', error);
            return null;
        }
    }

    async markOffline(userId, metadata = {}) {
        if (!this.enabled) return null;
        const normalizedId = this.normalizeUserId(userId);
        if (normalizedId === null) return null;

        const now = Date.now();
        const payload = {
            userId: normalizedId,
            status: 'offline',
            lastSeen: now,
            source: metadata.source || 'unknown',
            meta: metadata.meta || null,
            version: 1,
            timestamp: now,
            origin: metadata.origin || this.instanceId
        };

        const ttlSeconds = Math.ceil(this.options.persistenceMs / 1000);

        try {
            await Promise.all([
                this.redis.set(this.getUserKey(normalizedId), JSON.stringify(payload), { EX: ttlSeconds }),
                this.redis.zRem(this.options.onlineIndexKey, normalizedId.toString())
            ]);
            const eventPayload = { ...payload, isOnline: false };
            this.emitPresenceUpdate(eventPayload);
            this.publishPresenceEvent(eventPayload);
            return payload;
        } catch (error) {
            this.logError('markOffline', error);
            return null;
        }
    }

    async getStatus(userId) {
        const statuses = await this.getStatuses([userId]);
        return statuses ? statuses[userId] || null : null;
    }

    async getStatuses(userIds = []) {
        if (!this.enabled || !Array.isArray(userIds) || userIds.length === 0) {
            return null;
        }

        const normalizedIds = userIds.map(id => this.normalizeUserId(id));
        const keyMap = [];
        normalizedIds.forEach((id, idx) => {
            if (id === null) return;
            keyMap.push({ key: this.getUserKey(id), userId: userIds[idx] });
        });

        if (keyMap.length === 0) {
            return null;
        }

        try {
            const rawValues = await this.redis.mGet(keyMap.map(entry => entry.key));
            const statusMap = {};
            rawValues.forEach((rawValue, idx) => {
                const originalUserId = keyMap[idx].userId;
                const parsed = this.parsePayload(rawValue, originalUserId);
                if (parsed) {
                    statusMap[parsed.userId] = parsed;
                }
            });
            return statusMap;
        } catch (error) {
            this.logError('getStatuses', error);
            return null;
        }
    }

    parsePayload(rawValue, fallbackUserId) {
        if (!rawValue) return null;

        try {
            const payload = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
            const normalizedId = this.normalizeUserId(payload.userId ?? fallbackUserId);
            if (normalizedId === null) return null;

            const lastSeen = typeof payload.lastSeen === 'number'
                ? payload.lastSeen
                : Date.parse(payload.lastSeen) || Date.now();

            const isOnline = payload.status === 'online'
                ? (Date.now() - lastSeen) <= this.onlineThresholdMs
                : false;

            return {
                userId: normalizedId,
                isOnline,
                lastSeen: new Date(lastSeen).toISOString(),
                status: payload.status,
                source: 'redis',
                meta: payload.meta || null
            };
        } catch (error) {
            this.logError('parsePayload', error);
            return null;
        }
    }

    async cleanupExpiredEntries(batchSize = 250) {
        if (!this.enabled) return 0;
        try {
            const now = Date.now();
            const expiredIds = await this.redis.zRangeByScore(
                this.options.onlineIndexKey,
                '-inf',
                now,
                { LIMIT: { offset: 0, count: batchSize } }
            );

            if (!expiredIds || expiredIds.length === 0) {
                return 0;
            }

            for (const id of expiredIds) {
                await this.markOffline(id, { source: 'sweeper' });
            }

            return expiredIds.length;
        } catch (error) {
            this.logError('cleanupExpiredEntries', error);
            return 0;
        }
    }

    startCleanup(intervalMs = this.options.cleanupIntervalMs) {
        if (!this.enabled || this.cleanupTimer) {
            return;
        }

        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredEntries().catch(err => {
                this.logError('scheduledCleanup', err);
            });
        }, intervalMs);

        if (typeof this.cleanupTimer.unref === 'function') {
            this.cleanupTimer.unref();
        }
    }

    stopCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    async setupEventBridge() {
        if (!this.streamingEnabled) {
            return;
        }

        if (typeof this.redis?.duplicate !== 'function') {
            this.logError('setupEventBridge', new Error('Redis duplicate() unavailable'));
            return;
        }

        const subscriber = this.redis.duplicate();
        await subscriber.connect();
        await subscriber.subscribe(this.options.eventChannel, (message) => {
            this.handleIncomingPresenceMessage(message);
        });
        this.eventSubscriber = subscriber;
    }

    async shutdown() {
        this.stopCleanup();
        if (this.eventSubscriber) {
            try {
                await this.eventSubscriber.unsubscribe(this.options.eventChannel);
                await this.eventSubscriber.quit();
            } catch (error) {
                this.logError('shutdown', error);
            }
            this.eventSubscriber = null;
        }
    }

    publishPresenceEvent(payload) {
        if (!this.streamingEnabled || !this.redis?.publish) {
            return;
        }

        try {
            const serialized = JSON.stringify(payload);
            const publishResult = this.redis.publish(this.options.eventChannel, serialized);
            if (publishResult && typeof publishResult.catch === 'function') {
                publishResult.catch(error => this.logError('publishPresenceEvent', error));
            }
        } catch (error) {
            this.logError('publishPresenceEvent', error);
        }
    }

    handleIncomingPresenceMessage(message) {
        try {
            const payload = typeof message === 'string' ? JSON.parse(message) : message;
            if (payload?.origin && payload.origin === this.instanceId) {
                return;
            }
            this.emitPresenceUpdate(payload);
        } catch (error) {
            this.logError('handleIncomingPresenceMessage', error);
        }
    }

    logError(scope, error) {
        if (this.logger && typeof this.logger.warn === 'function') {
            this.logger.warn(`[PresenceService:${scope}]`, error?.message || error);
        }
    }

    emitPresenceUpdate(rawPayload) {
        if (!rawPayload || typeof rawPayload.userId === 'undefined') {
            return;
        }

        const normalizedPayload = {
            userId: this.normalizeUserId(rawPayload.userId),
            status: rawPayload.status || (rawPayload.isOnline ? 'online' : 'offline'),
            isOnline: Boolean(rawPayload.isOnline ?? rawPayload.status === 'online'),
            lastSeen: rawPayload.lastSeen,
            lastHeartbeat: rawPayload.lastHeartbeat || rawPayload.lastSeen,
            source: rawPayload.source || 'redis',
            meta: rawPayload.meta || null,
            timestamp: rawPayload.timestamp || Date.now(),
            origin: rawPayload.origin || this.instanceId
        };

        if (normalizedPayload.userId === null) {
            return;
        }

        this.emit('presence:update', normalizedPayload);
    }

    getInstanceId() {
        return this.instanceId;
    }
}

module.exports = PresenceService;

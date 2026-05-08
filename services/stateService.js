class StateService {
    constructor(redisClient, options = {}) {
        this.redis = redisClient || null;
        this.enabled = Boolean(redisClient);
        this.prefix = options.prefix || 'state:user:';
        this.logger = options.logger || console;
        this.maxKeysPerRequest = options.maxKeysPerRequest || 50;
    }

    isEnabled() {
        return this.enabled;
    }

    normalizeUserId(userId) {
        const id = parseInt(userId, 10);
        return Number.isFinite(id) ? id : null;
    }

    getUserKey(userId) {
        return `${this.prefix}${userId}`;
    }

    normalizeKeys(keys) {
        if (!Array.isArray(keys)) {
            return null;
        }

        const normalized = [];
        for (const key of keys) {
            if (typeof key !== 'string' || key.trim() === '') {
                continue;
            }
            normalized.push(key.trim());
            if (normalized.length >= this.maxKeysPerRequest) {
                break;
            }
        }

        return normalized.length > 0 ? normalized : null;
    }

    serialize(value) {
        try {
            return JSON.stringify(value ?? null);
        } catch (error) {
            this.logger.warn?.('[StateService] Failed to serialize value', error);
            return JSON.stringify(null);
        }
    }

    deserialize(value) {
        if (typeof value !== 'string') {
            return value;
        }

        try {
            return JSON.parse(value);
        } catch (_error) {
            return value;
        }
    }

    async getState(userId, keys = null) {
        if (!this.enabled) {
            return {};
        }

        const normalizedId = this.normalizeUserId(userId);
        if (normalizedId === null) {
            return {};
        }

        const userKey = this.getUserKey(normalizedId);
        try {
            if (!keys || keys.length === 0) {
                const raw = await this.redis.hGetAll(userKey);
                if (!raw || Object.keys(raw).length === 0) {
                    return {};
                }

                const result = {};
                Object.entries(raw).forEach(([field, value]) => {
                    result[field] = this.deserialize(value);
                });
                return result;
            }

            const normalizedKeys = this.normalizeKeys(keys);
            if (!normalizedKeys) {
                return {};
            }

            const values = await this.redis.hmGet(userKey, normalizedKeys);
            const payload = {};
            normalizedKeys.forEach((field, index) => {
                const value = values[index];
                if (value !== null && value !== undefined) {
                    payload[field] = this.deserialize(value);
                }
            });
            return payload;
        } catch (error) {
            this.logger.warn?.('[StateService] getState failed', error);
            return {};
        }
    }

    async setState(userId, updates = {}) {
        if (!this.enabled || !updates || typeof updates !== 'object') {
            return {};
        }

        const normalizedId = this.normalizeUserId(userId);
        if (normalizedId === null) {
            return {};
        }

        const entries = Object.entries(updates)
            .filter(([key]) => typeof key === 'string' && key.trim() !== '')
            .slice(0, this.maxKeysPerRequest)
            .reduce((acc, [key, value]) => {
                acc[key.trim()] = this.serialize(value);
                return acc;
            }, {});

        if (Object.keys(entries).length === 0) {
            return {};
        }

        try {
            await this.redis.hSet(this.getUserKey(normalizedId), entries);
            return this.getState(normalizedId, Object.keys(entries));
        } catch (error) {
            this.logger.warn?.('[StateService] setState failed', error);
            return {};
        }
    }

    async deleteState(userId, keys = []) {
        if (!this.enabled) {
            return { removed: 0 };
        }

        const normalizedId = this.normalizeUserId(userId);
        if (normalizedId === null) {
            return { removed: 0 };
        }

        const normalizedKeys = this.normalizeKeys(keys);
        if (!normalizedKeys) {
            return { removed: 0 };
        }

        try {
            const removed = await this.redis.hDel(this.getUserKey(normalizedId), ...normalizedKeys);
            return { removed };
        } catch (error) {
            this.logger.warn?.('[StateService] deleteState failed', error);
            return { removed: 0 };
        }
    }

    async clearState(userId) {
        if (!this.enabled) {
            return false;
        }

        const normalizedId = this.normalizeUserId(userId);
        if (normalizedId === null) {
            return false;
        }

        try {
            await this.redis.del(this.getUserKey(normalizedId));
            return true;
        } catch (error) {
            this.logger.warn?.('[StateService] clearState failed', error);
            return false;
        }
    }
}

module.exports = StateService;

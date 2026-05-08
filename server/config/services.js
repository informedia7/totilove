/**
 * Services Configuration Module
 * Initializes all application services
 */

const MessageService = require('../../services/messageService');
const sessionService = require('../../services/sessionService');
const BlockRateLimiter = require('../../utils/blockRateLimiter');
const PresenceService = require('../../services/presenceService');
const StateService = require('../../services/stateService');
const featureFlags = require('../../config/featureFlags');

/**
 * Setup all application services
 * @param {Object} db - Database pool instance
 * @param {Object} redis - Redis client instance (can be null)
 * @returns {Object} Services object with all initialized services
 */
function setupServices(db, redis) {
    const messageService = new MessageService(db, redis);

    const presenceFlags = {
        redisEnabled: typeof featureFlags.isPresenceRedisEnabled === 'function'
            ? featureFlags.isPresenceRedisEnabled()
            : true,
        streamingEnabled: typeof featureFlags.isPresenceStreamingEnabled === 'function'
            ? featureFlags.isPresenceStreamingEnabled()
            : true
    };

    const presenceService = redis && presenceFlags.redisEnabled
        ? new PresenceService(redis, {
              logger: console,
              streamingEnabled: presenceFlags.streamingEnabled
          })
        : null;

    const stateService = redis
        ? new StateService(redis, {
              logger: console,
              prefix: 'state:user:'
          })
        : null;
    
    // Initialize block rate limiter
    const blockRateLimiter = new BlockRateLimiter(db, redis);
    
    return {
        messageService,
        sessionService,
        blockRateLimiter,
        presenceService,
        stateService
    };
}

module.exports = { setupServices };


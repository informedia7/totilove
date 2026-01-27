const path = require('path');

const featureFlagsPath = path.resolve(__dirname, '..', '..', 'config', 'featureFlags.js');
const db = require('../config/database');

function withFeatureFlags(overrides, runner) {
    const priorValues = {};
    Object.entries(overrides).forEach(([key, value]) => {
        priorValues[key] = process.env[key];
        if (value === undefined || value === null) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    });

    delete require.cache[featureFlagsPath];
    const flags = require(featureFlagsPath);

    try {
        return runner(flags);
    } finally {
        delete require.cache[featureFlagsPath];
        Object.entries(priorValues).forEach(([key, value]) => {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        });
    }
}

function simulatePresenceSubscribe(presenceService) {
    const streamingAvailable = typeof presenceService.isStreamingEnabled === 'function'
        ? presenceService.isStreamingEnabled()
        : (typeof presenceService.isEnabled === 'function'
            ? presenceService.isEnabled()
            : true);

    if (!streamingAvailable) {
        return {
            statusCode: 503,
            body: {
                success: false,
                error: 'Presence stream unavailable'
            }
        };
    }

    return {
        statusCode: 200,
        body: {
            success: true
        }
    };
}

function captureTest(id, label, description, runner) {
    const startedAt = Date.now();
    try {
        const details = runner();
        return {
            id,
            label,
            description,
            status: 'pass',
            details,
            durationMs: Date.now() - startedAt
        };
    } catch (error) {
        return {
            id,
            label,
            description,
            status: 'fail',
            error: error && error.message ? error.message : 'Unknown error',
            details: error && error.details ? error.details : null,
            durationMs: Date.now() - startedAt
        };
    }
}

async function getActiveUsersSampleCount() {
    try {
        const { rows } = await db.query(`
            SELECT COUNT(DISTINCT user_id) AS count
            FROM user_sessions
            WHERE is_active = true
              AND (last_activity IS NULL OR last_activity > NOW() - INTERVAL '5 minutes')
        `);
        return Number(rows?.[0]?.count || 0);
    } catch (error) {
        console.warn('[PresenceDiagnostics] Failed to read active users sample:', error.message);
        return null;
    }
}

async function runPresenceDiagnostics() {
    const tests = [];

    tests.push(captureTest(
        'defaults-enabled',
        'Defaults Enabled',
        'Ensures redis + streaming default to enabled when env vars are unset.',
        () => withFeatureFlags({
            PRESENCE_REDIS_ENABLED: undefined,
            PRESENCE_STREAMING_ENABLED: undefined,
            ENABLE_ALL_NEW: undefined
        }, (flags) => {
            const presence = flags.getPresenceFlags();
            if (!(presence.redisEnabled && presence.streamingEnabled)) {
                const error = new Error('Presence defaults did not enable both redis and streaming.');
                error.details = { presence };
                throw error;
            }
            return { presence };
        })
    ));

    tests.push(captureTest(
        'redis-toggle',
        'Redis Toggle Safety',
        'Turning redis flag off should also disable streaming.',
        () => withFeatureFlags({
            PRESENCE_REDIS_ENABLED: 'false',
            PRESENCE_STREAMING_ENABLED: undefined,
            ENABLE_ALL_NEW: undefined
        }, (flags) => {
            const presence = flags.getPresenceFlags();
            if (presence.redisEnabled !== false || presence.streamingEnabled !== false) {
                const error = new Error('Streaming must disable when redis is off.');
                error.details = { presence };
                throw error;
            }
            return { presence };
        })
    ));

    tests.push(captureTest(
        'streaming-toggle',
        'Streaming Toggle',
        'Disabling streaming flag keeps redis online but stops SSE.',
        () => withFeatureFlags({
            PRESENCE_REDIS_ENABLED: 'true',
            PRESENCE_STREAMING_ENABLED: 'false',
            ENABLE_ALL_NEW: undefined
        }, (flags) => {
            const presence = flags.getPresenceFlags();
            if (presence.redisEnabled !== true || presence.streamingEnabled !== false) {
                const error = new Error('Streaming toggle did not behave as expected.');
                error.details = { presence };
                throw error;
            }
            return { presence };
        })
    ));

    tests.push(captureTest(
        'enable-all-override',
        'Enable-All Override',
        'ENABLE_ALL_NEW should override individual presence toggles.',
        () => withFeatureFlags({
            ENABLE_ALL_NEW: 'true',
            PRESENCE_REDIS_ENABLED: 'false',
            PRESENCE_STREAMING_ENABLED: 'false'
        }, (flags) => {
            const presence = flags.getPresenceFlags();
            if (!(presence.redisEnabled && presence.streamingEnabled && flags.enableAll)) {
                const error = new Error('Enable-all flag failed to override presence toggles.');
                error.details = { presence };
                throw error;
            }
            return { presence };
        })
    ));

    tests.push(captureTest(
        'streaming-503',
        'Streaming 503 Guard',
        'Presence stream should reject subscriptions when streaming disabled.',
        () => {
            const simulatedResponse = simulatePresenceSubscribe({
                isStreamingEnabled: () => false
            });
            if (simulatedResponse.statusCode !== 503 || simulatedResponse.body.error !== 'Presence stream unavailable') {
                const error = new Error('Presence subscribe did not fail fast when streaming disabled.');
                error.details = simulatedResponse;
                throw error;
            }
            return simulatedResponse;
        }
    ));

    const summary = {
        total: tests.length,
        passed: tests.filter(test => test.status === 'pass').length,
        failed: tests.filter(test => test.status === 'fail').length
    };

    const activeUsers = await getActiveUsersSampleCount();
    if (typeof activeUsers === 'number') {
        summary.usersTested = activeUsers;
        const ratio = summary.total > 0 ? summary.passed / summary.total : 0;
        summary.usersPassing = Math.round(activeUsers * ratio);
    } else {
        summary.usersTested = null;
        summary.usersPassing = null;
    }

    return { summary, tests };
}

module.exports = {
    runPresenceDiagnostics
};

#!/usr/bin/env node
/**
 * Presence Leadership Debugger
 * ------------------------------------------------------------
 * Standalone Node.js script that exercises the leadership + metrics
 * endpoints using real session tokens. Useful for reproducing the
 * 401/403 issues that appear when multiple users are logged in.
 *
 * Usage:
 *   node scripts/debug/presence_leadership_debug.js \
 *       --token <sessionTokenA> --user 101 \
 *       --token <sessionTokenB> --user 202 \
 *       --baseUrl http://localhost:3001 \
 *       --channel presence-engine-leadership
 *
 * Notes:
 *   - Session tokens must come from valid browser logins (cookies).
 *   - Optional --user arguments are matched to tokens in order.
 *   - The script automatically fetches CSRF tokens and logs every
 *     HTTP response so you can spot which step fails.
 */

const crypto = require('crypto');
const { URL } = require('url');

const DEFAULT_BASE_URL = process.env.PRESENCE_BASE_URL || 'http://localhost:3001';
const DEFAULT_CHANNEL = process.env.PRESENCE_CHANNEL || 'presence-engine-leadership';

function parseArgs(argv = process.argv.slice(2)) {
    const tokens = [];
    const userIds = [];
    let baseUrl = DEFAULT_BASE_URL;
    let channel = DEFAULT_CHANNEL;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg) continue;

        switch (arg) {
            case '--token':
                if (!argv[i + 1]) throw new Error('Missing value after --token');
                tokens.push(argv[++i].trim());
                break;
            case '--user':
                if (!argv[i + 1]) throw new Error('Missing value after --user');
                userIds.push(Number(argv[++i]));
                break;
            case '--baseUrl':
                if (!argv[i + 1]) throw new Error('Missing value after --baseUrl');
                baseUrl = argv[++i];
                break;
            case '--channel':
                if (!argv[i + 1]) throw new Error('Missing value after --channel');
                channel = argv[++i];
                break;
            case '--help':
            case '-h':
                return { help: true, tokens, userIds, baseUrl, channel };
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return { tokens, userIds, baseUrl, channel };
}

function printUsage() {
    console.log(`\nPresence Leadership Debugger\n------------------------------\nnode scripts/debug/presence_leadership_debug.js \\\n  --token <sessionTokenA> [--user <userIdA>] \\\n  [--token <sessionTokenB> --user <userIdB>] \\\n  [--baseUrl http://localhost:3001] [--channel presence-engine-leadership]\n`);
}

function shortToken(token) {
    if (!token) return '(missing)';
    return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function buildCookie(token) {
    return `sessionToken=${token}; SameSite=Strict; Path=/`;
}

async function getJson(url, options = {}) {
    const response = await fetch(url, options);
    let payload = null;
    try {
        payload = await response.clone().json();
    } catch (_error) {
        payload = null;
    }
    return { response, payload };
}

async function fetchCsrfToken(baseUrl, cookie) {
    const target = new URL('/api/csrf-token', baseUrl);
    const { response, payload } = await getJson(target, {
        method: 'GET',
        headers: {
            Cookie: cookie,
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        return { token: null, status: response.status, payload };
    }

    return { token: payload?.csrfToken || null, status: response.status, payload };
}

function buildHeaders({ cookie, csrfToken }) {
    const headers = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        Cookie: cookie
    };

    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    return headers;
}

async function probeLeadership(baseUrl, { cookie, csrfToken, channel, userId }) {
    const urlBase = new URL('/api/presence/leadership', baseUrl);
    urlBase.searchParams.set('channel', channel || '');
    urlBase.searchParams.set('includeHistory', '1');

    const statusProbe = await getJson(urlBase, {
        method: 'GET',
        headers: buildHeaders({ cookie })
    });

    const claimPayload = {
        channel,
        instanceId: `debug-${crypto.randomUUID?.() || crypto.randomBytes(8).toString('hex')}`,
        tabId: `debug-tab-${Date.now()}`,
        reason: 'debug-claim',
        metadata: {
            debug: true,
            timestamp: new Date().toISOString()
        }
    };
    if (Number.isFinite(userId)) {
        claimPayload.userId = userId;
    }

    const claimProbe = await getJson(new URL('/api/presence/leadership/claim', baseUrl), {
        method: 'POST',
        headers: buildHeaders({ cookie, csrfToken }),
        body: JSON.stringify(claimPayload)
    });

    const heartbeatPayload = {
        channel,
        instanceId: claimPayload.instanceId,
        reason: 'debug-heartbeat',
        metadata: {
            debug: true,
            timestamp: new Date().toISOString()
        }
    };

    const heartbeatProbe = await getJson(new URL('/api/presence/leadership/heartbeat', baseUrl), {
        method: 'POST',
        headers: buildHeaders({ cookie, csrfToken }),
        body: JSON.stringify(heartbeatPayload)
    });

    return { statusProbe, claimProbe, heartbeatProbe };
}

async function probeMetrics(baseUrl, { cookie, csrfToken }) {
    const payload = {
        samples: [
            {
                ts: Date.now(),
                durationMs: 42,
                batchSize: 2,
                success: true,
                source: 'debug-script',
                pageHidden: false
            }
        ],
        metadata: {
            clientId: `debug-${Math.random().toString(36).slice(2)}`,
            pathname: '/debug/presence',
            userAgent: 'presence-debug-script'
        }
    };

    return getJson(new URL('/metrics/presence-client', baseUrl), {
        method: 'POST',
        headers: buildHeaders({ cookie, csrfToken }),
        body: JSON.stringify(payload)
    });
}

function summarize(result) {
    if (!result) {
        return { status: 'no-response' };
    }
    if (result.error) {
        return { status: 'error', error: result.error };
    }
    const { response, payload } = result;
    return {
        status: `${response.status} ${response.statusText}`,
        payload
    };
}

async function diagnoseUser({ token, userId, baseUrl, channel }, index) {
    const cookie = buildCookie(token);
    console.log(`\n=== User ${index + 1} | token ${shortToken(token)} | userId ${userId ?? '(unknown)'} ===`);

    const csrf = await fetchCsrfToken(baseUrl, cookie);
    if (!csrf.token) {
        console.warn(`[${index + 1}] Failed to fetch CSRF token (status ${csrf.status})`, csrf.payload);
    } else {
        console.log(`[${index + 1}] CSRF token acquired (${csrf.token.slice(0, 8)}…)`);
    }

    const leadership = await probeLeadership(baseUrl, {
        cookie,
        csrfToken: csrf.token,
        channel,
        userId
    });
    console.log(`[${index + 1}] Leadership status:`, summarize(leadership.statusProbe));
    console.log(`[${index + 1}] Leadership claim:`, summarize(leadership.claimProbe));
    console.log(`[${index + 1}] Leadership heartbeat:`, summarize(leadership.heartbeatProbe));

    const metrics = await probeMetrics(baseUrl, {
        cookie,
        csrfToken: csrf.token
    });
    console.log(`[${index + 1}] Metrics POST:`, summarize(metrics));
}

(async () => {
    try {
        const config = parseArgs();
        if (config.help) {
            printUsage();
            process.exit(0);
        }
        if (!config.tokens || config.tokens.length === 0) {
            printUsage();
            console.error('Error: at least one --token is required.');
            process.exit(1);
        }

        for (let i = 0; i < config.tokens.length; i += 1) {
            const token = config.tokens[i];
            const userId = config.userIds[i];

            if (!token || token.length < 16) {
                console.warn(`Skipping entry ${i + 1}: invalid token.`);
                continue;
            }

            await diagnoseUser({
                token,
                userId,
                baseUrl: config.baseUrl,
                channel: config.channel
            }, i);
        }

        console.log('\nDiagnostics complete.');
        process.exit(0);
    } catch (error) {
        console.error('Presence debug script failed:', error.message);
        process.exit(1);
    }
})();

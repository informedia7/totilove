/**
 * Resolve where admin-server should POST uploads-import (avoid Cloudflare 502 on large ZIPs).
 */

function trimBase(url) {
    if (typeof url !== 'string') {
        return '';
    }
    return url.trim().replace(/\/$/, '');
}

/** First non-empty env wins — use Railway direct or private mesh, not the public CDN domain. */
function resolveTotilovePushBase() {
    const keys = ['TOTILOVE_BACKEND_URL', 'TOTILOVE_RAILWAY_URL', 'TOTILOVE_INTERNAL_URL', 'TOTILOVE_PRIVATE_URL'];
    for (const k of keys) {
        const v = trimBase(process.env[k]);
        if (v) {
            return v;
        }
    }
    return trimBase(process.env.TOTILOVE_URL);
}

/** True when push URL looks like a public site hostname (often behind Cloudflare) vs Railway/internal. */
function pushLikelyBehindCdn(pushUrl) {
    if (!pushUrl) {
        return false;
    }
    try {
        const { hostname } = new URL(pushUrl);
        if (!hostname) {
            return false;
        }
        if (hostname.endsWith('.railway.app')) {
            return false;
        }
        if (hostname.endsWith('.railway.internal')) {
            return false;
        }
        if (hostname === 'localhost' || /^127\.\d+\.\d+\.\d+$/.test(hostname)) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    trimTotiloveBase: trimBase,
    resolveTotilovePushBase,
    pushLikelyBehindCdn
};

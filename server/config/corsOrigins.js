/**
 * Shared CORS / Socket.IO allowed-origin resolution for deployments.
 * Env: CORS_ORIGINS or ALLOWED_ORIGINS (comma-separated), plus PUBLIC_APP_URL, APP_URL,
 * FRONTEND_URL, and https://<RAILWAY_PUBLIC_DOMAIN> when set.
 */

const DEV_LOCAL_PORTS = [3000, 3001, 5173, 8080];

function trimOrigin(value) {
    if (!value || typeof value !== 'string') {
        return '';
    }
    const t = value.trim();
    if (!t) {
        return '';
    }
    try {
        const u = new URL(t);
        return `${u.protocol}//${u.host}`;
    } catch {
        return t.replace(/\/+$/, '');
    }
}

function splitCommaList(raw) {
    if (!raw || typeof raw !== 'string') {
        return [];
    }
    return raw
        .split(',')
        .map((s) => trimOrigin(s))
        .filter(Boolean);
}

/**
 * Origins from env only (no same-host inference, no dev localhost extras).
 */
function getEnvConfiguredOrigins() {
    const out = [];
    const push = (o) => {
        const n = trimOrigin(o);
        if (n && !out.includes(n)) {
            out.push(n);
        }
    };

    splitCommaList(process.env.CORS_ORIGINS).forEach(push);
    splitCommaList(process.env.ALLOWED_ORIGINS).forEach(push);

    [
        process.env.PUBLIC_APP_URL,
        process.env.APP_URL,
        process.env.FRONTEND_URL
    ].forEach(push);

    const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
    if (railway && String(railway).trim()) {
        const host = String(railway).trim().replace(/^https?:\/\//i, '');
        push(`https://${host}`);
    }

    return out;
}

function getDevelopmentLocalhostOrigins() {
    if (process.env.NODE_ENV === 'production') {
        return [];
    }
    const port = Number(process.env.PORT) || 3001;
    const ports = [...new Set([port, ...DEV_LOCAL_PORTS])];
    const out = [];
    for (const p of ports) {
        out.push(`http://localhost:${p}`, `http://127.0.0.1:${p}`);
    }
    return out;
}

/**
 * All origins we allow for CORS / Socket.IO (env + non-production localhost helpers).
 */
function getAllConfiguredOrigins() {
    const env = getEnvConfiguredOrigins();
    const dev = getDevelopmentLocalhostOrigins();
    const merged = [...env];
    dev.forEach((o) => {
        if (!merged.includes(o)) {
            merged.push(o);
        }
    });
    return merged;
}

let warnedProductionEmpty = false;

function warnProductionWithoutExplicitOrigins() {
    if (process.env.NODE_ENV !== 'production' || warnedProductionEmpty) {
        return;
    }
    if (getEnvConfiguredOrigins().length > 0) {
        return;
    }
    warnedProductionEmpty = true;
    console.warn(
        '[CORS] Production is running without CORS_ORIGINS, ALLOWED_ORIGINS, PUBLIC_APP_URL, APP_URL, FRONTEND_URL, or RAILWAY_PUBLIC_DOMAIN. ' +
            'Cross-origin browser clients will not receive CORS headers unless Origin matches this server. ' +
            'Set one or more of those variables for separate frontends or APIs.'
    );
}

function sameHostOriginVariants(hostHeader, protocol) {
    if (!hostHeader) {
        return [];
    }
    const host = String(hostHeader).split(',')[0].trim();
    const proto = protocol === 'https' ? 'https' : 'http';
    const set = new Set([
        `${proto}://${host}`,
        `http://${host}`,
        `https://${host}`
    ]);
    return [...set];
}

/**
 * Whether an Origin header should be allowed for CORS / Socket.IO.
 * @param {string|undefined} originHeader - Request Origin (may be undefined)
 * @param {{ host?: string, protocol?: string }} [reqLike] - For same-host allowance
 */
function isOriginAllowed(originHeader, reqLike = {}) {
    if (!originHeader) {
        return true;
    }

    const normalized = trimOrigin(originHeader);
    if (!normalized) {
        return true;
    }

    const configured = getAllConfiguredOrigins();
    if (configured.includes(normalized)) {
        return true;
    }

    const { host, protocol } = reqLike;
    if (host) {
        const variants = sameHostOriginVariants(host, protocol);
        if (variants.includes(normalized)) {
            return true;
        }
    }

    return false;
}

/**
 * Express cors package origin callback; use inside app.use((req,res,next)=> cors({...})(req,res,next)).
 */
function createCorsOriginCallback(req) {
    return (origin, callback) => {
        const allowed = isOriginAllowed(origin, {
            host: req.headers.host,
            protocol: req.protocol
        });
        callback(null, allowed);
    };
}

const CORS_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function createPerRequestCorsMiddleware() {
    const cors = require('cors');
    return cors((req, callback) => {
        callback(null, {
            origin: createCorsOriginCallback(req),
            methods: CORS_METHODS,
            credentials: true,
            optionsSuccessStatus: 200
        });
    });
}

/**
 * Engine.IO / Socket.IO `cors` option: dynamic delegate so each handshake sees Host + protocol
 * (same rules as Express CORS).
 */
function createEngineIoCorsDelegate() {
    return (req, callback) => {
        const forwarded = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
        const protocol =
            forwarded ||
            (req.socket && req.socket.encrypted ? 'https' : 'http');
        callback(null, {
            origin: (requestOrigin, originCb) => {
                originCb(
                    null,
                    isOriginAllowed(requestOrigin, {
                        host: req.headers.host,
                        protocol
                    })
                );
            },
            credentials: true,
            methods: CORS_METHODS,
            optionsSuccessStatus: 200
        });
    };
}

module.exports = {
    getEnvConfiguredOrigins,
    getAllConfiguredOrigins,
    warnProductionWithoutExplicitOrigins,
    isOriginAllowed,
    createPerRequestCorsMiddleware,
    createEngineIoCorsDelegate,
    CORS_METHODS,
    trimOrigin,
    sameHostOriginVariants
};

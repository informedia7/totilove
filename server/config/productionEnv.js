/**
 * Production startup checks: strong secrets and minimal env hygiene.
 * Loads config defaults via explicit reads — main app already ran dotenv via config/config.js.
 */

const config = require('../../config/config');
const { getEnvConfiguredOrigins } = require('./corsOrigins');

const WEAK_SECRET_EXACT = new Set(
    [
        'jwt-secret-key',
        'lightning-secret-key',
        'change_this_jwt_secret',
        'change_this_secret',
        'secret',
        'password',
        'test',
        'development'
    ].map((s) => s.toLowerCase())
);

function isWeakSecret(name, value) {
    if (!value || typeof value !== 'string') {
        return 'missing';
    }
    const t = value.trim();
    if (t.length < 32) {
        return 'short';
    }
    const lower = t.toLowerCase();
    if (WEAK_SECRET_EXACT.has(lower)) {
        return 'known-default';
    }
    if (/^123_jwt/.test(lower) || lower.includes('change_this')) {
        return 'pattern';
    }
    return null;
}

/**
 * Call after config is loadable. Exits process in production if checks fail.
 */
function assertProductionEnvironment() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }

    const allowWeak = process.env.ALLOW_WEAK_SECRETS_IN_PRODUCTION === 'true';

    const jwt = config?.security?.jwtSecret || process.env.JWT_SECRET || '';
    const session = config?.session?.secret || process.env.SESSION_SECRET || '';

    const failures = [];
    for (const [label, val] of [
        ['JWT_SECRET', jwt],
        ['SESSION_SECRET', session]
    ]) {
        const why = isWeakSecret(label, val);
        if (why) {
            failures.push({ label, why });
        }
    }

    if (failures.length === 0) {
        return;
    }

    const detail = failures.map((f) => `${f.label} (${f.why})`).join(', ');
    if (allowWeak) {
        console.warn(
            `[productionEnv] ALLOW_WEAK_SECRETS_IN_PRODUCTION=true — weak secrets detected (${detail}). Fix before real traffic.`
        );
        return;
    }

    console.error(
        `[productionEnv] Refusing to start: set strong JWT_SECRET and SESSION_SECRET (>= 32 chars, not defaults). Issues: ${detail}`
    );
    console.error('[productionEnv] Run: npm run secrets:generate');
    process.exit(1);
}

/**
 * Optional strict mode: require explicit CORS allowlist (comma-separated origins in env).
 * Set REQUIRE_EXPLICIT_CORS_ORIGINS_IN_PRODUCTION=true when browsers hit the API from another origin.
 */
function assertProductionCorsOrigins() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    if (process.env.REQUIRE_EXPLICIT_CORS_ORIGINS_IN_PRODUCTION !== 'true') {
        return;
    }
    const origins = getEnvConfiguredOrigins();
    if (origins.length > 0) {
        return;
    }
    console.error(
        '[productionEnv] REQUIRE_EXPLICIT_CORS_ORIGINS_IN_PRODUCTION=true but no origins found. ' +
            'Set CORS_ORIGINS or ALLOWED_ORIGINS (comma-separated HTTPS origins), or PUBLIC_APP_URL / APP_URL.'
    );
    process.exit(1);
}

/**
 * Optional: public site URL must use HTTPS (except localhost / 127.0.0.1).
 */
function assertProductionHttpsBaseUrl() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    if (process.env.REQUIRE_HTTPS_PUBLIC_BASE_URL_IN_PRODUCTION !== 'true') {
        return;
    }
    const base = (process.env.BASE_URL || '').trim();
    if (!base) {
        console.error('[productionEnv] REQUIRE_HTTPS_PUBLIC_BASE_URL_IN_PRODUCTION=true but BASE_URL is empty');
        process.exit(1);
    }
    try {
        const u = new URL(base);
        const host = u.hostname || '';
        const isLocal =
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host.endsWith('.local');
        if (u.protocol === 'http:' && !isLocal) {
            console.error(
                '[productionEnv] BASE_URL must use https:// in production when REQUIRE_HTTPS_PUBLIC_BASE_URL_IN_PRODUCTION=true'
            );
            process.exit(1);
        }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') {
            console.error('[productionEnv] BASE_URL must be a valid http(s) URL');
            process.exit(1);
        }
    } catch {
        console.error('[productionEnv] BASE_URL is not a valid URL');
        process.exit(1);
    }
}

/**
 * Fail fast if Redis is mandatory but not configured (before connection attempt).
 */
function assertRedisDeclaredIfRequired() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    if (process.env.REDIS_REQUIRED_IN_PRODUCTION !== 'true') {
        return;
    }
    const url = (process.env.REDIS_URL || '').trim();
    const host = (process.env.REDIS_HOST || '').trim();
    if (!url && !host) {
        console.error(
            '[productionEnv] REDIS_REQUIRED_IN_PRODUCTION=true — set REDIS_URL or REDIS_HOST (and PORT if needed)'
        );
        process.exit(1);
    }
}

/**
 * Require a non-empty database password and refuse obvious development defaults.
 */
function assertProductionDatabaseCredentials() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    const url = String(process.env.DATABASE_URL || '').trim();
    const pwd = String(process.env.PGPASSWORD || process.env.DB_PASSWORD || '').trim();

    if (!pwd && !url) {
        console.error(
            '[productionEnv] Set DATABASE_URL (preferred on Railway) or DB_PASSWORD/PGPASSWORD in production.'
        );
        process.exit(1);
    }

    // If using DATABASE_URL, pg parses credentials from the URL.
    if (!pwd && url) {
        return;
    }

    const lower = pwd.toLowerCase();
    if (lower === 'password' || lower === 'postgres' || lower === 'admin') {
        console.error(
            '[productionEnv] Refusing to start with a trivial database password. Use a strong unique secret.'
        );
        process.exit(1);
    }
}

/**
 * Require BASE_URL for absolute links (email, redirects). Opt out only if you know the impact.
 */
function assertProductionBaseUrl() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    if (process.env.ALLOW_MISSING_BASE_URL_IN_PRODUCTION === 'true') {
        return;
    }
    const base = (process.env.BASE_URL || '').trim();
    if (!base) {
        console.error(
            '[productionEnv] Set BASE_URL to your public https:// origin (or ALLOW_MISSING_BASE_URL_IN_PRODUCTION=true if intentional).'
        );
        process.exit(1);
    }
}

/**
 * Non-fatal warnings for production configuration.
 */
/**
 * Uploads must persist on a mounted volume in production (Railway etc.).
 * Set UPLOADS_PATH to the volume Mount Path (often /app/app/uploads).
 * Opt out only with ALLOW_EPHEMERAL_UPLOADS_IN_PRODUCTION=true (files lost on redeploy).
 */
function assertProductionUploadsVolume() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    if (process.env.ALLOW_EPHEMERAL_UPLOADS_IN_PRODUCTION === 'true') {
        console.warn(
            '[productionEnv] ALLOW_EPHEMERAL_UPLOADS_IN_PRODUCTION=true — uploads may use container disk and be lost on restart.'
        );
        return;
    }
    const uploadsPath = (process.env.UPLOADS_PATH || '').trim();
    if (!uploadsPath) {
        console.error(
            '[productionEnv] Set UPLOADS_PATH to your persistent volume directory (Railway: same as the volume Mount Path, often /app/app/uploads). ' +
                'Without UPLOADS_PATH uploads will not target your volume. To skip: ALLOW_EPHEMERAL_UPLOADS_IN_PRODUCTION=true.'
        );
        process.exit(1);
    }
}

function warnProductionConfiguration() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }

    const base = (process.env.BASE_URL || '').trim();
    if (base.startsWith('http://') && !/localhost|127\.0\.0\.1/i.test(base)) {
        console.warn('[productionEnv] BASE_URL uses http:// on a non-local host — use https in production.');
    }

    if (process.env.RATE_LIMIT_REDIS_REQUIRED === 'true') {
        return;
    }
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
        console.warn('[productionEnv] No REDIS_URL / REDIS_HOST — rate limits and Socket adapter may be degraded.');
    }
}

module.exports = {
    assertProductionEnvironment,
    assertProductionCorsOrigins,
    assertProductionHttpsBaseUrl,
    assertRedisDeclaredIfRequired,
    assertProductionDatabaseCredentials,
    assertProductionBaseUrl,
    assertProductionUploadsVolume,
    warnProductionConfiguration
};

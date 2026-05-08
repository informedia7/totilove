/**
 * Database Configuration Module
 * Handles PostgreSQL connection setup
 */

const { Pool } = require('pg');

function resolveDatabaseUrl() {
    const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
    return url ? url : null;
}

function resolvePgPassword() {
    const pwd = process.env.PGPASSWORD ?? process.env.DB_PASSWORD;
    if (pwd !== undefined && pwd !== null && String(pwd).length > 0) {
        return String(pwd);
    }
    if (process.env.NODE_ENV === 'production') {
        return undefined;
    }
    return 'password';
}

function buildSslOption() {
    const pgSslMode = String(process.env.PGSSLMODE || '').toLowerCase();
    const dbSslExplicit = process.env.DB_SSL === 'true';
    const pgSslRequired = pgSslMode === 'require' || pgSslMode === 'verify-ca' || pgSslMode === 'verify-full';
    const railwayLikely = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;
    const prod = process.env.NODE_ENV === 'production';

    // Railway's Postgres typically requires SSL. Auto-enable in prod/railway when DATABASE_URL is present,
    // but still allow opting out explicitly (DB_SSL=false).
    const dbSslOptOut = process.env.DB_SSL === 'false';
    const shouldEnable = (dbSslExplicit || pgSslRequired || ((railwayLikely || prod) && !!resolveDatabaseUrl())) && !dbSslOptOut;

    if (!shouldEnable) {
        return undefined;
    }
    const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
    const ca = process.env.DB_SSL_CA;
    const ssl = { rejectUnauthorized };
    if (ca && String(ca).trim()) {
        ssl.ca = String(ca).replace(/\\n/g, '\n');
    }
    return ssl;
}

/**
 * Setup database connection with high-load configuration
 * @returns {Promise<Pool>} Database pool instance
 */
async function setupDatabase() {
    const databaseUrl = resolveDatabaseUrl();
    const password = resolvePgPassword();
    if (!databaseUrl && process.env.NODE_ENV === 'production' && (password === undefined || password === '')) {
        console.error(
            '❌ Database password missing in production (set DATABASE_URL or DB_PASSWORD/PGPASSWORD).'
        );
        process.exit(1);
    }

    const ssl = buildSslOption();

    const poolConfig = databaseUrl
        ? {
              connectionString: databaseUrl,
              max: 20,
              min: 5,
              idleTimeoutMillis: 30010,
              connectionTimeoutMillis: 5000,
              statement_timeout: 10000,
              query_timeout: 10000,
              application_name: 'lightning_server',
              keepAlive: true,
              keepAliveInitialDelayMillis: 5000,
              allowExitOnIdle: false,
              maxUses: 7500
          }
        : {
              host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
              user: process.env.PGUSER || process.env.DB_USER || 'postgres',
              password,
              database: process.env.PGDATABASE || process.env.DB_NAME || 'totilove1',
              port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
        max: 20,
        min: 5,
        idleTimeoutMillis: 30010,
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000,
        query_timeout: 10000,
        application_name: 'lightning_server',
        keepAlive: true,
        keepAliveInitialDelayMillis: 5000,
        allowExitOnIdle: false,
        maxUses: 7500
          };

    if (ssl !== undefined) {
        poolConfig.ssl = ssl;
    }

    const db = new Pool(poolConfig);

    try {
        await db.query('SELECT NOW()');
        console.log('✅ Database connection established');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        if (databaseUrl) {
            console.error(
                '   Using DATABASE_URL. If this is Railway Postgres, ensure DB_SSL=true (or PGSSLMODE=require) and the Postgres plugin is linked.'
            );
        } else {
            console.error(
                '   Using host/user/password env vars. Ensure DB_HOST/DB_USER/DB_PASSWORD/DB_NAME (or PG* equivalents) are set.'
            );
        }
        process.exit(1);
    }

    return db;
}

module.exports = { setupDatabase };

/**
 * Database Configuration Module
 * Handles PostgreSQL connection setup
 */

const { Pool } = require('pg');

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
    if (process.env.DB_SSL !== 'true') {
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
    const password = resolvePgPassword();
    if (process.env.NODE_ENV === 'production' && (password === undefined || password === '')) {
        console.error('❌ Database password missing in production (set DB_PASSWORD or PGPASSWORD).');
        process.exit(1);
    }

    const ssl = buildSslOption();

    const poolConfig = {
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
        process.exit(1);
    }

    return db;
}

module.exports = { setupDatabase };

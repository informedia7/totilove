/**
 * Database Configuration Module
 * Handles PostgreSQL connection setup
 */

const { Pool } = require('pg');

function normalizeSslConfig() {
    if (process.env.DB_SSL === 'true' || process.env.PGSSLMODE === 'require') {
        return { rejectUnauthorized: false };
    }

    return false;
}

function createDatabaseConfig() {
    const ssl = normalizeSslConfig();
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL;

    const baseConfig = {
        // High performance settings for concurrent users
        max: 20,
        min: Number(process.env.DB_POOL_MIN || 2),
        idleTimeoutMillis: 30010,
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000,
        query_timeout: 10000,
        application_name: 'lightning_server',
        keepAlive: true,
        keepAliveInitialDelayMillis: 5000,
        allowExitOnIdle: false,
        maxUses: 7500,
    };

    if (connectionString) {
        return {
            ...baseConfig,
            connectionString,
            ssl
        };
    }

    return {
        ...baseConfig,
        host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
        port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
        user: process.env.DB_USER || process.env.PGUSER || 'postgres',
        password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'password',
        database: process.env.DB_NAME || process.env.PGDATABASE || 'totilove',
        ssl
    };
}

/**
 * Setup database connection with high-load configuration
 * @returns {Promise<Pool>} Database pool instance
 */
async function setupDatabase() {
    const db = new Pool(createDatabaseConfig());

    try {
        await db.query('SELECT NOW()');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('   Checked DATABASE_URL/POSTGRES_URL first, then DB_* / PG* variables');
        process.exit(1);
    }
    
    return db;
}

module.exports = { setupDatabase };








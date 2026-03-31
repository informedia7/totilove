/**
 * Database Configuration Module
 * Handles PostgreSQL connection setup
 */

const { Pool } = require('pg');

/**
 * Setup database connection with high-load configuration
 * @returns {Promise<Pool>} Database pool instance
 */
async function setupDatabase() {
    const usingConnectionString = !!process.env.DATABASE_URL;
    const dbConfig = {
        // High performance settings for concurrent users
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
        maxUses: 7500,
    };

    if (usingConnectionString) {
        dbConfig.connectionString = process.env.DATABASE_URL;
        dbConfig.ssl = process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false;
    } else {
        dbConfig.host = process.env.DB_HOST || 'localhost';
        dbConfig.user = process.env.DB_USER || 'postgres';
        dbConfig.password = process.env.DB_PASSWORD || 'password';
        dbConfig.database = process.env.DB_NAME || 'totilove';
        dbConfig.port = parseInt(process.env.DB_PORT || '5432', 10);
    }

    const db = new Pool(dbConfig);

    try {
        await db.query('SELECT NOW()');
        console.info(`✅ Database connected (${usingConnectionString ? 'DATABASE_URL' : 'DB_* variables'})`);
    } catch (error) {
        console.error('❌ Database connection failed during startup');
        console.error(`   message: ${error.message}`);
        if (!usingConnectionString) {
            console.error('   expected vars: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
            console.error(`   actual host: ${process.env.DB_HOST || 'localhost'}, db: ${process.env.DB_NAME || 'totilove'}`);
        } else {
            console.error('   using DATABASE_URL from environment');
        }
        process.exit(1);
    }
    
    return db;
}

module.exports = { setupDatabase };








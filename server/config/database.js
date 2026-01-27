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
    const useSSL = process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production';

    const db = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'totilove',
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
        ssl: useSSL ? { rejectUnauthorized: false } : false,
    });

    try {
        await db.query('SELECT NOW()');
    } catch (error) {
        // Database connection failed
        process.exit(1);
    }
    
    return db;
}

module.exports = { setupDatabase };








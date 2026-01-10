const { Pool } = require('pg');
require('dotenv').config();

// Create a separate database connection pool for admin server
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'totilove',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
    console.log('Admin Server: Database connection established');
});

pool.on('error', (err) => {
    console.error('Admin Server: Unexpected database error:', err);
});

// Query helper
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        if (process.env.NODE_ENV === 'development') {
            console.log('Admin Server: Query executed', { text, duration, rows: res.rowCount });
        }
        return res;
    } catch (error) {
        console.error('Admin Server: Database query error:', error);
        throw error;
    }
};

// Health check
const healthCheck = async () => {
    try {
        const result = await pool.query('SELECT NOW()');
        return {
            status: 'healthy',
            timestamp: result.rows[0].now
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message
        };
    }
};

module.exports = {
    pool,
    query,
    healthCheck
};





















































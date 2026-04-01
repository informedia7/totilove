const { Pool } = require('pg');
const config = require('./config');

class DatabaseManager {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            console.log('🔄 Setting up ultra-high performance database for 10K+ users...');
            
            this.pool = new Pool(config.database);
            
            // Test connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            
            this.isConnected = true;
            console.log('✅ Lightning database connected (10K+ mode)');
            
            // Set up connection event handlers
            this.pool.on('error', (err) => {
                console.error('❌ Database pool error:', err);
                this.isConnected = false;
            });
            
            this.pool.on('connect', () => {
                console.log('🔗 New database connection established');
            });
            
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            this.isConnected = false;
            throw error;
        }
    }

    async disconnect() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            console.log('🔌 Database connection closed');
        }
    }

    getPool() {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
        return this.pool;
    }

    async query(text, params = []) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
        
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            
            // Log slow queries
            if (duration > 1000) {
                console.warn(`🐌 Slow query (${duration}ms):`, text.substring(0, 100) + '...');
            }
            
            return result;
        } catch (error) {
            console.error('❌ Database query error:', error);
            throw error;
        }
    }

    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Health check method
    async healthCheck() {
        try {
            const result = await this.query('SELECT NOW() as timestamp, version() as version');
            return {
                status: 'healthy',
                timestamp: result.rows[0].timestamp,
                version: result.rows[0].version,
                connections: this.pool.totalCount,
                idle: this.pool.idleCount,
                waiting: this.pool.waitingCount
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    // Connection pool statistics
    getStats() {
        if (!this.pool) return null;
        
        return {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount,
            isConnected: this.isConnected
        };
    }
}

// Singleton instance
const databaseManager = new DatabaseManager();

module.exports = databaseManager; 
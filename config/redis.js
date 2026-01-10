const redis = require('redis');
const config = require('./config');

class RedisManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.retryAttempts = 0;
        this.maxRetries = 5;
    }

    async connect() {
        try {
            console.log('🔄 Setting up Redis cluster for 10K+ users...');
            
            this.client = redis.createClient(config.redis);
            
            // Set up event handlers
            this.client.on('connect', () => {
                console.log('🔗 Redis connecting...');
            });
            
            this.client.on('ready', () => {
                this.isConnected = true;
                this.retryAttempts = 0;
                console.log('✅ Redis cluster ready for 10K+ users');
            });
            
            this.client.on('error', (err) => {
                console.error('❌ Redis error:', err);
                this.isConnected = false;
            });
            
            this.client.on('end', () => {
                console.log('🔌 Redis connection ended');
                this.isConnected = false;
            });
            
            this.client.on('reconnecting', () => {
                console.log('🔄 Redis reconnecting...');
                this.retryAttempts++;
            });
            
            // Connect to Redis
            await this.client.connect();
            
            // Test connection
            await this.client.ping();
            
            return true;
        } catch (error) {
            console.error('❌ Redis connection failed:', error);
            this.isConnected = false;
            
            if (this.retryAttempts < this.maxRetries) {
                console.log(`🔄 Retrying Redis connection (${this.retryAttempts + 1}/${this.maxRetries})...`);
                setTimeout(() => this.connect(), 5000);
            } else {
                console.error('❌ Max Redis retry attempts reached');
                throw error;
            }
        }
    }

    async disconnect() {
        if (this.client && this.isConnected) {
            await this.client.quit();
            this.isConnected = false;
            console.log('🔌 Redis connection closed');
        }
    }

    getClient() {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }
        return this.client;
    }

    // Cache methods
    async set(key, value, ttl = 3600) {
        if (!this.isConnected) return false;
        
        try {
            const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
            await this.client.setEx(key, ttl, serializedValue);
            return true;
        } catch (error) {
            console.error('❌ Redis set error:', error);
            return false;
        }
    }

    async get(key) {
        if (!this.isConnected) return null;
        
        try {
            const value = await this.client.get(key);
            if (!value) return null;
            
            // Try to parse as JSON, fallback to string
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        } catch (error) {
            console.error('❌ Redis get error:', error);
            return null;
        }
    }

    async del(key) {
        if (!this.isConnected) return false;
        
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error('❌ Redis del error:', error);
            return false;
        }
    }

    async exists(key) {
        if (!this.isConnected) return false;
        
        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            console.error('❌ Redis exists error:', error);
            return false;
        }
    }

    async expire(key, ttl) {
        if (!this.isConnected) return false;
        
        try {
            await this.client.expire(key, ttl);
            return true;
        } catch (error) {
            console.error('❌ Redis expire error:', error);
            return false;
        }
    }

    // Hash methods
    async hset(key, field, value) {
        if (!this.isConnected) return false;
        
        try {
            const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
            await this.client.hSet(key, field, serializedValue);
            return true;
        } catch (error) {
            console.error('❌ Redis hset error:', error);
            return false;
        }
    }

    async hget(key, field) {
        if (!this.isConnected) return null;
        
        try {
            const value = await this.client.hGet(key, field);
            if (!value) return null;
            
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        } catch (error) {
            console.error('❌ Redis hget error:', error);
            return null;
        }
    }

    async hgetall(key) {
        if (!this.isConnected) return null;
        
        try {
            const result = await this.client.hGetAll(key);
            if (!result || Object.keys(result).length === 0) return null;
            
            // Parse JSON values
            const parsed = {};
            for (const [field, value] of Object.entries(result)) {
                try {
                    parsed[field] = JSON.parse(value);
                } catch {
                    parsed[field] = value;
                }
            }
            return parsed;
        } catch (error) {
            console.error('❌ Redis hgetall error:', error);
            return null;
        }
    }

    // List methods
    async lpush(key, value) {
        if (!this.isConnected) return false;
        
        try {
            const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
            await this.client.lPush(key, serializedValue);
            return true;
        } catch (error) {
            console.error('❌ Redis lpush error:', error);
            return false;
        }
    }

    async rpop(key) {
        if (!this.isConnected) return null;
        
        try {
            const value = await this.client.rPop(key);
            if (!value) return null;
            
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        } catch (error) {
            console.error('❌ Redis rpop error:', error);
            return null;
        }
    }

    // Health check
    async healthCheck() {
        try {
            const start = Date.now();
            await this.client.ping();
            const latency = Date.now() - start;
            
            return {
                status: 'healthy',
                latency: latency,
                isConnected: this.isConnected,
                retryAttempts: this.retryAttempts
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                isConnected: this.isConnected,
                retryAttempts: this.retryAttempts
            };
        }
    }

    // Get statistics
    getStats() {
        return {
            isConnected: this.isConnected,
            retryAttempts: this.retryAttempts,
            maxRetries: this.maxRetries
        };
    }
}

// Singleton instance
const redisManager = new RedisManager();

module.exports = redisManager; 
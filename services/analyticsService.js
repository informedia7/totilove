class AnalyticsService {
    constructor(db, redis) {
        this.db = db;
        this.redis = redis;
        this.cacheExpiry = 600; // 10 minutes for analytics data
    }

    async getDashboardStats() {
        const cacheKey = 'dashboard:stats';
        
        try {
            // Try to get from cache first
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            const stats = await Promise.all([
                this.getUserStats(),
                this.getActivityStats(),
                this.getSystemStats(),
                this.getRevenueStats()
            ]);

            const result = {
                users: stats[0],
                activity: stats[1],
                system: stats[2],
                revenue: stats[3],
                timestamp: new Date().toISOString()
            };

            // Cache the result
            await this.redis.setex(cacheKey, this.cacheExpiry, JSON.stringify(result));

            return result;
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            throw error;
        }
    }

    async getUserStats() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN DATE(date_joined) = DATE(NOW()) THEN 1 END) as new_users_today,
                    COUNT(CASE WHEN DATE(date_joined) = DATE(NOW() - INTERVAL '1 day') THEN 1 END) as new_users_yesterday,
                    COUNT(CASE WHEN last_login > NOW() - INTERVAL '24 hours' THEN 1 END) as active_users_24h,
                    COUNT(CASE WHEN last_login > NOW() - INTERVAL '7 days' THEN 1 END) as active_users_7d,
                    COUNT(CASE WHEN last_login > NOW() - INTERVAL '30 days' THEN 1 END) as active_users_30d,
                    COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
                    COUNT(CASE WHEN is_banned = true THEN 1 END) as banned_users,
                    COUNT(CASE WHEN gender = 'male' THEN 1 END) as male_users,
                    COUNT(CASE WHEN gender = 'female' THEN 1 END) as female_users,
                    COUNT(CASE WHEN gender = 'other' THEN 1 END) as other_gender_users,
                    AVG(EXTRACT(YEAR FROM AGE(birthdate))) as avg_age
                FROM users
            `;

            const result = await this.db.query(query);
            return result.rows[0];
        } catch (error) {
            console.error('Error fetching user stats:', error);
            throw error;
        }
    }

    async getActivityStats() {
        try {
            const query = `
                SELECT 
                    (SELECT COUNT(*) FROM user_messages WHERE created_at > NOW() - INTERVAL '24 hours') as messages_24h,
                    (SELECT COUNT(*) FROM user_messages WHERE created_at > NOW() - INTERVAL '7 days') as messages_7d,
                    (SELECT COUNT(*) FROM users_likes WHERE created_at > NOW() - INTERVAL '24 hours') as likes_24h,
                    (SELECT COUNT(*) FROM users_likes WHERE created_at > NOW() - INTERVAL '7 days') as likes_7d,
                    (SELECT COUNT(*) FROM user_images WHERE uploaded_at > NOW() - INTERVAL '24 hours') as images_24h,
                    (SELECT COUNT(*) FROM user_images WHERE uploaded_at > NOW() - INTERVAL '7 days') as images_7d,
                    (SELECT COUNT(DISTINCT sender_id) FROM user_messages WHERE timestamp > NOW() - INTERVAL '24 hours') as active_senders_24h,
                    (SELECT COUNT(DISTINCT liked_by) FROM users_likes WHERE created_at > NOW() - INTERVAL '24 hours') as active_likers_24h
                FROM users LIMIT 1
            `;

            const result = await this.db.query(query);
            return result.rows[0];
        } catch (error) {
            console.error('Error fetching activity stats:', error);
            throw error;
        }
    }

    async getSystemStats() {
        try {
            const dbHealth = await this.db.healthCheck();
            const redisInfo = await this.redis.info();
            
            return {
                database: {
                    status: dbHealth.status,
                    connections: dbHealth.connections,
                    idle: dbHealth.idle,
                    waiting: dbHealth.waiting
                },
                redis: {
                    status: 'connected',
                    info: redisInfo
                },
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error fetching system stats:', error);
            throw error;
        }
    }

    async getRevenueStats() {
        try {
            // Placeholder for revenue stats - implement based on your billing system
            return {
                total_revenue: 0,
                monthly_revenue: 0,
                premium_users: 0,
                conversion_rate: 0
            };
        } catch (error) {
            console.error('Error fetching revenue stats:', error);
            throw error;
        }
    }

    async getUserGrowthData(period = '30d') {
        const cacheKey = `analytics:user-growth:${period}`;
        
        try {
            // Try to get from cache first
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            let interval;
            let groupBy;
            
            switch (period) {
                case '7d':
                    interval = '7 days';
                    groupBy = 'DATE(date_joined)';
                    break;
                case '30d':
                    interval = '30 days';
                    groupBy = 'DATE(date_joined)';
                    break;
                case '90d':
                    interval = '90 days';
                    groupBy = 'DATE(date_joined)';
                    break;
                case '1y':
                    interval = '1 year';
                    groupBy = 'DATE_TRUNC(\'month\', date_joined)';
                    break;
                default:
                    interval = '30 days';
                    groupBy = 'DATE(date_joined)';
            }

            const query = `
                SELECT 
                    ${groupBy} as date,
                    COUNT(*) as new_users,
                    SUM(COUNT(*)) OVER (ORDER BY ${groupBy}) as cumulative_users
                FROM users 
                WHERE date_joined > NOW() - INTERVAL '${interval}'
                GROUP BY ${groupBy}
                ORDER BY date
            `;

            const result = await this.db.query(query);
            const data = result.rows.map(row => ({
                date: row.date,
                new_users: parseInt(row.new_users),
                cumulative_users: parseInt(row.cumulative_users)
            }));

            // Cache the result
            await this.redis.setex(cacheKey, this.cacheExpiry, JSON.stringify(data));

            return data;
        } catch (error) {
            console.error('Error fetching user growth data:', error);
            throw error;
        }
    }

    async getActivityData(period = '7d') {
        const cacheKey = `analytics:activity:${period}`;
        
        try {
            // Try to get from cache first
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            let interval;
            let groupBy;
            
            switch (period) {
                case '24h':
                    interval = '24 hours';
                    groupBy = 'DATE_TRUNC(\'hour\', created_at)';
                    break;
                case '7d':
                    interval = '7 days';
                    groupBy = 'DATE(created_at)';
                    break;
                case '30d':
                    interval = '30 days';
                    groupBy = 'DATE(created_at)';
                    break;
                default:
                    interval = '7 days';
                    groupBy = 'DATE(created_at)';
            }

            const query = `
                SELECT 
                    ${groupBy} as date,
                    COUNT(*) as total_activities,
                    COUNT(CASE WHEN activity_type = 'message' THEN 1 END) as messages,
                    COUNT(CASE WHEN activity_type = 'like' THEN 1 END) as likes,
                    COUNT(CASE WHEN activity_type = 'login' THEN 1 END) as logins
                FROM (
                    SELECT created_at, 'message' as activity_type FROM user_messages WHERE created_at > NOW() - INTERVAL '${interval}'
                    UNION ALL
                    SELECT created_at, 'like' as activity_type FROM users_likes WHERE created_at > NOW() - INTERVAL '${interval}'
                    UNION ALL
                    SELECT last_login, 'login' as activity_type FROM users WHERE last_login > NOW() - INTERVAL '${interval}'
                ) activities
                GROUP BY ${groupBy}
                ORDER BY date
            `;

            const result = await this.db.query(query);
            const data = result.rows.map(row => ({
                date: row.date,
                total_activities: parseInt(row.total_activities),
                messages: parseInt(row.messages),
                likes: parseInt(row.likes),
                logins: parseInt(row.logins)
            }));

            // Cache the result
            await this.redis.setex(cacheKey, this.cacheExpiry, JSON.stringify(data));

            return data;
        } catch (error) {
            console.error('Error fetching activity data:', error);
            throw error;
        }
    }

    async getGeographicData() {
        const cacheKey = 'analytics:geographic';
        
        try {
            // Try to get from cache first
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            const query = `
                SELECT 
                    c.name as country,
                    COUNT(u.id) as user_count,
                    COUNT(CASE WHEN u.last_login > NOW() - INTERVAL '30 days' THEN 1 END) as active_users
                FROM users u
                LEFT JOIN country c ON u.country_id = c.id
                WHERE c.name IS NOT NULL
                GROUP BY c.id, c.name
                ORDER BY user_count DESC
                LIMIT 20
            `;

            const result = await this.db.query(query);
            const data = result.rows.map(row => ({
                country: row.country,
                user_count: parseInt(row.user_count),
                active_users: parseInt(row.active_users),
                activity_rate: parseFloat(((row.active_users / row.user_count) * 100).toFixed(2))
            }));

            // Cache the result
            await this.redis.setex(cacheKey, this.cacheExpiry, JSON.stringify(data));

            return data;
        } catch (error) {
            console.error('Error fetching geographic data:', error);
            throw error;
        }
    }

    async getDemographicsData() {
        const cacheKey = 'analytics:demographics';
        
        try {
            // Try to get from cache first
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            const query = `
                SELECT 
                    gender,
                    COUNT(*) as count,
                    AVG(EXTRACT(YEAR FROM AGE(birthdate))) as avg_age,
                    COUNT(CASE WHEN last_login > NOW() - INTERVAL '30 days' THEN 1 END) as active_count
                FROM users 
                WHERE gender IS NOT NULL AND birthdate IS NOT NULL
                GROUP BY gender
                ORDER BY count DESC
            `;

            const result = await this.db.query(query);
            const data = result.rows.map(row => ({
                gender: row.gender,
                count: parseInt(row.count),
                avg_age: parseFloat(row.avg_age),
                active_count: parseInt(row.active_count),
                activity_rate: parseFloat(((row.active_count / row.count) * 100).toFixed(2))
            }));

            // Cache the result
            await this.redis.setex(cacheKey, this.cacheExpiry, JSON.stringify(data));

            return data;
        } catch (error) {
            console.error('Error fetching demographics data:', error);
            throw error;
        }
    }

    async getEngagementMetrics() {
        const cacheKey = 'analytics:engagement';
        
        try {
            // Try to get from cache first
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            const query = `
                SELECT 
                    (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '24 hours') as daily_active_users,
                    (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '7 days') as weekly_active_users,
                    (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '30 days') as monthly_active_users,
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(*) FROM user_messages WHERE created_at > NOW() - INTERVAL '24 hours') as daily_messages,
                    (SELECT COUNT(*) FROM users_likes WHERE created_at > NOW() - INTERVAL '24 hours') as daily_likes,
                    (SELECT COUNT(DISTINCT sender_id) FROM user_messages WHERE timestamp > NOW() - INTERVAL '24 hours') as daily_message_senders,
                    (SELECT COUNT(DISTINCT liked_by) FROM users_likes WHERE created_at > NOW() - INTERVAL '24 hours') as daily_like_givers
                FROM users LIMIT 1
            `;

            const result = await this.db.query(query);
            const row = result.rows[0];
            
            const data = {
                daily_active_users: parseInt(row.daily_active_users),
                weekly_active_users: parseInt(row.weekly_active_users),
                monthly_active_users: parseInt(row.monthly_active_users),
                total_users: parseInt(row.total_users),
                daily_messages: parseInt(row.daily_messages),
                daily_likes: parseInt(row.daily_likes),
                daily_message_senders: parseInt(row.daily_message_senders),
                daily_like_givers: parseInt(row.daily_like_givers),
                dau_rate: parseFloat(((row.daily_active_users / row.total_users) * 100).toFixed(2)),
                wau_rate: parseFloat(((row.weekly_active_users / row.total_users) * 100).toFixed(2)),
                mau_rate: parseFloat(((row.monthly_active_users / row.total_users) * 100).toFixed(2)),
                avg_messages_per_user: parseFloat((row.daily_messages / row.daily_active_users).toFixed(2)),
                avg_likes_per_user: parseFloat((row.daily_likes / row.daily_active_users).toFixed(2))
            };

            // Cache the result
            await this.redis.setex(cacheKey, this.cacheExpiry, JSON.stringify(data));

            return data;
        } catch (error) {
            console.error('Error fetching engagement metrics:', error);
            throw error;
        }
    }

    async getSystemHealth() {
        try {
            const dbHealth = await this.db.healthCheck();
            const redisPing = await this.redis.ping();
            
            return {
                database: {
                    status: dbHealth.status,
                    response_time: dbHealth.response_time || 0,
                    connections: dbHealth.connections,
                    idle: dbHealth.idle,
                    waiting: dbHealth.waiting
                },
                redis: {
                    status: redisPing === 'PONG' ? 'healthy' : 'unhealthy',
                    response_time: Date.now()
                },
                system: {
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error('Error fetching system health:', error);
            throw error;
        }
    }

    async getRealTimeStats() {
        try {
            const query = `
                SELECT 
                    (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '1 hour') as online_users_1h,
                    (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '10 minutes') as online_users_10m,
                    (SELECT COUNT(*) FROM user_messages WHERE created_at > NOW() - INTERVAL '1 hour') as messages_1h,
                    (SELECT COUNT(*) FROM users_likes WHERE created_at > NOW() - INTERVAL '1 hour') as likes_1h,
                    (SELECT COUNT(*) FROM user_images WHERE uploaded_at > NOW() - INTERVAL '1 hour') as images_1h
                FROM users LIMIT 1
            `;

            const result = await this.db.query(query);
            return result.rows[0];
        } catch (error) {
            console.error('Error fetching real-time stats:', error);
            throw error;
        }
    }

    async clearCache() {
        try {
            const keys = await this.redis.keys('analytics:*');
            if (keys.length > 0) {
                await this.redis.del(keys);
            }
            console.log('Analytics cache cleared');
        } catch (error) {
            console.error('Error clearing analytics cache:', error);
        }
    }
}

module.exports = AnalyticsService; 
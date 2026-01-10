const { query, pool } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class UserManagementService {
    constructor() {
        this.cacheExpiry = 300; // 5 minutes
    }

    /**
     * Get users with filters, pagination, and sorting
     */
    async getUsers(options = {}) {
        const {
            page = 1,
            limit = 20,
            search = '',
            status = '',
            gender = '',
            ageMin = null,
            ageMax = null,
            countryId = null,
            stateId = null,
            cityId = null,
            dateJoinedFrom = null,
            dateJoinedTo = null,
            lastLoginFrom = null,
            lastLoginTo = null,
            hasImages = null,
            emailVerified = null,
            profileVerified = null,
            sortBy = 'date_joined',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;
        const cacheKey = `admin:users:${JSON.stringify(options)}`;

        try {
            // Try cache first
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // Build WHERE clause
            let whereConditions = ['1=1'];
            const params = [];
            let paramIndex = 1;

            // Search filter (includes location search)
            if (search) {
                whereConditions.push(`(
                    u.real_name ILIKE $${paramIndex} OR 
                    u.email ILIKE $${paramIndex} OR 
                    CAST(u.id AS TEXT) = $${paramIndex} OR
                    c.name ILIKE $${paramIndex} OR
                    s.name ILIKE $${paramIndex} OR
                    ci.name ILIKE $${paramIndex}
                )`);
                params.push(`%${search}%`);
                paramIndex++;
            }

            // Status filter
            if (status === 'banned') {
                whereConditions.push(`u.is_banned = true`);
            } else if (status === 'active') {
                whereConditions.push(`u.is_banned = false`);
            }

            // Gender filter
            if (gender) {
                whereConditions.push(`u.gender = $${paramIndex}`);
                params.push(gender);
                paramIndex++;
            }

            // Age filter
            if (ageMin !== null) {
                whereConditions.push(`EXTRACT(YEAR FROM AGE(u.birthdate)) >= $${paramIndex}`);
                params.push(ageMin);
                paramIndex++;
            }
            if (ageMax !== null) {
                whereConditions.push(`EXTRACT(YEAR FROM AGE(u.birthdate)) <= $${paramIndex}`);
                params.push(ageMax);
                paramIndex++;
            }

            // Location filters
            if (countryId) {
                whereConditions.push(`u.country_id = $${paramIndex}`);
                params.push(countryId);
                paramIndex++;
            }
            if (stateId) {
                whereConditions.push(`u.state_id = $${paramIndex}`);
                params.push(stateId);
                paramIndex++;
            }
            if (cityId) {
                whereConditions.push(`u.city_id = $${paramIndex}`);
                params.push(cityId);
                paramIndex++;
            }

            // Date filters
            if (dateJoinedFrom) {
                whereConditions.push(`u.date_joined >= $${paramIndex}`);
                params.push(dateJoinedFrom);
                paramIndex++;
            }
            if (dateJoinedTo) {
                whereConditions.push(`u.date_joined <= $${paramIndex}`);
                params.push(dateJoinedTo);
                paramIndex++;
            }
            if (lastLoginFrom) {
                whereConditions.push(`u.last_login >= $${paramIndex}`);
                params.push(lastLoginFrom);
                paramIndex++;
            }
            if (lastLoginTo) {
                whereConditions.push(`u.last_login <= $${paramIndex}`);
                params.push(lastLoginTo);
                paramIndex++;
            }

            // Email verified filter
            if (emailVerified !== null) {
                whereConditions.push(`u.email_verified = $${paramIndex}`);
                params.push(emailVerified);
                paramIndex++;
            }

            // Profile verified filter
            if (profileVerified !== null) {
                whereConditions.push(`u.profile_verified = $${paramIndex}`);
                params.push(profileVerified);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Get total count
            // Include location joins if search is used (since search includes location fields)
            const needsLocationJoins = search ? true : false;
            let countQuery = `
                SELECT COUNT(*) as total
                FROM users u
                ${needsLocationJoins ? 'LEFT JOIN country c ON u.country_id = c.id LEFT JOIN state s ON u.state_id = s.id LEFT JOIN city ci ON u.city_id = ci.id' : ''}
                WHERE ${whereClause}
            `;
            
            // Add hasImages filter to count if needed
            if (hasImages !== null) {
                countQuery = `
                    SELECT COUNT(DISTINCT u.id) as total
                    FROM users u
                    ${needsLocationJoins ? 'LEFT JOIN country c ON u.country_id = c.id LEFT JOIN state s ON u.state_id = s.id LEFT JOIN city ci ON u.city_id = ci.id' : ''}
                    LEFT JOIN user_images ui ON u.id = ui.user_id
                    WHERE ${whereClause}
                    ${hasImages ? 'AND ui.id IS NOT NULL' : 'AND ui.id IS NULL'}
                `;
            }

            let countResult;
            try {
                countResult = await query(countQuery, params);
            } catch (countError) {
                logger.warn('Count query failed, trying simplified version:', countError.message);
                logger.warn('Failed count query:', countQuery);
                logger.warn('Count query params:', params);
                logger.warn('Count error details:', {
                    code: countError.code,
                    detail: countError.detail,
                    hint: countError.hint,
                    position: countError.position
                });
                // Try a simpler count query
                const simpleCountQuery = `
                    SELECT COUNT(*) as total
                    FROM users u
                    WHERE ${whereClause}
                `;
                try {
                    countResult = await query(simpleCountQuery, params);
                } catch (simpleCountError) {
                    logger.error('Simplified count query also failed:', simpleCountError.message);
                    logger.error('Simple count query:', simpleCountQuery);
                    throw simpleCountError;
                }
            }
            const total = parseInt(countResult.rows[0]?.total || 0);

            // Get users with aggregated statistics
            // Start with a simple query without subqueries that might reference non-existent tables
            let usersQuery = `
                SELECT 
                    u.id,
                    u.real_name,
                    u.email,
                    u.birthdate,
                    u.gender,
                    u.date_joined,
                    u.last_login,
                    COALESCE(u.is_banned, false) as is_banned,
                    COALESCE(u.email_verified, false) as email_verified,
                    COALESCE(u.profile_verified, false) as profile_verified,
                    u.country_id,
                    u.state_id,
                    u.city_id,
                    c.name as country_name,
                    s.name as state_name,
                    ci.name as city_name
                FROM users u
                LEFT JOIN country c ON u.country_id = c.id
                LEFT JOIN state s ON u.state_id = s.id
                LEFT JOIN city ci ON u.city_id = ci.id
            `;

            // Add hasImages filter
            if (hasImages !== null) {
                usersQuery = usersQuery.replace('FROM users u', 'FROM users u LEFT JOIN user_images ui ON u.id = ui.user_id');
                // Create a new where clause with the hasImages condition
                const whereConditionsWithImages = [...whereConditions];
                whereConditionsWithImages.push(hasImages ? 'ui.id IS NOT NULL' : 'ui.id IS NULL');
                const whereClauseWithImages = whereConditionsWithImages.join(' AND ');
                usersQuery += ` WHERE ${whereClauseWithImages}`;
            } else {
                usersQuery += ` WHERE ${whereClause}`;
            }

            // Validate sortBy to prevent SQL injection
            const allowedSortFields = ['id', 'real_name', 'email', 'date_joined', 'last_login', 'gender'];
            let safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'date_joined';
            const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            // Handle date_joined sorting
            if (safeSortBy === 'date_joined') {
                safeSortBy = 'u.date_joined';
            } else {
                safeSortBy = `u.${safeSortBy}`;
            }

            // Build final params array with limit and offset
            const finalParams = [...params, limit, offset];
            const limitParamIndex = paramIndex;
            const offsetParamIndex = paramIndex + 1;
            
            usersQuery += ` ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;

            let usersResult;
            try {
                usersResult = await query(usersQuery, finalParams);
            } catch (queryError) {
                // If query fails, try a simpler version without optional joins
                logger.warn('Full query failed, trying simplified version:', queryError.message);
                logger.warn('Failed query:', usersQuery);
                logger.warn('Query params:', finalParams);
                logger.warn('Error details:', {
                    code: queryError.code,
                    detail: queryError.detail,
                    hint: queryError.hint,
                    position: queryError.position
                });
                
                // Use original whereClause but without location table joins
                const simpleQuery = `
                    SELECT 
                        u.id,
                        u.real_name,
                        u.email,
                        u.birthdate,
                        u.gender,
                        u.date_joined,
                        u.last_login,
                        COALESCE(u.is_banned, false) as is_banned,
                        COALESCE(u.email_verified, false) as email_verified,
                        COALESCE(u.profile_verified, false) as profile_verified,
                        u.country_id,
                        u.state_id,
                        u.city_id,
                        NULL as country_name,
                        NULL as state_name,
                        NULL as city_name
                    FROM users u
                    WHERE ${whereClause}
                    ORDER BY ${safeSortBy} ${safeSortOrder} 
                    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
                `;
                
                try {
                    usersResult = await query(simpleQuery, finalParams);
                } catch (simpleError) {
                    logger.error('Simplified query also failed:', simpleError.message);
                    logger.error('Simple query:', simpleQuery);
                    logger.error('Simple query params:', finalParams);
                    logger.error('Simple error details:', {
                        code: simpleError.code,
                        detail: simpleError.detail,
                        hint: simpleError.hint,
                        position: simpleError.position
                    });
                    
                    // Last resort: try the most basic query possible
                    logger.warn('Trying most basic query as last resort');
                    const basicQuery = `
                        SELECT 
                            u.id,
                            u.real_name,
                            u.email,
                            u.birthdate,
                            u.gender,
                            u.date_joined,
                            u.last_login,
                            u.is_banned,
                            u.email_verified,
                            u.profile_verified,
                            u.country_id,
                            u.state_id,
                            u.city_id
                        FROM users u
                        ORDER BY u.id DESC
                        LIMIT $1 OFFSET $2
                    `;
                    try {
                        usersResult = await query(basicQuery, [limit, offset]);
                        // Transform results to match expected format
                        usersResult.rows = usersResult.rows.map(user => ({
                            ...user,
                            date_joined: user.date_joined,
                            is_banned: user.is_banned || false,
                            email_verified: user.email_verified || false,
                            profile_verified: user.profile_verified || false,
                            country_name: null,
                            state_name: null,
                            city_name: null
                        }));
                    } catch (basicError) {
                        logger.error('Even basic query failed:', basicError.message);
                        throw basicError;
                    }
                }
            }
            
            // Get statistics for users (try to get them, but don't fail if tables don't exist)
            const userIds = usersResult.rows.map(u => u.id);
            const statsMap = {};
            
            // Try to get statistics, but catch errors if tables don't exist
            try {
                if (userIds.length > 0) {
                    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
                    
                    // Get image counts
                    try {
                        const imageStats = await query(
                            `SELECT user_id, COUNT(*) as count FROM user_images WHERE user_id IN (${placeholders}) GROUP BY user_id`,
                            userIds
                        );
                        imageStats.rows.forEach(row => {
                            if (!statsMap[row.user_id]) statsMap[row.user_id] = {};
                            statsMap[row.user_id].image_count = parseInt(row.count);
                        });
                    } catch (e) {
                        logger.warn('Could not get image counts:', e.message);
                    }
                    
                    // Get message counts
                    try {
                        const sentStats = await query(
                            `SELECT sender_id as user_id, COUNT(*) as count FROM user_messages WHERE sender_id IN (${placeholders}) GROUP BY sender_id`,
                            userIds
                        );
                        sentStats.rows.forEach(row => {
                            if (!statsMap[row.user_id]) statsMap[row.user_id] = {};
                            statsMap[row.user_id].messages_sent = parseInt(row.count);
                        });
                        
                        const receivedStats = await query(
                            `SELECT receiver_id as user_id, COUNT(*) as count FROM user_messages WHERE receiver_id IN (${placeholders}) GROUP BY receiver_id`,
                            userIds
                        );
                        receivedStats.rows.forEach(row => {
                            if (!statsMap[row.user_id]) statsMap[row.user_id] = {};
                            statsMap[row.user_id].messages_received = parseInt(row.count);
                        });
                    } catch (e) {
                        logger.warn('Could not get message counts:', e.message);
                    }
                    
                    // Get likes counts
                    try {
                        const likesReceivedStats = await query(
                            `SELECT liked_user_id as user_id, COUNT(*) as count FROM users_likes WHERE liked_user_id IN (${placeholders}) GROUP BY liked_user_id`,
                            userIds
                        );
                        likesReceivedStats.rows.forEach(row => {
                            if (!statsMap[row.user_id]) statsMap[row.user_id] = {};
                            statsMap[row.user_id].likes_received = parseInt(row.count);
                        });
                        
                        const likesGivenStats = await query(
                            `SELECT liked_by as user_id, COUNT(*) as count FROM users_likes WHERE liked_by IN (${placeholders}) GROUP BY liked_by`,
                            userIds
                        );
                        likesGivenStats.rows.forEach(row => {
                            if (!statsMap[row.user_id]) statsMap[row.user_id] = {};
                            statsMap[row.user_id].likes_given = parseInt(row.count);
                        });
                    } catch (e) {
                        logger.warn('Could not get likes counts:', e.message);
                    }
                    
                    // Get profile views
                    try {
                        const viewsStats = await query(
                            `SELECT viewed_user_id as user_id, COUNT(*) as count FROM users_profile_views WHERE viewed_user_id IN (${placeholders}) GROUP BY viewed_user_id`,
                            userIds
                        );
                        viewsStats.rows.forEach(row => {
                            if (!statsMap[row.user_id]) statsMap[row.user_id] = {};
                            statsMap[row.user_id].profile_views = parseInt(row.count);
                        });
                    } catch (e) {
                        logger.warn('Could not get profile views:', e.message);
                    }
                }
            } catch (e) {
                logger.warn('Error getting user statistics:', e.message);
            }
            
            const users = usersResult.rows.map(user => ({
                ...user,
                age: user.birthdate ? this.calculateAge(user.birthdate) : null,
                last_seen: user.last_login ? this.formatLastSeen(user.last_login) : 'Never',
                status: user.is_banned ? 'banned' : 'active',
                image_count: statsMap[user.id]?.image_count || 0,
                messages_sent: statsMap[user.id]?.messages_sent || 0,
                messages_received: statsMap[user.id]?.messages_received || 0,
                likes_received: statsMap[user.id]?.likes_received || 0,
                likes_given: statsMap[user.id]?.likes_given || 0,
                profile_views: statsMap[user.id]?.profile_views || 0
            }));

            const result = {
                users,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1
                }
            };

            // Cache result
            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(result), this.cacheExpiry);
            }

            return result;
        } catch (error) {
            logger.error('Error fetching users:', error);
            logger.error('Error stack:', error.stack);
            logger.error('Error details:', {
                code: error.code,
                detail: error.detail,
                hint: error.hint,
                position: error.position,
                message: error.message
            });
            throw error;
        }
    }

    /**
     * Get user by ID with full details
     */
    async getUserById(userId) {
        const cacheKey = `admin:user:${userId}`;

        try {
            // Try cache
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // Get basic user info (with fallback if location tables don't exist)
            let userResult;
            try {
                const userQuery = `
                    SELECT 
                        u.*,
                        c.name as country_name,
                        s.name as state_name,
                        ci.name as city_name
                    FROM users u
                    LEFT JOIN country c ON u.country_id = c.id
                    LEFT JOIN state s ON u.state_id = s.id
                    LEFT JOIN city ci ON u.city_id = ci.id
                    WHERE u.id = $1
                `;
                userResult = await query(userQuery, [userId]);
            } catch (e) {
                logger.warn('Location tables query failed, trying simple query:', e.message);
                // Fallback to simple query without location joins
                const simpleQuery = `
                    SELECT u.*
                    FROM users u
                    WHERE u.id = $1
                `;
                userResult = await query(simpleQuery, [userId]);
                // Add null location names
                if (userResult.rows.length > 0) {
                    userResult.rows[0].country_name = null;
                    userResult.rows[0].state_name = null;
                    userResult.rows[0].city_name = null;
                }
            }

            if (userResult.rows.length === 0) {
                return null;
            }

            const user = userResult.rows[0];

            // Get user attributes (with error handling)
            try {
                const attrResult = await query('SELECT * FROM user_attributes WHERE user_id = $1', [userId]);
                user.attributes = attrResult.rows[0] || {};
            } catch (e) {
                logger.warn('Could not get user attributes:', e.message);
                user.attributes = {};
            }

            // Get user preferences (with error handling)
            try {
                const prefResult = await query('SELECT * FROM user_preferences WHERE user_id = $1', [userId]);
                user.preferences = prefResult.rows[0] || {};
            } catch (e) {
                logger.warn('Could not get user preferences:', e.message);
                user.preferences = {};
            }

            // Get user images (with error handling)
            try {
                const imagesResult = await query(
                    'SELECT * FROM user_images WHERE user_id = $1 ORDER BY uploaded_at DESC',
                    [userId]
                );
                user.images = imagesResult.rows;
            } catch (e) {
                logger.warn('Could not get user images:', e.message);
                user.images = [];
            }

            // Get statistics (with error handling)
            try {
                const statsResult = await query(`
                    SELECT 
                        (SELECT COUNT(*) FROM user_messages WHERE sender_id = $1) as messages_sent,
                        (SELECT COUNT(*) FROM user_messages WHERE receiver_id = $1) as messages_received,
                        (SELECT COUNT(*) FROM users_likes WHERE liked_user_id = $1) as likes_received,
                        (SELECT COUNT(*) FROM users_likes WHERE liked_by = $1) as likes_given,
                        (SELECT COUNT(*) FROM users_favorites WHERE favorited_user_id = $1) as favorites_received,
                        (SELECT COUNT(*) FROM users_favorites WHERE favorited_by = $1) as favorites_given,
                        (SELECT COUNT(*) FROM users_profile_views WHERE viewed_user_id = $1) as profile_views,
                        (SELECT COUNT(*) FROM users_blocked_by_users WHERE blocked_id = $1) as blocked_by_count,
                        (SELECT COUNT(*) FROM users_blocked_by_users WHERE blocker_id = $1) as blocked_count,
                        (SELECT COUNT(*) FROM user_reports WHERE reported_user_id = $1) as reported_count
                `, [userId]);
                user.stats = statsResult.rows[0] || {};
            } catch (e) {
                logger.warn('Could not get user statistics:', e.message);
                user.stats = {
                    messages_sent: 0,
                    messages_received: 0,
                    likes_received: 0,
                    likes_given: 0,
                    favorites_received: 0,
                    favorites_given: 0,
                    profile_views: 0,
                    blocked_by_count: 0,
                    blocked_count: 0,
                    reported_count: 0
                };
            }

            // Get active sessions (with error handling)
            try {
                const sessionsResult = await query(
                    'SELECT * FROM user_sessions WHERE user_id = $1 AND is_active = true ORDER BY last_activity DESC',
                    [userId]
                );
                user.sessions = sessionsResult.rows;
            } catch (e) {
                logger.warn('Could not get user sessions:', e.message);
                user.sessions = [];
            }

            // Calculate age
            user.age = user.birthdate ? this.calculateAge(user.birthdate) : null;
            user.last_seen = user.last_login ? this.formatLastSeen(user.last_login) : 'Never';

            // Cache result
            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(user), this.cacheExpiry);
            }

            return user;
        } catch (error) {
            logger.error('Error fetching user by ID:', error);
            throw error;
        }
    }

    /**
     * Update user
     */
    async updateUser(userId, updateData) {
        try {
            const allowedFields = [
                'real_name', 'email', 'birthdate', 'gender', 'country_id', 
                'state_id', 'city_id', 'email_verified', 'profile_verified', 'is_banned'
            ];

            const updateFields = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    updateFields.push(`${key} = $${paramIndex}`);
                    values.push(value);
                    paramIndex++;
                }
            }

            if (updateFields.length === 0) {
                return { success: false, message: 'No valid fields to update' };
            }

            values.push(userId);
            const queryText = `
                UPDATE users 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await query(queryText, values);

            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            // Clear cache
            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                await redis.del('admin:users:*');
            }

            return {
                success: true,
                message: 'User updated successfully',
                user: result.rows[0]
            };
        } catch (error) {
            logger.error('Error updating user:', error);
            throw error;
        }
    }

    /**
     * Ban user
     */
    async banUser(userId, reason = '') {
        try {
            const result = await query(
                `UPDATE users 
                 SET is_banned = true, 
                     email_verified = false
                 WHERE id = $1
                 RETURNING *`,
                [userId]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            // Clear cache
            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                await redis.del('admin:users:*');
            }

            return {
                success: true,
                message: 'User banned successfully',
                user: result.rows[0]
            };
        } catch (error) {
            logger.error('Error banning user:', error);
            throw error;
        }
    }

    /**
     * Unban user
     */
    async unbanUser(userId) {
        try {
            const result = await query(
                `UPDATE users 
                 SET is_banned = false
                 WHERE id = $1
                 RETURNING *`,
                [userId]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            // Clear cache
            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                await redis.del('admin:users:*');
            }

            return {
                success: true,
                message: 'User unbanned successfully',
                user: result.rows[0]
            };
        } catch (error) {
            logger.error('Error unbanning user:', error);
            throw error;
        }
    }

    /**
     * Verify email
     */
    async verifyEmail(userId) {
        try {
            const result = await query(
                `UPDATE users 
                 SET email_verified = true
                 WHERE id = $1
                 RETURNING *`,
                [userId]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                await redis.del('admin:users:*');
            }

            return {
                success: true,
                message: 'Email verified successfully',
                user: result.rows[0]
            };
        } catch (error) {
            logger.error('Error verifying email:', error);
            throw error;
        }
    }

    /**
     * Unverify email
     */
    async unverifyEmail(userId) {
        try {
            const result = await query(
                `UPDATE users 
                 SET email_verified = false
                 WHERE id = $1
                 RETURNING *`,
                [userId]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                await redis.del('admin:users:*');
            }

            return {
                success: true,
                message: 'Email unverified successfully',
                user: result.rows[0]
            };
        } catch (error) {
            logger.error('Error unverifying email:', error);
            throw error;
        }
    }

    /**
     * Verify profile
     */
    async verifyProfile(userId) {
        try {
            const result = await query(
                `UPDATE users 
                 SET profile_verified = true
                 WHERE id = $1
                 RETURNING *`,
                [userId]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                await redis.del('admin:users:*');
            }

            return {
                success: true,
                message: 'Profile verified successfully',
                user: result.rows[0]
            };
        } catch (error) {
            logger.error('Error verifying profile:', error);
            throw error;
        }
    }

    /**
     * Unverify profile
     */
    async unverifyProfile(userId) {
        try {
            const result = await query(
                `UPDATE users 
                 SET profile_verified = false
                 WHERE id = $1
                 RETURNING *`,
                [userId]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                await redis.del('admin:users:*');
            }

            return {
                success: true,
                message: 'Profile unverified successfully',
                user: result.rows[0]
            };
        } catch (error) {
            logger.error('Error unverifying profile:', error);
            throw error;
        }
    }

    /**
     * Delete user (hard delete)
     * This method follows the same implementation as account.html deletion logic.
     * Real username/email are stored in users_deleted table for receivers.
     * Marked as deleted_by = 'admin' to distinguish from user self-deletion.
     */
    async deleteUser(userId) {
        // Use transaction for hard delete (same as main server implementation)
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // STEP 1: Get REAL user info BEFORE any deletions (CRITICAL - must capture real name/email)
            // This must happen FIRST before any data is deleted, to preserve the original real_name and email
            const userInfo = await client.query(`
                SELECT id, real_name, email FROM users WHERE id = $1
            `, [userId]);
            
            if (userInfo.rows.length === 0) {
                throw new Error('User not found');
            }
            
            // Extract REAL name and email (before any anonymization or deletion)
            const { real_name, email } = userInfo.rows[0];
            
            // STEP 2: Find all receivers who had conversations with this user (BEFORE deleting messages)
            // This is critical - we need to know who should see "Account Deactivated" even after messages are deleted
            const conversationPartners = await client.query(`
                SELECT DISTINCT
                    CASE 
                        WHEN sender_id = $1 THEN receiver_id
                        ELSE sender_id
                    END as receiver_id
                FROM user_messages
                WHERE sender_id = $1 OR receiver_id = $1
            `, [userId]);
            
            // STEP 3: Store REAL deleted user info in users_deleted table (global list - one entry per deleted user)
            // CRITICAL: Store the REAL name and email (not anonymized) so receivers can see who was deleted
            // Mark as deleted by admin (same structure as user self-deletion, but with deleted_by = 'admin')
            await client.query(`
                INSERT INTO users_deleted (deleted_user_id, real_name, email, deleted_by, created_at)
                VALUES ($1, $2, $3, 'admin', NOW())
                ON CONFLICT (deleted_user_id) DO UPDATE
                SET real_name = EXCLUDED.real_name, email = EXCLUDED.email, deleted_by = 'admin'
            `, [userId, real_name, email]);
            
            // STEP 4: CRITICAL - Record receiver mappings in users_deleted_receivers table (one row per receiver)
            // This MUST be done to allow receivers to see "Account Deactivated" in their conversation list
            // and enables the clear-deleted-user-conversation functionality to work properly
            // Each receiver who had conversations with this user gets a record in users_deleted_receivers
            for (const partner of conversationPartners.rows) {
                const receiverId = partner.receiver_id;
                if (receiverId && receiverId !== userId) {
                    await client.query(`
                        INSERT INTO users_deleted_receivers (deleted_user_id, receiver_id, created_at)
                        VALUES ($1, $2, NOW())
                        ON CONFLICT (deleted_user_id, receiver_id) DO NOTHING
                    `, [userId, receiverId]);
                }
            }
            
            // STEP 5: HARD DELETE ALL USER DATA (same order and logic as main server)
            
            // 5a. Get and delete message attachment files BEFORE deleting database records
            const attachmentsResult = await client.query(`
                SELECT file_path, thumbnail_path 
                FROM user_message_attachments 
                WHERE message_id IN (SELECT id FROM user_messages WHERE sender_id = $1 OR receiver_id = $1)
            `, [userId]);
            
            // Delete physical attachment files
            // Try to use ChatImageHandler from main server if available
            let imageHandler = null;
            try {
                const ChatImageHandler = require('../../utils/chatImageHandler');
                imageHandler = new ChatImageHandler();
            } catch (e) {
                logger.warn('ChatImageHandler not available, will delete files directly');
            }
            
            for (const attachment of attachmentsResult.rows) {
                if (attachment.file_path || attachment.thumbnail_path) {
                    try {
                        if (imageHandler) {
                            await imageHandler.deleteImageFilesByPaths(
                                attachment.file_path,
                                attachment.thumbnail_path
                            );
                        } else {
                            // Fallback: delete files directly
                            const chatImagesDir = path.join(__dirname, '..', '..', 'app', 'uploads', 'chat_images');
                            if (attachment.file_path) {
                                let resolvedPath;
                                if (attachment.file_path.startsWith('/uploads/chat_images/')) {
                                    const relativePath = 'app' + attachment.file_path;
                                    resolvedPath = path.join(process.cwd(), relativePath);
                                } else {
                                    resolvedPath = path.join(chatImagesDir, attachment.file_path);
                                }
                                try {
                                    await fs.unlink(resolvedPath);
                                    logger.info(`🗑️ Deleted attachment file: ${attachment.file_path}`);
                                } catch (e) {
                                    if (e.code !== 'ENOENT') {
                                        logger.warn(`⚠️ Could not delete attachment file: ${e.message}`);
                                    }
                                }
                            }
                            if (attachment.thumbnail_path) {
                                let resolvedPath;
                                if (attachment.thumbnail_path.startsWith('/uploads/chat_images/')) {
                                    const relativePath = 'app' + attachment.thumbnail_path;
                                    resolvedPath = path.join(process.cwd(), relativePath);
                                } else {
                                    resolvedPath = path.join(chatImagesDir, attachment.thumbnail_path);
                                }
                                try {
                                    await fs.unlink(resolvedPath);
                                    logger.info(`🗑️ Deleted thumbnail file: ${attachment.thumbnail_path}`);
                                } catch (e) {
                                    if (e.code !== 'ENOENT') {
                                        logger.warn(`⚠️ Could not delete thumbnail file: ${e.message}`);
                                    }
                                }
                            }
                        }
                    } catch (fileError) {
                        logger.warn(`⚠️ Warning deleting attachment file for user ${userId}:`, fileError.message);
                    }
                }
            }
            
            // Now delete message attachments from database
            await client.query(`
                DELETE FROM user_message_attachments 
                WHERE message_id IN (SELECT id FROM user_messages WHERE sender_id = $1 OR receiver_id = $1)
            `, [userId]);
            
            // 5b. Delete all messages (both sent and received)
            await client.query('DELETE FROM user_messages WHERE sender_id = $1 OR receiver_id = $1', [userId]);
            
            // 5c. Delete all likes (both given and received)
            await client.query('DELETE FROM users_likes WHERE liked_by = $1 OR liked_user_id = $1', [userId]);
            
            // 5d. Delete all profile views (both as viewer and viewed)
            await client.query('DELETE FROM users_profile_views WHERE viewer_id = $1 OR viewed_user_id = $1', [userId]);
            
            // 5e. Get and delete user profile image files BEFORE deleting database records
            const userImagesResult = await client.query(
                'SELECT file_name FROM user_images WHERE user_id = $1',
                [userId]
            );
            
            // Delete physical profile image files
            const profileImagesDir = path.join(__dirname, '..', '..', 'app', 'uploads', 'profile_images');
            let deletedCount = 0;
            let errorCount = 0;
            
            for (const image of userImagesResult.rows) {
                if (image.file_name) {
                    try {
                        const imagePath = path.join(profileImagesDir, image.file_name);
                        
                        // Check if file exists before attempting deletion
                        try {
                            await fs.access(imagePath);
                            // File exists, delete it
                            await fs.unlink(imagePath);
                            deletedCount++;
                            logger.info(`🗑️ Deleted profile image file: ${image.file_name}`);
                        } catch (fileError) {
                            if (fileError.code === 'ENOENT') {
                                // File doesn't exist - that's okay, might have been deleted already
                                logger.info(`ℹ️ Profile image file not found (already deleted?): ${image.file_name}`);
                            } else {
                                errorCount++;
                                logger.error(`❌ Error deleting profile image file ${image.file_name}:`, fileError.message);
                            }
                        }
                        
                        // Also try to delete thumbnail if it exists (common naming patterns)
                        const thumbnailPatterns = [
                            image.file_name.replace(/(\.[^.]+)$/, '_thumb$1'),
                            image.file_name.replace(/(\.[^.]+)$/, '_thumbnail$1'),
                            image.file_name.replace(/(\.[^.]+)$/, '.thumb$1')
                        ];
                        
                        for (const thumbPattern of thumbnailPatterns) {
                            try {
                                const thumbPath = path.join(profileImagesDir, thumbPattern);
                                await fs.access(thumbPath);
                                await fs.unlink(thumbPath);
                                deletedCount++;
                                logger.info(`🗑️ Deleted profile image thumbnail: ${thumbPattern}`);
                            } catch (thumbError) {
                                // Ignore if thumbnail doesn't exist
                                if (thumbError.code !== 'ENOENT') {
                                    logger.warn(`⚠️ Could not delete thumbnail ${thumbPattern}:`, thumbError.message);
                                }
                            }
                        }
                    } catch (fileError) {
                        errorCount++;
                        logger.error(`❌ Error processing profile image deletion for user ${userId}, file ${image.file_name}:`, fileError.message);
                    }
                }
            }
            
            if (userImagesResult.rows.length > 0) {
                logger.info(`📊 Profile image deletion summary for user ${userId}: ${deletedCount} files deleted, ${errorCount} errors`);
            }
            
            // Now delete user profile images from database
            await client.query('DELETE FROM user_images WHERE user_id = $1', [userId]);
            logger.info(`🗑️ Deleted ${userImagesResult.rows.length} profile image record(s) from database for user ${userId}`);
            
            // 5f. Delete other user data
            await client.query('DELETE FROM users_favorites WHERE favorited_by = $1 OR favorited_user_id = $1', [userId]);
            await client.query('DELETE FROM users_blocked_by_users WHERE blocker_id = $1 OR blocked_id = $1', [userId]);
            await client.query('DELETE FROM user_attributes WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM user_preferences WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM user_matches WHERE user1_id = $1 OR user2_id = $1', [userId]);
            await client.query('DELETE FROM user_activity WHERE user_id = $1 OR target_user_id = $1', [userId]);
            await client.query('DELETE FROM user_reports WHERE reporter_id = $1 OR reported_user_id = $1', [userId]);
            await client.query('DELETE FROM user_compatibility_cache WHERE user_id = $1 OR target_user_id = $1', [userId]);
            await client.query('DELETE FROM user_conversation_removals WHERE remover_id = $1 OR removed_user_id = $1', [userId]);
            
            // 5g. Cascade cleanup: Remove orphaned records from users_deleted_receivers
            // When this user is deleted, they can no longer see deleted users, so remove all records
            // where this user was a receiver
            await client.query('DELETE FROM users_deleted_receivers WHERE receiver_id = $1', [userId]);
            
            // 5h. Delete optional settings tables (same as main server)
            try {
                await client.query('DELETE FROM user_profile_settings WHERE user_id = $1', [userId]);
            } catch (e) {
                // Table might not exist, ignore
            }
            try {
                await client.query('DELETE FROM user_measurement_preferences WHERE user_id = $1', [userId]);
            } catch (e) {
                // Table might not exist, ignore
            }
            try {
                await client.query('DELETE FROM user_contact_countries WHERE user_id = $1', [userId]);
            } catch (e) {
                // Table might not exist, ignore
            }
            try {
                await client.query('DELETE FROM user_languages WHERE user_id = $1', [userId]);
            } catch (e) {
                // Table might not exist, ignore
            }
            try {
                await client.query('DELETE FROM user_location_history WHERE user_id = $1', [userId]);
            } catch (e) {
                // Table might not exist, ignore
            }
            try {
                await client.query('DELETE FROM user_name_change_history WHERE user_id = $1', [userId]);
            } catch (e) {
                // Table might not exist, ignore
            }
            
            // STEP 6: Finally, hard delete the user record itself from users table (same as main server)
            // This is the final step - removes the user record completely from the database
            await client.query('DELETE FROM users WHERE id = $1', [userId]);
            
            await client.query('COMMIT');
            
            // Clear cache (same pattern as main server)
            if (redis && redis.enabled) {
                try {
                    await redis.del(`admin:user:${userId}`);
                    await redis.del('admin:users:*');
                } catch (e) {
                    // Ignore cache errors
                }
            }

            return {
                success: true,
                message: 'User account and all associated data permanently deleted. Receivers will still see "Account Deactivated" in their conversation list.',
                receiversNotified: conversationPartners.rows.length
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Blacklist user
     * Adds user to admin_blacklisted_users table
     */
    async blacklistUser(userId, adminId, reason = '', notes = '', ipAddress = null, userAgent = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get user info
            const userInfo = await client.query(`
                SELECT id, real_name, email FROM users WHERE id = $1
            `, [userId]);

            if (userInfo.rows.length === 0) {
                throw new Error('User not found');
            }

            const { real_name, email } = userInfo.rows[0];

            // Get user's current IP address if available (from last login or session)
            const userIpResult = await client.query(`
                SELECT last_ip_address FROM users WHERE id = $1
            `, [userId]);
            const userIpAddress = userIpResult.rows[0]?.last_ip_address || null;

            // Check if user is already blacklisted
            const existingBlacklist = await client.query(`
                SELECT id, status FROM admin_blacklisted_users 
                WHERE user_id = $1 AND status = 'active'
            `, [userId]);

            if (existingBlacklist.rows.length > 0) {
                throw new Error('User is already blacklisted');
            }

            // Insert into admin_blacklisted_users
            await client.query(`
                INSERT INTO admin_blacklisted_users (
                    user_id, email, admin_id, reason, status, 
                    ip_address, user_ip_address, user_agent, notes, 
                    blacklisted_at, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, NOW(), NOW(), NOW())
            `, [userId, email, adminId, reason, ipAddress, userIpAddress, userAgent, notes]);

            await client.query('COMMIT');

            logger.info(`User ${userId} (${email}) blacklisted by admin ${adminId}`);

            return {
                success: true,
                message: `User ${real_name} (${email}) has been blacklisted successfully.`
            };
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error blacklisting user:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Bulk operations
     */
    async bulkOperation(userIds, operation, data = {}) {
        try {
            const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
            let queryText;
            let params = userIds;

            switch (operation) {
                case 'ban':
                    queryText = `UPDATE users SET is_banned = true WHERE id IN (${placeholders}) RETURNING id`;
                    break;
                case 'unban':
                    queryText = `UPDATE users SET is_banned = false WHERE id IN (${placeholders}) RETURNING id`;
                    break;
                case 'verify_email':
                    queryText = `UPDATE users SET email_verified = true WHERE id IN (${placeholders}) RETURNING id`;
                    break;
                case 'unverify_email':
                    queryText = `UPDATE users SET email_verified = false WHERE id IN (${placeholders}) RETURNING id`;
                    break;
                case 'verify_profile':
                    queryText = `UPDATE users SET profile_verified = true WHERE id IN (${placeholders}) RETURNING id`;
                    break;
                case 'unverify_profile':
                    queryText = `UPDATE users SET profile_verified = false WHERE id IN (${placeholders}) RETURNING id`;
                    break;
                case 'blacklist':
                    // Blacklist operation calls blacklistUser for each user
                    const blacklistResults = [];
                    const blacklistErrors = [];
                    const adminId = data.adminId;
                    const reason = data.reason || '';
                    const notes = data.notes || '';
                    
                    if (!adminId) {
                        return { success: false, message: 'Admin ID is required for blacklist operation' };
                    }
                    
                    for (const userId of userIds) {
                        try {
                            const blacklistResult = await this.blacklistUser(userId, adminId, reason, notes);
                            if (blacklistResult.success) {
                                blacklistResults.push(userId);
                            } else {
                                blacklistErrors.push({ userId, error: blacklistResult.message });
                            }
                        } catch (error) {
                            blacklistErrors.push({ userId, error: error.message });
                        }
                    }
                    
                    return {
                        success: blacklistResults.length > 0,
                        message: blacklistResults.length > 0 
                            ? `Blacklisted ${blacklistResults.length} user(s)${blacklistErrors.length > 0 ? `. ${blacklistErrors.length} failed.` : '.'}`
                            : `Failed to blacklist users: ${blacklistErrors.map(e => e.error).join(', ')}`,
                        affectedCount: blacklistResults.length,
                        errors: blacklistErrors.length > 0 ? blacklistErrors : undefined
                    };
                case 'delete':
                    // Delete operation uses anonymization (calls deleteUser which performs anonymization)
                    // This ensures all proper steps are followed (anonymization, image deletion, etc.)
                    const deleteResults = [];
                    const deleteErrors = [];
                    
                    for (const userId of userIds) {
                        try {
                            const deleteResult = await this.deleteUser(userId);
                            if (deleteResult.success) {
                                deleteResults.push(userId);
                            } else {
                                deleteErrors.push({ userId, error: deleteResult.message });
                            }
                        } catch (error) {
                            deleteErrors.push({ userId, error: error.message });
                        }
                    }
                    
                    return {
                        success: deleteResults.length > 0,
                        message: deleteResults.length > 0 
                            ? `Deleted ${deleteResults.length} user account(s)${deleteErrors.length > 0 ? `. ${deleteErrors.length} failed.` : '.'}`
                            : `Failed to delete accounts: ${deleteErrors.map(e => e.error).join(', ')}`,
                        affectedCount: deleteResults.length,
                        errors: deleteErrors.length > 0 ? deleteErrors : undefined
                    };
                default:
                    return { success: false, message: 'Invalid operation' };
            }

            // For non-delete and non-blacklist operations, execute the query
            if (operation !== 'delete' && operation !== 'blacklist') {
                const result = await query(queryText, params);

                // Clear cache
                if (redis.enabled) {
                    for (const userId of userIds) {
                        await redis.del(`admin:user:${userId}`);
                    }
                    await redis.del('admin:users:*');
                }

                return {
                    success: true,
                    message: `${operation} completed for ${result.rows.length} users`,
                    affectedCount: result.rows.length
                };
            }
        } catch (error) {
            logger.error('Error in bulk operation:', error);
            throw error;
        }
    }

    /**
     * Calculate age from birthdate
     */
    calculateAge(birthdate) {
        const today = new Date();
        const birth = new Date(birthdate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        return age;
    }

    /**
     * Format last seen time
     */
    formatLastSeen(lastLogin) {
        const now = new Date();
        const last = new Date(lastLogin);
        const diffMs = now - last;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minutes ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;
        
        return last.toLocaleDateString();
    }
}

module.exports = new UserManagementService();











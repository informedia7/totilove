/**
 * User API Routes
 * Handles user-related endpoints (online status, block/unblock, etc.)
 */

/**
 * Setup user-related routes
 * @param {Object} app - Express application instance
 * @param {Object} db - Database pool instance
 * @param {Object} redis - Redis client instance (can be null)
 * @param {Object} io - Socket.IO instance
 * @param {Object} blockRateLimiter - Block rate limiter instance (can be null)
 */
function setupUserRoutes(app, db, redis, io, blockRateLimiter) {
    // API endpoint to get user's last online time from user_sessions table
    app.get('/api/users/:userId/last-online', async (req, res) => {
        try {
            const userId = req.params.userId;
            
            // Query user_sessions table for the most recent last_activity
            const result = await db.query(`
                SELECT last_activity 
                FROM user_sessions 
                WHERE user_id = $1 
                ORDER BY last_activity DESC 
                LIMIT 1
            `, [userId]);
            
            if (result.rows.length > 0) {
                res.json({
                    success: true,
                    lastOnlineTime: result.rows[0].last_activity,
                    userId: userId
                });
            } else {
                // If no session found, check users table for last_login
                const userResult = await db.query(`
                    SELECT last_login 
                    FROM users 
                    WHERE id = $1
                `, [userId]);
                
                if (userResult.rows.length > 0) {
                    res.json({
                        success: true,
                        lastOnlineTime: userResult.rows[0].last_login,
                        userId: userId,
                        source: 'users.last_login'
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        message: 'User not found'
                    });
                }
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    });

    // API endpoint to update user's last online time
    app.post('/api/users/:userId/last-online', async (req, res) => {
        try {
            const userId = req.params.userId;
            const { lastOnlineTime } = req.body;
            
            // Update the most recent user_sessions record
            const result = await db.query(`
                UPDATE user_sessions 
                SET last_activity = $2 
                WHERE user_id = $1 
                AND id = (
                    SELECT id FROM user_sessions 
                    WHERE user_id = $1 
                    ORDER BY last_activity DESC 
                    LIMIT 1
                )
            `, [userId, new Date(lastOnlineTime)]);
            
            if (result.rowCount > 0) {
                res.json({
                    success: true,
                    message: 'Last online time updated successfully',
                    userId: userId,
                    lastOnlineTime: lastOnlineTime
                });
            } else {
                // If no session found, create a new one
                await db.query(`
                    INSERT INTO user_sessions (user_id, last_activity, is_active, session_token)
                    VALUES ($1, $2, false, 'offline_session')
                `, [userId, new Date(lastOnlineTime)]);
                
                res.json({
                    success: true,
                    message: 'New offline session created',
                    userId: userId,
                    lastOnlineTime: lastOnlineTime
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    });

    // API endpoint to get all users' last online times (for bulk status updates)
    app.get('/api/users/last-online-bulk', async (req, res) => {
        try {
            const userIds = req.query.userIds ? req.query.userIds.split(',').map(id => parseInt(id)) : [];
            
            if (userIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No user IDs provided'
                });
            }
            
            // Query user_sessions table for all specified users
            const result = await db.query(`
                SELECT DISTINCT ON (user_id) 
                    user_id, 
                    last_activity,
                    is_active
                FROM user_sessions 
                WHERE user_id = ANY($1)
                ORDER BY user_id, last_activity DESC
            `, [userIds]);
            
            // Create a map of user_id to last_activity
            const lastOnlineMap = {};
            result.rows.forEach(row => {
                lastOnlineMap[row.user_id] = {
                    lastOnlineTime: row.last_activity,
                    isActive: row.is_active
                };
            });
            
            res.json({
                success: true,
                lastOnlineTimes: lastOnlineMap
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    });

    // API endpoint to force cleanup offline users (mark them as offline if inactive for more than 1 minute)
    app.post('/api/users/cleanup-offline', async (req, res) => {
        try {
            // Find users who are marked as active but haven't had activity in the last minute
            const result = await db.query(`
                UPDATE user_sessions 
                SET is_active = false 
                WHERE is_active = true 
                AND last_activity < NOW() - INTERVAL '1 minute'
                RETURNING user_id, last_activity
            `);
            
            if (result.rowCount > 0) {
                // Broadcast offline status for these users
                result.rows.forEach(row => {
                    if (io) {
                        io.emit('userOffline', { 
                            userId: row.user_id, 
                            timestamp: Date.now() 
                        });
                    }
                });
            }
            
            res.json({
                success: true,
                message: `Cleaned up ${result.rowCount} offline users`,
                cleanedUsers: result.rows
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    });

    // API endpoint to block a user
    app.post('/api/users/:userId/block', async (req, res) => {
        const client = await db.connect();
        try {
            const blockerId = req.session?.userId || req.headers['x-user-id'];
            const blockedId = parseInt(req.params.userId);
            const reason = req.body.reason || null;

            // Standardized error response helper
            const sendError = (status, code, message, details = {}) => {
                return res.status(status).json({
                    success: false,
                    error: message,
                    code: code,
                    details: details
                });
            };

            if (!blockerId) {
                return sendError(401, 'AUTH_REQUIRED', 'User not authenticated');
            }

            if (blockerId == blockedId) {
                return sendError(400, 'INVALID_REQUEST', 'Cannot block yourself');
            }

            // Rate limiting check
            if (blockRateLimiter) {
                const rateLimitCheck = await blockRateLimiter.checkRateLimit(blockerId, 'block', 10);
                if (!rateLimitCheck.allowed) {
                    return sendError(429, 'RATE_LIMIT_EXCEEDED', rateLimitCheck.error, {
                        remaining: rateLimitCheck.remaining,
                        resetAt: rateLimitCheck.resetAt
                    });
                }
            }

            // Start transaction
            await client.query('BEGIN');

            // Check if already blocked
            const existing = await client.query(
                'SELECT id FROM users_blocked_by_users WHERE blocker_id = $1 AND blocked_id = $2',
                [blockerId, blockedId]
            );

            const isAlreadyBlocked = existing.rows.length > 0;

            if (!isAlreadyBlocked) {
                // Insert into users_blocked_by_users table
                await client.query(
                    'INSERT INTO users_blocked_by_users (blocker_id, blocked_id, reason, created_at) VALUES ($1, $2, $3, NOW())',
                    [blockerId, blockedId, reason]
                );
            }

            // Backup favorites before deletion (both directions)
            await client.query(`
                INSERT INTO users_favorites_backup (favorited_by, favorited_user_id, favorited_date, blocked_at, blocker_id, blocked_id)
                SELECT favorited_by, favorited_user_id, favorited_date, NOW(), $1, $2
                FROM users_favorites
                WHERE (favorited_by = $1 AND favorited_user_id = $2)
                   OR (favorited_by = $2 AND favorited_user_id = $1)
                ON CONFLICT DO NOTHING
            `, [blockerId, blockedId]);

            // Backup likes before deletion (both directions)
            await client.query(`
                INSERT INTO users_likes_backup (liked_by, liked_user_id, created_at, blocked_at, blocker_id, blocked_id)
                SELECT liked_by, liked_user_id, created_at, NOW(), $1, $2
                FROM users_likes
                WHERE (liked_by = $1 AND liked_user_id = $2)
                   OR (liked_by = $2 AND liked_user_id = $1)
                ON CONFLICT DO NOTHING
            `, [blockerId, blockedId]);

            // Remove from favorites (both directions)
            await client.query(
                'DELETE FROM users_favorites WHERE favorited_by = $1 AND favorited_user_id = $2',
                [blockerId, blockedId]
            );
            await client.query(
                'DELETE FROM users_favorites WHERE favorited_by = $1 AND favorited_user_id = $2',
                [blockedId, blockerId]
            );

            // Remove from likes (both directions)
            await client.query(
                'DELETE FROM users_likes WHERE liked_by = $1 AND liked_user_id = $2',
                [blockerId, blockedId]
            );
            await client.query(
                'DELETE FROM users_likes WHERE liked_by = $1 AND liked_user_id = $2',
                [blockedId, blockerId]
            );

            // Commit transaction
            await client.query('COMMIT');

            // Invalidate Redis caches
            if (redis) {
                try {
                    const cacheKeys = [
                        `user:${blockerId}:conversations`,
                        `user:${blockedId}:conversations`,
                        `conversation:${blockerId}:${blockedId}`,
                        `conversation:${blockedId}:${blockerId}`
                    ];
                    
                    // Clear specific keys
                    for (const key of cacheKeys) {
                        await redis.del(key);
                    }
                    
                    // Clear pattern matches for message caches
                    const messagePatterns = [
                        `user:${blockerId}:messages:*`,
                        `user:${blockedId}:messages:*`
                    ];
                    
                    for (const pattern of messagePatterns) {
                        const keys = await redis.keys(pattern.replace('*', '*'));
                        if (keys.length > 0) {
                            await redis.del(keys);
                        }
                    }
                } catch (cacheError) {
                    // Cache invalidation failed (non-critical)
                }
            }

            // WebSocket notification to blocked user
            if (io) {
                try {
                    // Get blocker real_name for notification
                    const blockerResult = await db.query(
                        'SELECT real_name FROM users WHERE id = $1',
                        [blockerId]
                    );
                    const blockerUsername = blockerResult.rows[0]?.real_name || 'Someone';

                    io.to(`user_${blockedId}`).emit('user_blocked', {
                        blockerId: blockerId,
                        blockerUsername: blockerUsername,
                        message: `You have been blocked by ${blockerUsername}`,
                        timestamp: Date.now()
                    });
                } catch (wsError) {
                    // WebSocket notification failed (non-critical)
                }
            }

            if (isAlreadyBlocked) {
                return res.json({
                    success: true,
                    message: 'User already blocked (favorites and likes removed)',
                    code: 'ALREADY_BLOCKED'
                });
            }

            res.json({
                success: true,
                message: 'User blocked successfully',
                code: 'BLOCKED'
            });
        } catch (error) {
            // Rollback transaction on error
            await client.query('ROLLBACK').catch(() => {});
            
            res.status(500).json({
                success: false,
                error: 'Failed to block user',
                code: 'BLOCK_ERROR',
                details: { message: error.message }
            });
        } finally {
            client.release();
        }
    });

    // API endpoint to unblock a user
    app.delete('/api/users/:userId/block', async (req, res) => {
        const client = await db.connect();
        try {
            const blockerId = req.session?.userId || req.headers['x-user-id'];
            const blockedId = parseInt(req.params.userId);
            // Handle DELETE requests which may not have a body - default to true for restoration
            const body = req.body || {};
            const restoreFavorites = body.restoreFavorites !== false; // Default to true
            const restoreLikes = body.restoreLikes !== false; // Default to true

            // Standardized error response helper
            const sendError = (status, code, message, details = {}) => {
                return res.status(status).json({
                    success: false,
                    error: message,
                    code: code,
                    details: details
                });
            };

            if (!blockerId) {
                return sendError(401, 'AUTH_REQUIRED', 'User not authenticated');
            }

            // Rate limiting check
            if (blockRateLimiter) {
                const rateLimitCheck = await blockRateLimiter.checkRateLimit(blockerId, 'unblock', 20);
                if (!rateLimitCheck.allowed) {
                    return sendError(429, 'RATE_LIMIT_EXCEEDED', rateLimitCheck.error, {
                        remaining: rateLimitCheck.remaining,
                        resetAt: rateLimitCheck.resetAt
                    });
                }
            }

            // Start transaction
            await client.query('BEGIN');

            // Check if block exists
            const blockCheck = await client.query(
                'SELECT id FROM users_blocked_by_users WHERE blocker_id = $1 AND blocked_id = $2',
                [blockerId, blockedId]
            );

            if (blockCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return sendError(404, 'NOT_FOUND', 'User is not blocked');
            }

            // Delete the block relationship
            await client.query(
                'DELETE FROM users_blocked_by_users WHERE blocker_id = $1 AND blocked_id = $2',
                [blockerId, blockedId]
            );

            // Restore favorites if requested (from backup)
            if (restoreFavorites) {
                await client.query(`
                    INSERT INTO users_favorites (favorited_by, favorited_user_id, favorited_date)
                    SELECT favorited_by, favorited_user_id, favorited_date
                    FROM users_favorites_backup
                    WHERE blocker_id = $1 AND blocked_id = $2
                    ON CONFLICT (favorited_by, favorited_user_id) DO NOTHING
                `, [blockerId, blockedId]);
            }

            // Restore likes if requested (from backup)
            if (restoreLikes) {
                await client.query(`
                    INSERT INTO users_likes (liked_by, liked_user_id, created_at)
                    SELECT liked_by, liked_user_id, created_at
                    FROM users_likes_backup
                    WHERE blocker_id = $1 AND blocked_id = $2
                    ON CONFLICT (liked_by, liked_user_id) DO NOTHING
                `, [blockerId, blockedId]);
            }

            // Commit transaction
            await client.query('COMMIT');

            // Invalidate Redis caches
            if (redis) {
                try {
                    const cacheKeys = [
                        `user:${blockerId}:conversations`,
                        `user:${blockedId}:conversations`,
                        `conversation:${blockerId}:${blockedId}`,
                        `conversation:${blockedId}:${blockerId}`
                    ];
                    
                    for (const key of cacheKeys) {
                        await redis.del(key);
                    }
                    
                    // Clear message caches
                    const messagePatterns = [
                        `user:${blockerId}:messages:*`,
                        `user:${blockedId}:messages:*`
                    ];
                    
                    for (const pattern of messagePatterns) {
                        const keys = await redis.keys(pattern.replace('*', '*'));
                        if (keys.length > 0) {
                            await redis.del(keys);
                        }
                    }
                } catch (cacheError) {
                    // Cache invalidation failed (non-critical)
                }
            }

            // WebSocket notification to unblocked user
            if (io) {
                try {
                    // Get blocker real_name for notification
                    const blockerResult = await db.query(
                        'SELECT real_name FROM users WHERE id = $1',
                        [blockerId]
                    );
                    const blockerUsername = blockerResult.rows[0]?.real_name || 'Someone';

                    io.to(`user_${blockedId}`).emit('user_unblocked', {
                        blockerId: blockerId,
                        blockerUsername: blockerUsername,
                        message: `You have been unblocked by ${blockerUsername}`,
                        timestamp: Date.now()
                    });
                } catch (wsError) {
                    // WebSocket notification failed (non-critical)
                }
            }

            res.json({
                success: true,
                message: 'User unblocked successfully',
                code: 'UNBLOCKED',
                unblockedUserId: blockedId,
                restored: {
                    favorites: restoreFavorites,
                    likes: restoreLikes
                }
            });
        } catch (error) {
            // Rollback transaction on error
            await client.query('ROLLBACK').catch(() => {});
            
            res.status(500).json({
                success: false,
                error: 'Failed to unblock user',
                code: 'UNBLOCK_ERROR',
                details: { message: error.message }
            });
        } finally {
            client.release();
        }
    });

    // GET blocked users list
    app.get('/api/blocked-users', async (req, res) => {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated',
                    code: 'AUTH_REQUIRED'
                });
            }

            const result = await db.query(
                `SELECT 
                    bu.blocked_id as user_id,
                    u.real_name as name,
                    u.gender,
                    COALESCE(EXTRACT(YEAR FROM AGE(u.birthdate)), 0)::int as age,
                    COALESCE(c.name, 'Unknown') as location,
                    ui.file_name as profile_image,
                    bu.created_at as blocked_at,
                    bu.reason as block_reason
                FROM users_blocked_by_users bu
                JOIN users u ON bu.blocked_id = u.id
                LEFT JOIN country c ON u.country_id = c.id
                LEFT JOIN (
                    SELECT DISTINCT ON (user_id) user_id, file_name
                    FROM user_images
                    WHERE is_profile = 1
                    ORDER BY user_id, uploaded_at DESC
                ) ui ON u.id = ui.user_id
                WHERE bu.blocker_id = $1
                ORDER BY bu.created_at DESC`,
                [userId]
            );

            res.json({
                success: true,
                blockedUsers: result.rows,
                total: result.rows.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to fetch blocked users',
                code: 'FETCH_ERROR'
            });
        }
    });

    // GET block statistics
    app.get('/api/block-statistics', async (req, res) => {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated',
                    code: 'AUTH_REQUIRED'
                });
            }

            const stats = await db.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE blocker_id = $1) as users_blocked_by_me,
                    COUNT(*) FILTER (WHERE blocked_id = $1) as users_who_blocked_me,
                    COUNT(*) as total_block_relationships
                FROM users_blocked_by_users
                WHERE blocker_id = $1 OR blocked_id = $1
            `, [userId]);

            const recentBlocks = await db.query(`
                SELECT COUNT(*) as count
                FROM users_blocked_by_users
                WHERE blocker_id = $1
                AND created_at >= NOW() - INTERVAL '30 days'
            `, [userId]);

            res.json({
                success: true,
                statistics: {
                    usersBlockedByMe: parseInt(stats.rows[0]?.users_blocked_by_me || 0),
                    usersWhoBlockedMe: parseInt(stats.rows[0]?.users_who_blocked_me || 0),
                    totalBlockRelationships: parseInt(stats.rows[0]?.total_block_relationships || 0),
                    recentBlocks30Days: parseInt(recentBlocks.rows[0]?.count || 0)
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to fetch block statistics',
                code: 'STATS_ERROR'
            });
        }
    });

    // POST bulk unblock
    app.post('/api/users/bulk-unblock', async (req, res) => {
        const client = await db.connect();
        try {
            const blockerId = req.session?.userId || req.headers['x-user-id'];
            const { userIds, restoreFavorites = true, restoreLikes = true } = req.body;

            if (!blockerId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated',
                    code: 'AUTH_REQUIRED'
                });
            }

            if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'User IDs array required',
                    code: 'INVALID_REQUEST'
                });
            }

            if (userIds.length > 50) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum 50 users can be unblocked at once',
                    code: 'LIMIT_EXCEEDED'
                });
            }

            await client.query('BEGIN');

            const unblockedIds = [];
            const notFoundIds = [];

            for (const blockedId of userIds) {
                const blockCheck = await client.query(
                    'SELECT id FROM users_blocked_by_users WHERE blocker_id = $1 AND blocked_id = $2',
                    [blockerId, blockedId]
                );

                if (blockCheck.rows.length > 0) {
                    // Delete block
                    await client.query(
                        'DELETE FROM users_blocked_by_users WHERE blocker_id = $1 AND blocked_id = $2',
                        [blockerId, blockedId]
                    );

                    // Restore favorites if requested
                    if (restoreFavorites) {
                        await client.query(`
                            INSERT INTO users_favorites (favorited_by, favorited_user_id, favorited_date)
                            SELECT favorited_by, favorited_user_id, favorited_date
                            FROM users_favorites_backup
                            WHERE blocker_id = $1 AND blocked_id = $2
                            ON CONFLICT (favorited_by, favorited_user_id) DO NOTHING
                        `, [blockerId, blockedId]);
                    }

                    // Restore likes if requested
                    if (restoreLikes) {
                        await client.query(`
                            INSERT INTO users_likes (liked_by, liked_user_id, created_at)
                            SELECT liked_by, liked_user_id, created_at
                            FROM users_likes_backup
                            WHERE blocker_id = $1 AND blocked_id = $2
                            ON CONFLICT (liked_by, liked_user_id) DO NOTHING
                        `, [blockerId, blockedId]);
                    }

                    unblockedIds.push(blockedId);
                } else {
                    notFoundIds.push(blockedId);
                }
            }

            await client.query('COMMIT');

            // Invalidate caches for all unblocked users
            if (redis && unblockedIds.length > 0) {
                try {
                    const cacheKeys = [
                        `user:${blockerId}:conversations`
                    ];
                    for (const blockedId of unblockedIds) {
                        cacheKeys.push(`user:${blockedId}:conversations`);
                        cacheKeys.push(`conversation:${blockerId}:${blockedId}`);
                        cacheKeys.push(`conversation:${blockedId}:${blockerId}`);
                    }
                    await redis.del(cacheKeys);
                } catch (cacheError) {
                    // Cache invalidation failed (non-critical)
                }
            }

            // WebSocket notifications
            if (io && unblockedIds.length > 0) {
                try {
                    const blockerResult = await db.query(
                        'SELECT real_name FROM users WHERE id = $1',
                        [blockerId]
                    );
                    const blockerUsername = blockerResult.rows[0]?.real_name || 'Someone';

                    for (const blockedId of unblockedIds) {
                        io.to(`user_${blockedId}`).emit('user_unblocked', {
                            blockerId: blockerId,
                            blockerUsername: blockerUsername,
                            message: `You have been unblocked by ${blockerUsername}`,
                            timestamp: Date.now()
                        });
                    }
                } catch (wsError) {
                    // WebSocket notification failed (non-critical)
                }
            }

            res.json({
                success: true,
                message: `Successfully unblocked ${unblockedIds.length} user(s)`,
                code: 'BULK_UNBLOCKED',
                unblocked: unblockedIds,
                notFound: notFoundIds,
                restored: {
                    favorites: restoreFavorites,
                    likes: restoreLikes
                }
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            
            res.status(500).json({
                success: false,
                error: 'Failed to bulk unblock users',
                code: 'BULK_UNBLOCK_ERROR'
            });
        } finally {
            client.release();
        }
    });
}

module.exports = { setupUserRoutes };








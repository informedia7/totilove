const { Pool } = require('pg');
const ActivityRateLimiter = require('../utils/activityRateLimiter');
const BlockCheck = require('../utils/blockCheck');
const { hydratePresenceStatuses, normalizeLastSeen } = require('../utils/presenceStatusHelper');

class ActivityController {
    constructor(db, presenceService = null) {
        this.db = db;
        this.rateLimiter = new ActivityRateLimiter(db);
        this.blockCheck = new BlockCheck(db);
        this.presenceService = presenceService;
        this.optionalColumns = {
            usersLastSeenAt: null,
            warnedUsersLastSeen: false
        };
    }

    async ensureUsersLastSeenColumn() {
        if (this.optionalColumns.usersLastSeenAt === null) {
            try {
                const columnCheck = await this.db.query(`
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'users'
                          AND column_name = 'last_seen_at'
                    ) as exists
                `);
                this.optionalColumns.usersLastSeenAt = Boolean(columnCheck.rows[0]?.exists);
            } catch (error) {
                this.optionalColumns.usersLastSeenAt = false;
            }

            if (!this.optionalColumns.usersLastSeenAt && !this.optionalColumns.warnedUsersLastSeen) {
                console.warn('users.last_seen_at column missing - activity endpoints will skip last seen data');
                this.optionalColumns.warnedUsersLastSeen = true;
            }
        }

        return this.optionalColumns.usersLastSeenAt;
    }

    async getLastSeenFragments(tableAlias = 'u', columnAlias = 'last_seen_at') {
        const hasColumn = await this.ensureUsersLastSeenColumn();
        return {
            hasColumn,
            select: hasColumn
                ? `${tableAlias}.last_seen_at as ${columnAlias}`
                : `NULL::timestamptz as ${columnAlias}`,
            groupBy: hasColumn ? `, ${tableAlias}.last_seen_at` : ''
        };
    }

    // Helper method to format profile image path
    formatProfileImage(filename) {
        if (!filename) return null;
        const s = String(filename).trim();
        if (!s || s === 'null') return null;
        if (s.startsWith('http://') || s.startsWith('https://')) return s;
        if (s.startsWith('/assets/') || s.startsWith('assets/')) {
            return s.startsWith('/') ? s : `/${s}`;
        }
        if (s.startsWith('/uploads/') || s.startsWith('uploads/')) {
            return s.startsWith('/') ? s : `/${s}`;
        }
        return `/uploads/profile_images/${s}`;
    }

    // Get profile viewers
    async getViewers(req, res) {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];
            const limit = parseInt(req.query.limit) || 10;
            const todayOnly = req.query.todayOnly === 'true' || req.query.todayOnly === true;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            const lastSeenFragments = await this.getLastSeenFragments();

            // Get today's count first (unique viewers from today)
            let viewers = [];
            let todayCount = 0;
            let totalCount = 0;
            
            try {
                // Get today's count (unique viewers from today)
                const todayQuery = `
                    SELECT COUNT(DISTINCT viewer_id) as count
                    FROM users_profile_views
                    WHERE viewed_user_id = $1
                    AND viewed_at >= CURRENT_DATE
                `;
                const todayResult = await this.db.query(todayQuery, [userId]);
                todayCount = parseInt(todayResult.rows[0]?.count || 0);
                
                // Get viewers from users_profile_views table
                // If todayOnly is true, filter to only show today's viewers to match the "X today" count
                const viewersQuery = `
                    SELECT 
                        u.id as user_id,
                        u.real_name as name,
                        u.gender,
                        COALESCE(u.profile_verified, false) as is_verified,
                        EXTRACT(YEAR FROM AGE(u.birthdate)) as age,
                        COALESCE(
                            c.name || ', ' || co.name,
                            c.name,
                            co.name,
                            'Unknown'
                        ) as location,
                        ui.file_name as profile_image,
                        ui.thumbnail_medium_path,
                        up.preferred_gender,
                        up.age_min as preferred_age_min,
                        up.age_max as preferred_age_max,
                        pv.viewed_at,
                        1 as view_count,
                        (SELECT COUNT(*) FROM user_images WHERE user_id = u.id AND file_name IS NOT NULL AND approval_status = 'approved') as photo_count,
                        COALESCE(u.account_status, 'active') as account_status,
                        COALESCE(u.is_suspended, false) as is_suspended,
                        ${lastSeenFragments.select}
                    FROM users_profile_views pv
                    JOIN users u ON pv.viewer_id = u.id
                    LEFT JOIN city c ON u.city_id = c.id
                    LEFT JOIN country co ON u.country_id = co.id
                                        LEFT JOIN LATERAL (
                                                SELECT file_name, thumbnail_medium_path
                                                FROM user_images
                                                WHERE user_id = u.id
                                                    AND file_name IS NOT NULL
                                                    AND approval_status = 'approved'
                                                ORDER BY is_profile DESC, featured DESC, uploaded_at DESC, id DESC
                                                LIMIT 1
                                        ) ui ON true
                    LEFT JOIN user_preferences up ON up.user_id = u.id
                    WHERE pv.viewed_user_id = $1
                        ${todayOnly ? 'AND pv.viewed_at >= CURRENT_DATE' : ''}
                        AND NOT EXISTS (
                            SELECT 1 FROM users_hidden_profile_viewers hv
                            WHERE hv.user_id = $1
                              AND hv.viewer_id = u.id
                        )
                        AND NOT EXISTS (
                            SELECT 1 FROM users_blocked_by_users bu
                            WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                               OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                        )
                    ORDER BY pv.viewed_at DESC
                    LIMIT $2
                `;

                const result = await this.db.query(viewersQuery, [userId, limit]);
                viewers = result.rows.map(viewer => ({
                    ...viewer,
                    profile_image: this.formatProfileImage(viewer.profile_image),
                    thumbnail_medium_path: this.formatProfileImage(viewer.thumbnail_medium_path),
                    is_online: false,
                    last_seen_at: normalizeLastSeen(viewer.last_seen_at)
                }));

                await hydratePresenceStatuses(this.presenceService, viewers, {
                    idSelector: (row) => row.user_id
                });

                // Get total count (from users_profile_views table)
                const totalQuery = `
                    SELECT COUNT(DISTINCT viewer_id) as count
                    FROM users_profile_views
                    WHERE viewed_user_id = $1
                      AND NOT EXISTS (
                          SELECT 1 FROM users_hidden_profile_viewers hv
                          WHERE hv.user_id = $1
                            AND hv.viewer_id = users_profile_views.viewer_id
                      )
                `;
                const totalResult = await this.db.query(totalQuery, [userId]);
                totalCount = parseInt(totalResult.rows[0]?.count || 0);
            } catch (error) {
                console.log('ℹ️ Error querying users_profile_views for viewers:', error.message);
            }

            res.json({
                success: true,
                viewers,
                todayCount,
                totalCount
            });
        } catch (error) {
            console.error('❌ Error getting viewers:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch viewers'
            });
        }
    }

    // Remove a viewer from "Who viewed me"
    async removeViewer(req, res) {
        try {
            const rawUserId = req.session?.userId || req.headers['x-user-id'];
            const rawViewerId = req.params.viewerId;
            const userId = parseInt(rawUserId, 10);
            const viewerId = parseInt(rawViewerId, 10);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            if (!viewerId || isNaN(viewerId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Viewer ID is required'
                });
            }

            if (viewerId === userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid viewer'
                });
            }

            try {
                await this.db.query(`
                    INSERT INTO users_hidden_profile_viewers (user_id, viewer_id, hidden_at)
                    VALUES ($1, $2, NOW())
                    ON CONFLICT (user_id, viewer_id)
                    DO UPDATE SET hidden_at = NOW()
                `, [userId, viewerId]);

                res.json({
                    success: true,
                    message: 'Viewer hidden'
                });
            } catch (error) {
                console.log('ℹ️ Error removing viewer:', error.message);
                throw error;
            }
        } catch (error) {
            console.error('❌ Error removing viewer:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to remove viewer'
            });
        }
    }

    // Get favorites
    async getFavorites(req, res) {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];
            const limit = parseInt(req.query.limit) || 10;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            const lastSeenFragments = await this.getLastSeenFragments();

            let favorites = [];
            let totalCount = 0;

            try {
                // Get total count first (exclude blocked users)
                const countQuery = `
                    SELECT COUNT(DISTINCT f.favorited_user_id) as count
                    FROM users_favorites f
                    JOIN users u ON f.favorited_user_id = u.id
                    WHERE f.favorited_by = $1
                        AND NOT EXISTS (
                            SELECT 1 FROM users_blocked_by_users bu
                            WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                               OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                        )
                `;
                const countResult = await this.db.query(countQuery, [userId]);
                totalCount = parseInt(countResult.rows[0]?.count || 0);

                // Get favorites with limit
                const favoritesQuery = `
                    SELECT 
                        u.id as user_id,
                        u.real_name as name,
                        u.gender,
                        COALESCE(u.profile_verified, false) as is_verified,
                        EXTRACT(YEAR FROM AGE(u.birthdate)) as age,
                        COALESCE(
                            c.name || ', ' || co.name,
                            c.name,
                            co.name,
                            'Unknown'
                        ) as location,
                        ui.file_name as profile_image,
                        ui.thumbnail_medium_path,
                        up.preferred_gender,
                        up.age_min as preferred_age_min,
                        up.age_max as preferred_age_max,
                        f.favorited_date as created_at,
                        (SELECT COUNT(*) FROM user_images WHERE user_id = u.id AND file_name IS NOT NULL AND approval_status = 'approved') as photo_count,
                        COALESCE(u.account_status, 'active') as account_status,
                        COALESCE(u.is_suspended, false) as is_suspended,
                        ${lastSeenFragments.select}
                    FROM users_favorites f
                    JOIN users u ON f.favorited_user_id = u.id
                    LEFT JOIN city c ON u.city_id = c.id
                    LEFT JOIN country co ON u.country_id = co.id
                                        LEFT JOIN LATERAL (
                                                SELECT file_name, thumbnail_medium_path
                                                FROM user_images
                                                WHERE user_id = u.id
                                                    AND file_name IS NOT NULL
                                                    AND approval_status = 'approved'
                                                ORDER BY is_profile DESC, featured DESC, uploaded_at DESC, id DESC
                                                LIMIT 1
                                        ) ui ON true
                    LEFT JOIN user_preferences up ON up.user_id = u.id
                    WHERE f.favorited_by = $1
                        AND NOT EXISTS (
                            SELECT 1 FROM users_blocked_by_users bu
                            WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                               OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                        )
                    GROUP BY u.id, u.real_name, u.gender, u.profile_verified, u.birthdate, c.name, co.name, ui.file_name, ui.thumbnail_medium_path, f.favorited_date,
                             up.preferred_gender, up.age_min, up.age_max, u.account_status, u.is_suspended${lastSeenFragments.groupBy}
                    ORDER BY f.favorited_date DESC
                    LIMIT $2
                `;

                const result = await this.db.query(favoritesQuery, [userId, limit]);
                favorites = result.rows.map(favorite => ({
                    ...favorite,
                    profile_image: this.formatProfileImage(favorite.profile_image),
                    thumbnail_medium_path: this.formatProfileImage(favorite.thumbnail_medium_path),
                    is_online: false,
                    last_seen_at: normalizeLastSeen(favorite.last_seen_at)
                }));

                await hydratePresenceStatuses(this.presenceService, favorites, {
                    idSelector: (row) => row.user_id
                });
            } catch (error) {
                console.log('ℹ️ Error querying favorites:', error.message);
            }

            res.json({
                success: true,
                favorites,
                totalCount
            });
        } catch (error) {
            console.error('❌ Error getting favorites:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch favorites'
            });
        }
    }

    // Get new messages
    async getMessages(req, res) {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];
            const limit = parseInt(req.query.limit) || 10;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            // Get recent unread messages (by unique sender)
            const messagesQuery = `
                WITH latest_unread AS (
                    SELECT DISTINCT ON (m.sender_id)
                        m.id,
                        m.sender_id,
                        CASE 
                            WHEN u.real_name = 'Deleted User' THEN 'Deleted User'
                            ELSE u.real_name
                        END as sender_name,
                        u.gender,
                        EXTRACT(YEAR FROM AGE(u.birthdate)) as age,
                        COALESCE(
                            c.name || ', ' || co.name,
                            c.name,
                            co.name,
                            'Unknown'
                        ) as location,
                        CASE 
                            WHEN u.real_name = 'Deleted User' THEN '/assets/images/account_deactivated.svg'
                            ELSE ui.file_name
                        END as profile_image,
                        m.message as message_text,
                        m.timestamp as sent_at,
                        m.status,
                        CASE 
                            WHEN u.real_name = 'Deleted User' THEN true
                            ELSE false
                        END as is_sender_deleted,
                        (SELECT COUNT(*) FROM user_images WHERE user_id = u.id AND file_name IS NOT NULL AND approval_status = 'approved') as photo_count
                    FROM user_messages m
                    JOIN users u ON m.sender_id = u.id
                    LEFT JOIN city c ON u.city_id = c.id
                    LEFT JOIN country co ON u.country_id = co.id
                                        LEFT JOIN LATERAL (
                                                SELECT file_name, thumbnail_medium_path
                                                FROM user_images
                                                WHERE user_id = u.id
                                                    AND file_name IS NOT NULL
                                                    AND approval_status = 'approved'
                                                ORDER BY is_profile DESC, featured DESC, uploaded_at DESC, id DESC
                                                LIMIT 1
                                        ) ui ON true
                    WHERE m.receiver_id = $1
                    AND m.read_at IS NULL
                    AND COALESCE(m.deleted_by_receiver, false) = false
                    AND COALESCE(m.message_type, 'text') != 'like'
                    ORDER BY m.sender_id, m.timestamp DESC
                ),
                sender_counts AS (
                    SELECT sender_id, COUNT(*) as unread_count
                    FROM user_messages
                    WHERE receiver_id = $1
                    AND read_at IS NULL
                    AND COALESCE(deleted_by_receiver, false) = false
                    AND COALESCE(message_type, 'text') != 'like'
                    GROUP BY sender_id
                )
                SELECT lu.*, sc.unread_count
                FROM latest_unread lu
                JOIN sender_counts sc ON lu.sender_id = sc.sender_id
                ORDER BY lu.sent_at DESC
                LIMIT $2
            `;

            let messages = [];
            let unreadCount = 0;

            try {
                const result = await this.db.query(messagesQuery, [userId, limit]);
                messages = result.rows.map(message => ({
                    ...message,
                    profile_image: this.formatProfileImage(message.profile_image)
                }));

                // Get unread count (unique senders with unread messages)
                const countQuery = `
                    SELECT COUNT(DISTINCT sender_id) as count
                    FROM user_messages
                    WHERE receiver_id = $1
                    AND read_at IS NULL
                    AND COALESCE(message_type, 'text') != 'like'
                `;
                const countResult = await this.db.query(countQuery, [userId]);
                unreadCount = parseInt(countResult.rows[0]?.count || 0);
            } catch (error) {
                console.log('ℹ️ Error querying messages:', error.message);
            }

            res.json({
                success: true,
                messages,
                unreadCount
            });
        } catch (error) {
            console.error('❌ Error getting messages:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch messages'
            });
        }
    }

    // Get likes
    async getLikes(req, res) {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];
            const limit = parseInt(req.query.limit) || 10;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            const lastSeenFragments = await this.getLastSeenFragments();

            // Query from likes table - unique constraint ensures one like per user pair
            // Each result is a unique user who liked the current user
            // Only show likes from the last 24 hours to match "new" classification
            const likesQuery = `
                SELECT 
                    u.id as user_id,
                    u.real_name as name,
                    EXTRACT(YEAR FROM AGE(u.birthdate)) as age,
                    COALESCE(
                        c.name || ', ' || co.name,
                        c.name,
                        co.name,
                        'Unknown'
                    ) as location,
                    ui.file_name as profile_image,
                    ui.thumbnail_medium_path,
                    up.preferred_gender,
                    up.age_min as preferred_age_min,
                    up.age_max as preferred_age_max,
                    l.created_at as liked_at,
                    (SELECT COUNT(*) FROM user_images WHERE user_id = u.id AND file_name IS NOT NULL AND approval_status = 'approved') as photo_count,
                        ${lastSeenFragments.select}
                FROM users_likes l
                JOIN users u ON l.liked_by = u.id
                LEFT JOIN city c ON u.city_id = c.id
                LEFT JOIN country co ON u.country_id = co.id
                                LEFT JOIN LATERAL (
                                        SELECT file_name, thumbnail_medium_path
                                        FROM user_images
                                        WHERE user_id = u.id
                                            AND file_name IS NOT NULL
                                            AND approval_status = 'approved'
                                        ORDER BY is_profile DESC, featured DESC, uploaded_at DESC, id DESC
                                        LIMIT 1
                                ) ui ON true
                LEFT JOIN user_preferences up ON up.user_id = u.id
                WHERE l.liked_user_id = $1
                    AND l.created_at >= NOW() - INTERVAL '24 hours'
                ORDER BY l.created_at DESC
                LIMIT $2
            `;

            let likes = [];
            let newCount = 0;

            try {
                const result = await this.db.query(likesQuery, [userId, limit]);
                likes = result.rows.map(like => ({
                    ...like,
                    profile_image: this.formatProfileImage(like.profile_image),
                    thumbnail_medium_path: this.formatProfileImage(like.thumbnail_medium_path),
                    is_online: false,
                    last_seen_at: normalizeLastSeen(like.last_seen_at)
                }));

                await hydratePresenceStatuses(this.presenceService, likes, {
                    idSelector: (row) => row.user_id
                });

                // Get count of unique users who liked in last 24 hours (unique constraint ensures one like per user)
                const countQuery = `
                    SELECT COUNT(*) as count
                    FROM users_likes
                    WHERE liked_user_id = $1
                    AND created_at >= NOW() - INTERVAL '24 hours'
                `;
                const countResult = await this.db.query(countQuery, [userId]);
                newCount = parseInt(countResult.rows[0]?.count || 0);
            } catch (error) {
                console.log('ℹ️ Error querying likes:', error.message);
            }

            res.json({
                success: true,
                likes,
                newCount
            });
        } catch (error) {
            console.error('❌ Error getting likes:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch likes'
            });
        }
    }

    // Get who liked me
    async getWhoLikedMe(req, res) {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];
            const limit = parseInt(req.query.limit) || 10;
            const todayOnly = req.query.todayOnly === 'true' || req.query.todayOnly === true;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            const lastSeenFragments = await this.getLastSeenFragments();

            // Get today's count first (unique users who liked today)
            let todayCount = 0;
            let totalCount = 0;
            
            try {
                // Get today's count (unique users who liked today)
                const todayQuery = `
                    SELECT COUNT(DISTINCT liked_by) as count
                    FROM users_likes
                    WHERE liked_user_id = $1
                    AND created_at >= CURRENT_DATE
                `;
                const todayResult = await this.db.query(todayQuery, [userId]);
                todayCount = parseInt(todayResult.rows[0]?.count || 0);
                
                // Query from users_likes table - unique constraint ensures one like per user pair
                // Each result is a unique user who liked the current user
                // If todayOnly is true, filter to only show likes from today to match the "X today" count
                const whoLikedMeQuery = `
                    SELECT 
                        u.id as user_id,
                        u.real_name as name,
                        u.gender,
                        COALESCE(u.profile_verified, false) as is_verified,
                        EXTRACT(YEAR FROM AGE(u.birthdate)) as age,
                        COALESCE(
                            c.name || ', ' || co.name,
                            c.name,
                            co.name,
                            'Unknown'
                        ) as location,
                        ui.file_name as profile_image,
                        ui.thumbnail_medium_path,
                        up.preferred_gender,
                        up.age_min as preferred_age_min,
                        up.age_max as preferred_age_max,
                        l.created_at as liked_at,
                        (SELECT COUNT(*) FROM user_images WHERE user_id = u.id AND file_name IS NOT NULL AND approval_status = 'approved') as photo_count,
                        COALESCE(u.account_status, 'active') as account_status,
                        COALESCE(u.is_suspended, false) as is_suspended,
                        ${lastSeenFragments.select}
                    FROM users_likes l
                    JOIN users u ON l.liked_by = u.id
                    LEFT JOIN city c ON u.city_id = c.id
                    LEFT JOIN country co ON u.country_id = co.id
                                        LEFT JOIN LATERAL (
                                                SELECT file_name, thumbnail_medium_path
                                                FROM user_images
                                                WHERE user_id = u.id
                                                    AND file_name IS NOT NULL
                                                    AND approval_status = 'approved'
                                                ORDER BY is_profile DESC, featured DESC, uploaded_at DESC, id DESC
                                                LIMIT 1
                                        ) ui ON true
                    LEFT JOIN user_preferences up ON up.user_id = u.id
                    WHERE l.liked_user_id = $1
                        ${todayOnly ? 'AND l.created_at >= CURRENT_DATE' : ''}
                        AND NOT EXISTS (
                            SELECT 1 FROM users_hidden_incoming_likes hl
                            WHERE hl.user_id = $1
                              AND hl.liked_by = u.id
                        )
                        AND NOT EXISTS (
                            SELECT 1 FROM users_blocked_by_users bu
                            WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                               OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                        )
                    ORDER BY l.created_at DESC
                    LIMIT $2
                `;

                const result = await this.db.query(whoLikedMeQuery, [userId, limit]);
                const users = result.rows.map(user => ({
                    ...user,
                    profile_image: this.formatProfileImage(user.profile_image),
                    thumbnail_medium_path: this.formatProfileImage(user.thumbnail_medium_path),
                    is_online: false,
                    last_seen_at: normalizeLastSeen(user.last_seen_at)
                }));

                await hydratePresenceStatuses(this.presenceService, users, {
                    idSelector: (row) => row.user_id
                });

                // Get total count of unique users who liked (exclude blocked users to match the list)
                const countQuery = `
                    SELECT COUNT(DISTINCT l.liked_by) as count
                    FROM users_likes l
                    JOIN users u ON l.liked_by = u.id
                    WHERE l.liked_user_id = $1
                        AND NOT EXISTS (
                            SELECT 1 FROM users_hidden_incoming_likes hl
                            WHERE hl.user_id = $1
                              AND hl.liked_by = u.id
                        )
                        AND NOT EXISTS (
                            SELECT 1 FROM users_blocked_by_users bu
                            WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                               OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                        )
                `;
                const countResult = await this.db.query(countQuery, [userId]);
                totalCount = parseInt(countResult.rows[0]?.count || 0);
                
                res.json({
                    success: true,
                    users,
                    todayCount,
                    totalCount
                });
            } catch (error) {
                console.log('ℹ️ Error querying who liked me:', error.message);
                res.json({
                    success: true,
                    users: [],
                    todayCount: 0,
                    totalCount: 0
                });
            }
        } catch (error) {
            console.error('❌ Error getting who liked me:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch who liked me'
            });
        }
    }

    // Hide an incoming like from "Who liked me" (does not delete the other user's like)
    async hideIncomingLike(req, res) {
        try {
            const rawUserId = req.session?.userId || req.headers['x-user-id'];
            const rawLikedBy = req.params.userId;
            const userId = parseInt(rawUserId, 10);
            const likedBy = parseInt(rawLikedBy, 10);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            if (!likedBy || isNaN(likedBy)) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }

            if (likedBy === userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user'
                });
            }

            try {
                await this.db.query(`
                    INSERT INTO users_hidden_incoming_likes (user_id, liked_by, hidden_at)
                    VALUES ($1, $2, NOW())
                    ON CONFLICT (user_id, liked_by)
                    DO UPDATE SET hidden_at = NOW()
                `, [userId, likedBy]);

                res.json({
                    success: true,
                    message: 'Like hidden'
                });
            } catch (error) {
                console.log('ℹ️ Error hiding incoming like:', error.message);
                throw error;
            }
        } catch (error) {
            console.error('❌ Error hiding incoming like:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to hide like'
            });
        }
    }

    // Get who I like
    async getWhoILike(req, res) {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];
            const limit = parseInt(req.query.limit) || 10;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            const lastSeenFragments = await this.getLastSeenFragments();

            // Query from users_likes table - users that the current user has liked
            const whoILikeQuery = `
                SELECT 
                    u.id as user_id,
                    u.real_name as name,
                    u.gender,
                    COALESCE(u.profile_verified, false) as is_verified,
                    EXTRACT(YEAR FROM AGE(u.birthdate)) as age,
                    COALESCE(
                        c.name || ', ' || co.name,
                        c.name,
                        co.name,
                        'Unknown'
                    ) as location,
                    ui.file_name as profile_image,
                    ui.thumbnail_medium_path,
                    up.preferred_gender,
                    up.age_min as preferred_age_min,
                    up.age_max as preferred_age_max,
                    l.created_at as liked_at,
                    (SELECT COUNT(*) FROM user_images WHERE user_id = u.id AND file_name IS NOT NULL AND approval_status = 'approved') as photo_count,
                    COALESCE(u.account_status, 'active') as account_status,
                    COALESCE(u.is_suspended, false) as is_suspended,
                    ${lastSeenFragments.select}
                FROM users_likes l
                JOIN users u ON l.liked_user_id = u.id
                LEFT JOIN city c ON u.city_id = c.id
                LEFT JOIN country co ON u.country_id = co.id
                                LEFT JOIN LATERAL (
                                        SELECT file_name, thumbnail_medium_path
                                        FROM user_images
                                        WHERE user_id = u.id
                                            AND file_name IS NOT NULL
                                            AND approval_status = 'approved'
                                        ORDER BY is_profile DESC, featured DESC, uploaded_at DESC, id DESC
                                        LIMIT 1
                                ) ui ON true
                LEFT JOIN user_preferences up ON up.user_id = u.id
                WHERE l.liked_by = $1
                    AND NOT EXISTS (
                        SELECT 1 FROM users_blocked_by_users bu
                        WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                           OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                    )
                ORDER BY l.created_at DESC
                LIMIT $2
            `;

            let users = [];
            let totalCount = 0;

            try {
                const result = await this.db.query(whoILikeQuery, [userId, limit]);
                users = result.rows.map(user => ({
                    ...user,
                    profile_image: this.formatProfileImage(user.profile_image),
                    thumbnail_medium_path: this.formatProfileImage(user.thumbnail_medium_path),
                    is_online: false,
                    last_seen_at: normalizeLastSeen(user.last_seen_at)
                }));

                await hydratePresenceStatuses(this.presenceService, users, {
                    idSelector: (row) => row.user_id
                });

                // Get total count of users I've liked
                const countQuery = `
                    SELECT COUNT(*) as count
                    FROM users_likes
                    WHERE liked_by = $1
                `;
                const countResult = await this.db.query(countQuery, [userId]);
                totalCount = parseInt(countResult.rows[0]?.count || 0);
            } catch (error) {
                console.log('ℹ️ Error querying who I like:', error.message);
            }

            res.json({
                success: true,
                users,
                totalCount
            });
        } catch (error) {
            console.error('❌ Error getting who I like:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch who I like'
            });
        }
    }

    // Remove like (unlike)
    async removeLike(req, res) {
        try {
            const rawUserId = req.session?.userId || req.headers['x-user-id'];
            const rawUnlikedUserId = req.params.userId;
            const userId = parseInt(rawUserId, 10);
            const unlikedUserId = parseInt(rawUnlikedUserId, 10);
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            if (!unlikedUserId || isNaN(unlikedUserId)) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID to unlike is required'
                });
            }

            try {
                // Only remove the current user's outgoing like.
                const deleteResult = await this.db.query(`
                    DELETE FROM users_likes l
                    USING users u
                    WHERE l.liked_by = $1
                      AND l.liked_user_id = $2
                      AND u.id = l.liked_user_id
                    RETURNING u.real_name
                `, [userId, unlikedUserId]);

                if (deleteResult.rowCount === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Like not found'
                    });
                }

                const targetDisplayName = deleteResult.rows[0]?.real_name || 'User';

                // If one side unlikes, this is no longer a mutual match.
                await this.db.query(`
                    DELETE FROM user_matches
                    WHERE (user1_id = $1 AND user2_id = $2)
                       OR (user1_id = $2 AND user2_id = $1)
                `, [userId, unlikedUserId]);

                console.log(`💔 User ${userId} removed outgoing like for user ${unlikedUserId}`);
                
                res.json({
                    success: true,
                    message: `${targetDisplayName} unliked`
                });
            } catch (error) {
                console.error('❌ Error removing like:', error);
                throw error;
            }
        } catch (error) {
            console.error('❌ Error removing like:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to remove like'
            });
        }
    }

    // Remove from favorites
    async removeFavorite(req, res) {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];
            const favoriteUserId = req.params.userId;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            try {
                // Get real_name before deleting
                const userCheck = await this.db.query(`
                    SELECT u.real_name
                    FROM users_favorites f
                    JOIN users u ON f.favorited_user_id = u.id
                    WHERE f.favorited_by = $1 AND f.favorited_user_id = $2
                `, [userId, favoriteUserId]);

                if (userCheck.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Favorite not found'
                    });
                }

                const real_name = userCheck.rows[0].real_name;

                const deleteQuery = `
                    DELETE FROM users_favorites
                    WHERE favorited_by = $1
                    AND favorited_user_id = $2
                `;

                await this.db.query(deleteQuery, [userId, favoriteUserId]);
                
                res.json({
                    success: true,
                    message: `${real_name} removed from favorites`
                });
            } catch (error) {
                console.log('ℹ️ Error removing favorite:', error.message);
                throw error;
            }
        } catch (error) {
            console.error('❌ Error removing favorite:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to remove favorite'
            });
        }
    }

    // Add like
    async addLike(req, res) {
        try {
            // Try multiple ways to get userId (session, headers, body)
            const rawUserId = req.session?.userId || 
                              req.headers['x-user-id'] || 
                              req.headers['X-User-ID'] ||
                              req.body.from_user;
            const rawLikedUserId = req.body.userId || req.body.to_user;
            const userId = parseInt(rawUserId, 10);
            const likedUserId = parseInt(rawLikedUserId, 10);
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            if (!likedUserId || isNaN(likedUserId)) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID to like is required'
                });
            }

            if (userId === likedUserId) {
                return res.status(400).json({
                    success: false,
                    error: 'You cannot like yourself'
                });
            }

            // Validate authenticated actor exists to avoid FK violations and misleading 500s.
            const actorExists = await this.db.query(
                'SELECT id FROM users WHERE id = $1 LIMIT 1',
                [userId]
            );
            if (actorExists.rows.length === 0) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid session user'
                });
            }

            // Validate target user exists before attempting to insert like.
            const targetExists = await this.db.query(
                'SELECT id FROM users WHERE id = $1 LIMIT 1',
                [likedUserId]
            );
            if (targetExists.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User to like was not found'
                });
            }

            try {
                await this.db.query('BEGIN');

                // Check if like already exists
                const existingCheck = await this.db.query(`
                    SELECT l.id, u.real_name
                    FROM users_likes l
                    JOIN users u ON l.liked_user_id = u.id
                    WHERE l.liked_by = $1 AND l.liked_user_id = $2
                `, [userId, likedUserId]);
                
                if (existingCheck.rows.length > 0) {
                    const real_name = existingCheck.rows[0].real_name || 'this user';
                    await this.db.query('ROLLBACK');
                    return res.status(200).json({
                        success: false,
                        alreadyExists: true,
                        message: `You already liked ${real_name}`
                    });
                }
                
                // Add to users_likes table
                await this.db.query(`
                    INSERT INTO users_likes (liked_by, liked_user_id, created_at)
                    VALUES ($1, $2, NOW())
                `, [userId, likedUserId]);

                // Create/update user_matches only when likes are mutual.
                const reverseLikeCheck = await this.db.query(`
                    SELECT 1
                    FROM users_likes
                    WHERE liked_by = $1 AND liked_user_id = $2
                    LIMIT 1
                `, [likedUserId, userId]);

                if (reverseLikeCheck.rows.length > 0) {
                    const user1Id = Math.min(userId, likedUserId);
                    const user2Id = Math.max(userId, likedUserId);

                    const existingMatch = await this.db.query(`
                        SELECT id
                        FROM user_matches
                        WHERE (user1_id = $1 AND user2_id = $2)
                           OR (user1_id = $2 AND user2_id = $1)
                        LIMIT 1
                    `, [user1Id, user2Id]);

                    if (existingMatch.rows.length > 0) {
                        await this.db.query(`
                            UPDATE user_matches
                            SET user1_id = $1,
                                user2_id = $2,
                                match_date = NOW(),
                                status = 'Accepted',
                                user1_seen_at = NULL,
                                user2_seen_at = NULL
                            WHERE id = $3
                        `, [user1Id, user2Id, existingMatch.rows[0].id]);
                    } else {
                        await this.db.query(`
                            INSERT INTO user_matches (user1_id, user2_id, match_date, status, user1_seen_at, user2_seen_at)
                            VALUES ($1, $2, NOW(), 'Accepted', NULL, NULL)
                        `, [user1Id, user2Id]);
                    }
                }

                await this.db.query('COMMIT');
                
                // Optionally log to user_activity for analytics (with rate limiting)
                try {
                    await this.rateLimiter.logActivity(
                        userId, 
                        'like', 
                        likedUserId, 
                        `Liked user ${likedUserId}`,
                        5 // 5 second rate limit
                    );
                } catch (logError) {
                    console.log('ℹ️ Could not log like activity:', logError.message);
                }
                
                console.log(`💖 User ${userId} liked user ${likedUserId}`);
                
                res.json({
                    success: true,
                    message: 'Like added successfully'
                });
            } catch (error) {
                try {
                    await this.db.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('❌ Error rolling back like transaction:', rollbackError);
                }

                console.error('❌ Error adding like:', error);
                // Check if it's a unique constraint violation
                if (error.code === '23505') { // PostgreSQL unique violation
                    return res.status(200).json({
                        success: false,
                        alreadyExists: true,
                        message: 'You already liked this user'
                    });
                }
                if (error.code === '23503') { // PostgreSQL foreign key violation
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid like request data'
                    });
                }
                throw error;
            }
        } catch (error) {
            console.error('❌ Error adding like:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add like'
            });
        }
    }

    // Add to favorites
    async addFavorite(req, res) {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];
            const favoriteUserId = req.body.userId;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            if (!favoriteUserId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID to favorite is required'
                });
            }

            try {
                // Check if favorite already exists
                const existingCheck = await this.db.query(`
                    SELECT f.id, u.real_name
                    FROM users_favorites f
                    JOIN users u ON f.favorited_user_id = u.id
                    WHERE f.favorited_by = $1 AND f.favorited_user_id = $2
                `, [userId, favoriteUserId]);
                
                if (existingCheck.rows.length > 0) {
                    const real_name = existingCheck.rows[0].real_name || 'this user';
                    return res.status(200).json({
                        success: false,
                        alreadyExists: true,
                        message: `${real_name} is already in your favourites`
                    });
                }
                
                // Add to users_favorites table
                await this.db.query(`
                    INSERT INTO users_favorites (favorited_by, favorited_user_id, favorited_date)
                    VALUES ($1, $2, NOW())
                `, [userId, favoriteUserId]);
                
                // Optionally log to user_activity for analytics (with rate limiting)
                try {
                    await this.rateLimiter.logActivity(
                        userId, 
                        'favorite', 
                        favoriteUserId, 
                        `Added user ${favoriteUserId} to favorites`,
                        5 // 5 second rate limit
                    );
                } catch (logError) {
                    console.log('ℹ️ Could not log favorite activity:', logError.message);
                }
                
                console.log(`⭐ User ${userId} added user ${favoriteUserId} to favorites`);
                
                res.json({
                    success: true,
                    message: 'Added to favorites successfully'
                });
            } catch (error) {
                console.error('ℹ️ Error adding favorite:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to add favorite'
                });
            }
        } catch (error) {
            console.error('❌ Error adding favorite:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add favorite'
            });
        }
    }

    // Report user
    async reportUser(req, res) {
        try {
            const userId = req.session?.userId || req.headers['x-user-id'];
            const reportedUserId = req.body.reported_user_id;
            const reportType = req.body.report_type || 'other'; // Default to 'other' if not provided
            const description = req.body.description || req.body.reason || ''; // Support both 'description' and 'reason' for backward compatibility
            
            // Log request for debugging
            console.log('📋 Report request:', {
                userId: userId,
                reportedUserId: reportedUserId,
                reportType: reportType,
                hasDescription: !!description,
                body: req.body
            });
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            if (!reportedUserId) {
                console.log('❌ Missing reported_user_id');
                return res.status(400).json({
                    success: false,
                    error: 'Reported user ID is required'
                });
            }

            // Prevent self-reporting
            if (parseInt(userId) === parseInt(reportedUserId)) {
                return res.status(400).json({
                    success: false,
                    error: 'You cannot report yourself'
                });
            }

            if (!reportType || (typeof reportType === 'string' && reportType.trim().length === 0)) {
                console.log('❌ Invalid report_type:', reportType);
                return res.status(400).json({
                    success: false,
                    error: 'Report type is required'
                });
            }

            try {
                // Check if user_reports table exists, if not create it
                await this.db.query(`
                    CREATE TABLE IF NOT EXISTS user_reports (
                        id SERIAL PRIMARY KEY,
                        reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        reported_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        report_type VARCHAR(50) NOT NULL,
                        description TEXT,
                        status VARCHAR(20) DEFAULT 'pending',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT unique_user_report UNIQUE (reporter_id, reported_user_id)
                    )
                `);

                // Check if report already exists
                const existingReport = await this.db.query(`
                    SELECT id FROM user_reports 
                    WHERE reporter_id = $1 AND reported_user_id = $2
                `, [userId, reportedUserId]);

                if (existingReport.rows.length > 0) {
                    return res.status(200).json({
                        success: true,
                        message: 'You have already reported this user',
                        alreadyExists: true
                    });
                }

                // Insert report
                await this.db.query(`
                    INSERT INTO user_reports (reporter_id, reported_user_id, report_type, description, created_at)
                    VALUES ($1, $2, $3, $4, NOW())
                `, [userId, reportedUserId, reportType, description]);
                
                // Also log to activity table (with rate limiting)
                try {
                    const logDescription = description ? description.substring(0, 100) : `Report type: ${reportType}`;
                    await this.rateLimiter.logActivity(
                        userId, 
                        'report', 
                        reportedUserId, 
                        `Reported user ${reportedUserId} (${reportType}): ${logDescription}`,
                        10 // 10 second rate limit for reports
                    );
                } catch (logError) {
                    console.log('ℹ️ Could not log report activity:', logError.message);
                }
                
                console.log(`🚨 User ${userId} reported user ${reportedUserId} - Type: ${reportType}${description ? ` - Description: ${description.substring(0, 100)}` : ''}`);
                
                res.json({
                    success: true,
                    message: 'Report submitted successfully'
                });
            } catch (error) {
                console.error('ℹ️ Error submitting report:', error.message);
                
                // Handle duplicate key violation (unique constraint)
                if (error.code === '23505' || error.message.includes('unique_user_report') || error.message.includes('duplicate key')) {
                    return res.status(400).json({
                        success: false,
                        error: 'You have already reported this user',
                        alreadyExists: true
                    });
                }
                
                res.status(500).json({
                    success: false,
                    error: 'Failed to submit report'
                });
            }
        } catch (error) {
            console.error('❌ Error reporting user:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to report user'
            });
        }
    }
}

module.exports = ActivityController;

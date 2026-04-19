const { query, pool } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

const UPLOAD_PATH_CANDIDATES = [
    process.env.UPLOADS_PATH,
    path.join(__dirname, '..', 'uploads'),
    path.join(__dirname, '..', '..', 'uploads'),
    path.join(__dirname, '..', '..', 'app', 'uploads'),
    path.join(__dirname, '..', '..', 'app', 'uploads', 'profile_images'),
    path.join(__dirname, '..', '..', 'app', 'uploads', 'chat_images'),
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), '..', 'uploads'),
    path.join(process.cwd(), '..', 'app', 'uploads'),
    path.join(process.cwd(), '..', '..', 'uploads')
]
    .filter(Boolean)
    .map(p => path.resolve(p));

async function directoryExists(dirPath) {
    try {
        const stats = await fs.stat(dirPath);
        return stats.isDirectory();
    } catch (error) {
        return false;
    }
}

function normalizeStoredUploadPath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') {
        return null;
    }

    let normalized = rawPath.trim();
    if (!normalized) {
        return null;
    }

    try {
        if (/^https?:\/\//i.test(normalized)) {
            normalized = new URL(normalized).pathname || normalized;
        }
    } catch (error) {
        // Keep original value when URL parsing fails.
    }

    normalized = normalized
        .replace(/\\/g, '/')
        .split('?')[0]
        .split('#')[0]
        .replace(/^\/+/, '')
        .replace(/^\.\/+/, '');

    if (normalized.startsWith('uploads/')) {
        normalized = normalized.slice('uploads/'.length);
    }

    return normalized || null;
}

function safeJoin(baseDir, relativePath) {
    const base = path.resolve(baseDir);
    const target = path.resolve(base, relativePath);
    if (target === base || target.startsWith(`${base}${path.sep}`)) {
        return target;
    }
    return null;
}

async function resolveUploadSubdirectories(subdirName) {
    const directories = new Set();

    for (const candidate of UPLOAD_PATH_CANDIDATES) {
        if (!candidate) {
            continue;
        }

        if (!(await directoryExists(candidate))) {
            continue;
        }

        if (path.basename(candidate) === subdirName) {
            directories.add(candidate);
            continue;
        }

        const subdirPath = path.join(candidate, subdirName);
        if (await directoryExists(subdirPath)) {
            directories.add(subdirPath);
        }
    }

    return Array.from(directories);
}

function buildDeletionCandidates(storedPath, subdirName, candidateDirectories) {
    const normalizedPath = normalizeStoredUploadPath(storedPath);
    if (!normalizedPath) {
        return [];
    }

    const candidates = new Set();
    const directRelativePath = normalizedPath.startsWith(`${subdirName}/`)
        ? normalizedPath.slice(subdirName.length + 1)
        : normalizedPath;
    const baseName = path.basename(directRelativePath);

    for (const directory of candidateDirectories) {
        const directCandidate = safeJoin(directory, directRelativePath);
        if (directCandidate) {
            candidates.add(directCandidate);
        }

        const baseNameCandidate = safeJoin(directory, baseName);
        if (baseNameCandidate) {
            candidates.add(baseNameCandidate);
        }
    }

    if (path.isAbsolute(storedPath)) {
        candidates.add(storedPath);
    }

    return Array.from(candidates);
}

async function deleteStoredUploadFile(storedPath, subdirName, candidateDirectories, label) {
    const deleteCandidates = buildDeletionCandidates(storedPath, subdirName, candidateDirectories);
    let hadError = false;

    for (const candidatePath of deleteCandidates) {
        try {
            await fs.unlink(candidatePath);
            logger.info(`🗑️ Deleted ${label}: ${candidatePath}`);
            return { deleted: true, hadError };
        } catch (error) {
            if (error.code !== 'ENOENT') {
                hadError = true;
                logger.warn(`⚠️ Could not delete ${label} at ${candidatePath}: ${error.message}`);
            }
        }
    }

    return { deleted: false, hadError };
}

function buildThumbnailVariants(storedPath) {
    const normalizedPath = normalizeStoredUploadPath(storedPath);
    if (!normalizedPath) {
        return [];
    }

    const ext = path.extname(normalizedPath);
    if (!ext) {
        return [];
    }

    const stem = normalizedPath.slice(0, -ext.length);
    return [
        `${stem}_thumb${ext}`,
        `${stem}_thumbnail${ext}`,
        `${stem}.thumb${ext}`
    ];
}

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

            const countResult = await query(countQuery, params);
            const total = parseInt(countResult.rows[0]?.total || 0);

            // Get users with aggregated statistics
            // Start with a simple query without subqueries that might reference non-existent tables
            let usersQuery = `
                SELECT 
                    u.id,
                    u.real_name,
                    u.email,
                    ua.about_me,
                    ua.about_partner AS partner_preferences,
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
                LEFT JOIN user_attributes ua ON ua.user_id = u.id
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

            const usersResult = await query(usersQuery, finalParams);
            
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
            const userResult = await query(userQuery, [userId]);

            if (userResult.rows.length === 0) {
                return null;
            }

            const user = userResult.rows[0];

            // Get user attributes (with error handling)
            try {
                const attrResult = await query('SELECT * FROM user_attributes WHERE user_id = $1', [userId]);
                user.attributes = attrResult.rows[0] || {};
                user.about_me = user.attributes.about_me || null;
                user.partner_preferences = user.attributes.about_partner || null;
            } catch (e) {
                logger.warn('Could not get user attributes:', e.message);
                user.attributes = {};
                user.about_me = null;
                user.partner_preferences = null;
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

            const fieldAliases = {
                // Accept misspelling from clients while writing to the correct column.
                parner_preferences: 'partner_preferences'
            };

            const updateFields = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(updateData)) {
                const dbField = fieldAliases[key] || key;
                if (allowedFields.includes(dbField) && value !== undefined) {
                    updateFields.push(`${dbField} = $${paramIndex}`);
                    values.push(value);
                    paramIndex++;
                }
            }

            let updatedUserRow = null;

            if (updateFields.length > 0) {
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
                updatedUserRow = result.rows[0];
            }

            if (Object.prototype.hasOwnProperty.call(updateData, 'about_me')) {
                await query(
                    `INSERT INTO user_attributes (user_id, about_me, about_partner)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (user_id)
                     DO UPDATE SET
                        about_me = COALESCE(EXCLUDED.about_me, user_attributes.about_me),
                        about_partner = COALESCE(EXCLUDED.about_partner, user_attributes.about_partner)`,
                    [
                        userId,
                        updateData.about_me,
                        Object.prototype.hasOwnProperty.call(updateData, 'partner_preferences')
                            ? updateData.partner_preferences
                            : (Object.prototype.hasOwnProperty.call(updateData, 'parner_preferences') ? updateData.parner_preferences : null)
                    ]
                );
            }

            const partnerPreferenceValue = Object.prototype.hasOwnProperty.call(updateData, 'partner_preferences')
                ? updateData.partner_preferences
                : (Object.prototype.hasOwnProperty.call(updateData, 'parner_preferences') ? updateData.parner_preferences : undefined);

            if (partnerPreferenceValue !== undefined) {
                await query(
                    `INSERT INTO user_attributes (user_id, about_partner)
                     VALUES ($1, $2)
                     ON CONFLICT (user_id)
                     DO UPDATE SET about_partner = EXCLUDED.about_partner`,
                    [userId, partnerPreferenceValue]
                );
            }

            if (!updatedUserRow) {
                const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);
                if (userResult.rows.length === 0) {
                    return { success: false, message: 'User not found' };
                }
                updatedUserRow = userResult.rows[0];
            }

            // Clear cache
            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                await redis.del('admin:users:*');
            }

            return {
                success: true,
                message: 'User updated successfully',
                user: updatedUserRow
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

            let savepointCounter = 0;
            const nextSavepoint = (prefix) => `${prefix}_${savepointCounter += 1}`;

            const runOptionalQuery = async (sql, params = []) => {
                const savepointName = nextSavepoint('sp_optional');
                await client.query(`SAVEPOINT ${savepointName}`);
                try {
                    const result = await client.query(sql, params);
                    await client.query(`RELEASE SAVEPOINT ${savepointName}`);
                    return result;
                } catch (error) {
                    await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                    await client.query(`RELEASE SAVEPOINT ${savepointName}`);

                    if (error && error.code === '42P01') {
                        logger.warn(`Skipping optional query because table does not exist (user ${userId}): ${error.message}`);
                        return { rows: [], rowCount: 0 };
                    }
                    throw error;
                }
            };
            
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
            const conversationPartners = await runOptionalQuery(`
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
            await runOptionalQuery(`
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
                    await runOptionalQuery(`
                        INSERT INTO users_deleted_receivers (deleted_user_id, receiver_id, created_at)
                        VALUES ($1, $2, NOW())
                        ON CONFLICT (deleted_user_id, receiver_id) DO NOTHING
                    `, [userId, receiverId]);
                }
            }
            
            // STEP 5: HARD DELETE ALL USER DATA (same order and logic as main server)
            
            // 5a. Get and delete message attachment files BEFORE deleting database records
            const attachmentsResult = await runOptionalQuery(`
                SELECT file_path, thumbnail_path 
                FROM user_message_attachments 
                WHERE message_id IN (SELECT id FROM user_messages WHERE sender_id = $1 OR receiver_id = $1)
            `, [userId]);
            
            const chatImageDirectories = await resolveUploadSubdirectories('chat_images');
            const profileImageDirectories = await resolveUploadSubdirectories('profile_images');

            if (chatImageDirectories.length === 0) {
                logger.warn(`No chat_images directory found while deleting user ${userId}. Attachment DB rows will still be removed.`);
            }
            if (profileImageDirectories.length === 0) {
                logger.warn(`No profile_images directory found while deleting user ${userId}. Image DB rows will still be removed.`);
            }
            
            for (const attachment of attachmentsResult.rows) {
                if (attachment.file_path || attachment.thumbnail_path) {
                    try {
                        if (attachment.file_path) {
                            await deleteStoredUploadFile(
                                attachment.file_path,
                                'chat_images',
                                chatImageDirectories,
                                'attachment file'
                            );
                        }
                        if (attachment.thumbnail_path) {
                            await deleteStoredUploadFile(
                                attachment.thumbnail_path,
                                'chat_images',
                                chatImageDirectories,
                                'attachment thumbnail'
                            );
                        }
                    } catch (fileError) {
                        logger.warn(`⚠️ Warning deleting attachment file for user ${userId}:`, fileError.message);
                    }
                }
            }
            
            // Now delete message attachments from database
            await runOptionalQuery(`
                DELETE FROM user_message_attachments 
                WHERE message_id IN (SELECT id FROM user_messages WHERE sender_id = $1 OR receiver_id = $1)
            `, [userId]);
            
            // 5b. Delete all messages (both sent and received)
            await runOptionalQuery('DELETE FROM user_messages WHERE sender_id = $1 OR receiver_id = $1', [userId]);
            
            // 5c. Delete all likes (both given and received)
            await runOptionalQuery('DELETE FROM users_likes WHERE liked_by = $1 OR liked_user_id = $1', [userId]);
            
            // 5d. Delete all profile views (both as viewer and viewed)
            await runOptionalQuery('DELETE FROM users_profile_views WHERE viewer_id = $1 OR viewed_user_id = $1', [userId]);
            
            // 5e. Get and delete user profile image files BEFORE deleting database records
            const userImagesResult = await runOptionalQuery(
                'SELECT file_name FROM user_images WHERE user_id = $1',
                [userId]
            );
            
            // Delete physical profile image files
            let deletedCount = 0;
            let errorCount = 0;
            
            for (const image of userImagesResult.rows) {
                if (image.file_name) {
                    try {
                        const imageDeleteResult = await deleteStoredUploadFile(
                            image.file_name,
                            'profile_images',
                            profileImageDirectories,
                            'profile image file'
                        );
                        if (imageDeleteResult.deleted) {
                            deletedCount++;
                        }
                        if (imageDeleteResult.hadError) {
                            errorCount++;
                        }
                        
                        // Also try to delete thumbnails if they exist (common naming patterns).
                        const thumbnailPatterns = buildThumbnailVariants(image.file_name);
                        
                        for (const thumbPattern of thumbnailPatterns) {
                            const thumbnailDeleteResult = await deleteStoredUploadFile(
                                thumbPattern,
                                'profile_images',
                                profileImageDirectories,
                                'profile image thumbnail'
                            );
                            if (thumbnailDeleteResult.deleted) {
                                deletedCount++;
                            }
                            if (thumbnailDeleteResult.hadError) {
                                errorCount++;
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
            await runOptionalQuery('DELETE FROM user_images WHERE user_id = $1', [userId]);
            logger.info(`🗑️ Deleted ${userImagesResult.rows.length} profile image record(s) from database for user ${userId}`);
            
            // 5f. Delete other user data
            await runOptionalQuery('DELETE FROM users_favorites WHERE favorited_by = $1 OR favorited_user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM users_blocked_by_users WHERE blocker_id = $1 OR blocked_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_interests_multiple WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_hobbies_multiple WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_interests WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_hobbies WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_attributes WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_preferences WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_matches WHERE user1_id = $1 OR user2_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_activity WHERE user_id = $1 OR target_user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_reports WHERE reporter_id = $1 OR reported_user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_compatibility_cache WHERE user_id = $1 OR target_user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_conversation_removals WHERE remover_id = $1 OR removed_user_id = $1', [userId]);
            
            // 5g. Cascade cleanup: Remove orphaned records from users_deleted_receivers
            // When this user is deleted, they can no longer see deleted users, so remove all records
            // where this user was a receiver
            await runOptionalQuery('DELETE FROM users_deleted_receivers WHERE receiver_id = $1', [userId]);
            
            // 5h. Delete optional settings tables (same as main server)
            await runOptionalQuery('DELETE FROM user_profile_settings WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_measurement_preferences WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_contact_countries WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_languages WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_location_history WHERE user_id = $1', [userId]);
            await runOptionalQuery('DELETE FROM user_name_change_history WHERE user_id = $1', [userId]);

            // 5i. Safety cleanup for any direct FK dependencies on users(id) that are not explicitly handled above.
            // This prevents hard-delete failures when new user-linked tables are added.
            const fkDependencies = await client.query(`
                SELECT
                    ns.nspname AS schema_name,
                    cls.relname AS table_name,
                    att.attname AS column_name
                FROM pg_constraint con
                JOIN pg_class cls ON cls.oid = con.conrelid
                JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                JOIN pg_attribute att ON att.attrelid = con.conrelid
                    AND att.attnum = con.conkey[1]
                WHERE con.contype = 'f'
                    AND con.confrelid = 'users'::regclass
                    AND array_length(con.conkey, 1) = 1
                    AND cls.relname <> 'users'
            `);

            for (const dep of fkDependencies.rows) {
                const schemaName = String(dep.schema_name).replace(/"/g, '""');
                const tableName = String(dep.table_name).replace(/"/g, '""');
                const columnName = String(dep.column_name).replace(/"/g, '""');

                try {
                    await client.query(
                        `DELETE FROM "${schemaName}"."${tableName}" WHERE "${columnName}" = $1`,
                        [userId]
                    );
                } catch (depError) {
                    // Keep behavior resilient to environment-specific table/schema differences.
                    logger.warn(`FK dependency cleanup skipped for ${schemaName}.${tableName}.${columnName}: ${depError.message}`);
                }
            }
            
            // STEP 6: Finally, hard delete the user record itself from users table (same as main server)
            // This is the final step - removes the user record completely from the database
            let userDeleted = false;
            let fkRetryCount = 0;
            const fkRetryLimit = 15;

            while (!userDeleted && fkRetryCount < fkRetryLimit) {
                const deleteSavepoint = nextSavepoint('sp_delete_user');
                await client.query(`SAVEPOINT ${deleteSavepoint}`);

                try {
                    await client.query('DELETE FROM users WHERE id = $1', [userId]);
                    await client.query(`RELEASE SAVEPOINT ${deleteSavepoint}`);
                    userDeleted = true;
                    break;
                } catch (deleteError) {
                    await client.query(`ROLLBACK TO SAVEPOINT ${deleteSavepoint}`);
                    await client.query(`RELEASE SAVEPOINT ${deleteSavepoint}`);

                    // If a dependent row still exists, resolve the exact constraint and remove the blocking rows.
                    if (deleteError && deleteError.code === '23503' && deleteError.constraint) {
                        fkRetryCount += 1;

                        const blockingConstraint = await client.query(`
                            SELECT
                                ns.nspname AS schema_name,
                                cls.relname AS table_name,
                                att.attname AS column_name,
                                array_length(con.conkey, 1) AS column_count
                            FROM pg_constraint con
                            JOIN pg_class cls ON cls.oid = con.conrelid
                            JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                            JOIN pg_attribute att ON att.attrelid = con.conrelid
                                AND att.attnum = con.conkey[1]
                            WHERE con.conname = $1
                            LIMIT 1
                        `, [deleteError.constraint]);

                        if (blockingConstraint.rows.length === 0) {
                            throw deleteError;
                        }

                        const dep = blockingConstraint.rows[0];
                        if (parseInt(dep.column_count, 10) !== 1) {
                            throw deleteError;
                        }

                        const schemaName = String(dep.schema_name).replace(/"/g, '""');
                        const tableName = String(dep.table_name).replace(/"/g, '""');
                        const columnName = String(dep.column_name).replace(/"/g, '""');

                        logger.warn(
                            `Resolving FK block (${deleteError.constraint}) by deleting rows from ${schemaName}.${tableName}.${columnName} for user ${userId}`
                        );

                        await client.query(
                            `DELETE FROM "${schemaName}"."${tableName}" WHERE "${columnName}" = $1`,
                            [userId]
                        );

                        continue;
                    }

                    throw deleteError;
                }
            }

            if (!userDeleted) {
                throw new Error(`Could not delete user ${userId} after resolving dependent foreign key rows`);
            }
            
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











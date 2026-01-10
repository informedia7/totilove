const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class UserManagementService {
    constructor(db, redis) {
        this.db = db;
        this.redis = redis;
        this.cacheExpiry = 300; // 5 minutes
    }

    async getUsers(options = {}) {
        const {
            page = 1,
            limit = 20,
            search = '',
            status = '',
            sortBy = 'date_joined',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;
        const cacheKey = `users:${JSON.stringify(options)}`;

        try {
            // Try to get from cache first
            if (this.redis && typeof this.redis.get === 'function') {
                const cached = await this.redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            let whereClause = 'WHERE 1=1';
            const params = [];
            let paramIndex = 1;

            if (search) {
                whereClause += ` AND (u.real_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }

            if (status) {
                whereClause += ` AND u.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM users u
                ${whereClause}
            `;
            const countResult = await this.db.query(countQuery, params);
            const total = parseInt(countResult.rows[0].total);

            // Get users with pagination
            const usersQuery = `
                SELECT 
                    u.id, u.real_name, u.email, u.birthdate, u.gender, u.status,
                    u.date_joined, u.last_login, u.is_verified, u.is_banned,
                    u.country_id, u.state_id, u.city_id,
                    c.name as country_name, s.name as state_name, ci.name as city_name,
                    (SELECT COUNT(*) FROM user_images WHERE user_id = u.id) as image_count,
                    (SELECT COUNT(*) FROM users_likes WHERE liked_user_id = u.id) as like_count,
                    (SELECT COUNT(*) FROM user_messages WHERE sender_id = u.id) as message_count
                FROM users u
                LEFT JOIN country c ON u.country_id = c.id
                LEFT JOIN state s ON u.state_id = s.id
                LEFT JOIN city ci ON u.city_id = ci.id
                ${whereClause}
                ORDER BY u.${sortBy} ${sortOrder}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
            params.push(limit, offset);
            
            const usersResult = await this.db.query(usersQuery, params);
            const users = usersResult.rows.map(user => ({
                ...user,
                age: user.birthdate ? this.calculateAge(user.birthdate) : null,
                last_seen: user.last_login ? this.formatLastSeen(user.last_login) : 'Never'
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

            // Cache the result
            if (this.redis && typeof this.redis.set === 'function') {
                await this.redis.set(cacheKey, JSON.stringify(result), this.cacheExpiry);
            }

            return result;
        } catch (error) {
            console.error('Error fetching users:', error);
            throw error;
        }
    }

    async getUserById(userId) {
        const cacheKey = `user:${userId}`;

        try {
            // Try to get from cache first
            if (this.redis && typeof this.redis.get === 'function') {
                const cached = await this.redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            const query = `
                SELECT 
                    u.*,
                    c.name as country_name, s.name as state_name, ci.name as city_name,
                    (SELECT COUNT(*) FROM user_images WHERE user_id = u.id) as image_count,
                    (SELECT COUNT(*) FROM users_likes WHERE liked_user_id = u.id) as like_count,
                    (SELECT COUNT(*) FROM users_likes WHERE liked_by = u.id) as likes_given_count,
                    (SELECT COUNT(*) FROM user_messages WHERE sender_id = u.id) as message_count,
                    (SELECT COUNT(*) FROM user_messages WHERE receiver_id = u.id) as received_messages_count
                FROM users u
                LEFT JOIN country c ON u.country_id = c.id
                LEFT JOIN state s ON u.state_id = s.id
                LEFT JOIN city ci ON u.city_id = ci.id
                WHERE u.id = $1
            `;

            const result = await this.db.query(query, [userId]);
            
            if (result.rows.length === 0) {
                return null;
            }

            const user = result.rows[0];
            user.age = user.birthdate ? this.calculateAge(user.birthdate) : null;
            user.last_seen = user.last_login ? this.formatLastSeen(user.last_login) : 'Never';

            // Cache the result
            if (this.redis && typeof this.redis.set === 'function') {
                await this.redis.set(cacheKey, JSON.stringify(user), this.cacheExpiry);
            }

            return user;
        } catch (error) {
            console.error('Error fetching user by ID:', error);
            throw error;
        }
    }

    async updateUser(userId, updateData) {
        try {
            const allowedFields = [
                'real_name', 'email', 'birthdate', 'gender', 'country_id', 
                'state_id', 'city_id', 'status', 'is_verified', 'is_banned'
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
            const query = `
                UPDATE users 
                SET ${updateFields.join(', ')}, updated_at = NOW()
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await this.db.query(query, values);
            
            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            // Clear cache
            if (this.redis && typeof this.redis.del === 'function') {
                await this.redis.del(`user:${userId}`);
                await this.redis.del('users:*');
            }

            return {
                success: true,
                message: 'User updated successfully',
                user: result.rows[0]
            };
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    async deleteUser(userId) {
        if (!this.db) {
            throw new Error('Database connection not available');
        }
        
        console.log(`🗑️  deleteUser called for userId: ${userId}`);
        console.log(`🔗 Database type: ${typeof this.db}, has connect: ${typeof this.db.connect === 'function'}`);
        
        if (typeof this.db.connect !== 'function') {
            const dbType = typeof this.db;
            const dbKeys = this.db ? Object.keys(this.db) : [];
            throw new Error(`Database pool does not have a connect() method. Type: ${dbType}, Keys: ${dbKeys.join(', ')}`);
        }
        
        let client;
        try {
            console.log('🔗 Attempting to get database client from pool...');
            client = await this.db.connect();
            console.log('✅ Database client obtained successfully');
        } catch (connectError) {
            console.error('❌ Error connecting to database pool:', connectError);
            console.error('❌ Connect error message:', connectError.message);
            console.error('❌ Connect error stack:', connectError.stack);
            throw new Error(`Failed to connect to database: ${connectError.message}`);
        }
        
        try {
            await client.query('BEGIN');
            
            // STEP 1: Get user info BEFORE any deletions (critical - need real real_name/email)
            const userInfo = await client.query(`
                SELECT id, real_name, email FROM users WHERE id = $1
            `, [userId]);
            
            if (userInfo.rows.length === 0) {
                throw new Error('User not found');
            }
            
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
            
            // STEP 3: Store deleted user info in users_deleted (global list - one entry per deleted user)
            // Mark as deleted by user
            await client.query(`
                INSERT INTO users_deleted (deleted_user_id, real_name, email, deleted_by, created_at)
                VALUES ($1, $2, $3, 'user', NOW())
                ON CONFLICT (deleted_user_id) DO UPDATE
                SET real_name = EXCLUDED.real_name, email = EXCLUDED.email, deleted_by = 'user'
            `, [userId, real_name, email]);
            
            // STEP 4: Store receiver mappings in users_deleted_receivers (one row per receiver)
            // This allows us to know which receivers should see this deleted user even after messages are hard deleted
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
            
            // STEP 5: HARD DELETE ALL USER DATA
            
            // 5a. Get and delete message attachment files BEFORE deleting database records
            const attachmentsResult = await client.query(`
                SELECT file_path, thumbnail_path 
                FROM user_message_attachments 
                WHERE message_id IN (SELECT id FROM user_messages WHERE sender_id = $1 OR receiver_id = $1)
            `, [userId]);
            
            // Delete physical attachment files
            let imageHandler = null;
            try {
                const ChatImageHandler = require('../utils/chatImageHandler');
                imageHandler = new ChatImageHandler();
            } catch (handlerError) {
                // ChatImageHandler not available, skipping attachment file deletion
            }
            
            if (imageHandler) {
                for (const attachment of attachmentsResult.rows) {
                    if (attachment.file_path || attachment.thumbnail_path) {
                        try {
                            await imageHandler.deleteImageFilesByPaths(
                                attachment.file_path,
                                attachment.thumbnail_path
                            );
                        } catch (fileError) {
                            // Error deleting attachment file, continue
                        }
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
            const profileImagesDir = path.join(__dirname, '..', 'app', 'uploads', 'profile_images');
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
                        } catch (fileError) {
                            if (fileError.code !== 'ENOENT') {
                                errorCount++;
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
                            } catch (thumbError) {
                                // Ignore if thumbnail doesn't exist
                            }
                        }
                    } catch (fileError) {
                        errorCount++;
                    }
                }
            }
            
            // Now delete user profile images from database
            await client.query('DELETE FROM user_images WHERE user_id = $1', [userId]);
            
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
                
            // 5h. Delete optional settings tables
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
            
            // STEP 6: Finally, hard delete the user record itself
            await client.query('DELETE FROM users WHERE id = $1', [userId]);
            
            await client.query('COMMIT');
            
            // Clear cache
            if (this.redis && typeof this.redis.del === 'function') {
                try {
                    await this.redis.del(`user:${userId}`);
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

    async banUser(userId, reason = '') {
        try {
            const query = `
                UPDATE users 
                SET is_banned = true, status = 'banned', banned_reason = $1, banned_at = NOW()
                WHERE id = $2
                RETURNING *
            `;

            const result = await this.db.query(query, [reason, userId]);
            
            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            // Clear cache
            if (this.redis && typeof this.redis.del === 'function') {
                await this.redis.del(`user:${userId}`);
                await this.redis.del('users:*');
            }

            return {
                success: true,
                message: 'User banned successfully',
                user: result.rows[0]
            };
        } catch (error) {
            console.error('Error banning user:', error);
            throw error;
        }
    }

    async unbanUser(userId) {
        try {
            const query = `
                UPDATE users 
                SET is_banned = false, status = 'active', banned_reason = NULL, banned_at = NULL
                WHERE id = $1
                RETURNING *
            `;

            const result = await this.db.query(query, [userId]);
            
            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            // Clear cache
            if (this.redis && typeof this.redis.del === 'function') {
                await this.redis.del(`user:${userId}`);
                await this.redis.del('users:*');
            }

            return {
                success: true,
                message: 'User unbanned successfully',
                user: result.rows[0]
            };
        } catch (error) {
            console.error('Error unbanning user:', error);
            throw error;
        }
    }

    async getUserStats(userId) {
        try {
            const query = `
                SELECT 
                    (SELECT COUNT(*) FROM user_images WHERE user_id = $1) as image_count,
                    (SELECT COUNT(*) FROM users_likes WHERE liked_user_id = $1) as like_count,
                    (SELECT COUNT(*) FROM users_likes WHERE liked_by = $1) as likes_given_count,
                    (SELECT COUNT(*) FROM user_messages WHERE sender_id = $1) as message_count,
                    (SELECT COUNT(*) FROM user_messages WHERE receiver_id = $1) as received_messages_count,
                    (SELECT COUNT(*) FROM users WHERE DATE(date_joined) = DATE(NOW())) as new_users_today,
                    (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '24 hours') as active_users_24h
            `;

            const result = await this.db.query(query, [userId]);
            return result.rows[0];
        } catch (error) {
            console.error('Error fetching user stats:', error);
            throw error;
        }
    }

    async getUserActivity(userId, days = 30) {
        try {
            const query = `
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as activity_count
                FROM (
                    SELECT timestamp as created_at FROM user_messages WHERE sender_id = $1
                    UNION ALL
                    SELECT created_at FROM users_likes WHERE liked_by = $1
                    UNION ALL
                    SELECT last_login FROM users WHERE id = $1 AND last_login > NOW() - INTERVAL '${days} days'
                ) activities
                WHERE created_at > NOW() - INTERVAL '${days} days'
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `;

            const result = await this.db.query(query, [userId]);
            return result.rows;
        } catch (error) {
            console.error('Error fetching user activity:', error);
            throw error;
        }
    }

    async bulkUpdateUsers(userIds, updateData) {
        try {
            const allowedFields = ['status', 'is_verified', 'is_banned'];
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

            const placeholders = userIds.map((_, index) => `$${paramIndex + index}`).join(',');
            values.push(...userIds);

            const query = `
                UPDATE users 
                SET ${updateFields.join(', ')}, updated_at = NOW()
                WHERE id IN (${placeholders})
                RETURNING id
            `;

            const result = await this.db.query(query, values);

            // Clear cache
            if (this.redis && typeof this.redis.del === 'function') {
                await this.redis.del('users:*');
                for (const userId of userIds) {
                    await this.redis.del(`user:${userId}`);
                }
            }

            return {
                success: true,
                message: `${result.rows.length} users updated successfully`,
                updatedCount: result.rows.length
            };
        } catch (error) {
            console.error('Error bulk updating users:', error);
            throw error;
        }
    }

    async exportUsers(format = 'csv') {
        try {
            const query = `
                SELECT 
                    u.id, u.real_name, u.email, u.birthdate, u.gender, u.status,
                    u.date_joined, u.last_login, u.is_verified, u.is_banned,
                    c.name as country_name, s.name as state_name, ci.name as city_name
                FROM users u
                LEFT JOIN country c ON u.country_id = c.id
                LEFT JOIN state s ON u.state_id = s.id
                LEFT JOIN city ci ON u.city_id = ci.id
                ORDER BY u.date_joined DESC
            `;

            const result = await this.db.query(query);
            const users = result.rows;

            if (format === 'csv') {
                return this.convertToCSV(users);
            } else if (format === 'json') {
                return JSON.stringify(users, null, 2);
            }

            throw new Error('Unsupported export format');
        } catch (error) {
            console.error('Error exporting users:', error);
            throw error;
        }
    }

    convertToCSV(data) {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];

        for (const row of data) {
            const values = headers.map(header => {
                const value = row[header];
                return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
            });
            csvRows.push(values.join(','));
        }

        return csvRows.join('\n');
    }

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

module.exports = UserManagementService; 
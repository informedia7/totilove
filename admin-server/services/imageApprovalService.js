const { query } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class ImageApprovalService {
    constructor() {
        this.cacheExpiry = 300; // 5 minutes
    }

    /**
     * Get image approval settings
     */
    async getImageApprovalSettings() {
        const cacheKey = 'admin:image_approval_settings';

        try {
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // Get settings from admin_system_settings table
            let result;
            try {
                result = await query(
                    `SELECT setting_key, setting_value, setting_type 
                     FROM admin_system_settings 
                     WHERE setting_key LIKE 'image_approval_%'`
                );
            } catch (error) {
                logger.warn('admin_system_settings table might not exist, using defaults');
                result = { rows: [] };
            }

            const settings = {};
            result.rows.forEach(row => {
                let value = row.setting_value;
                if (row.setting_type === 'boolean') {
                    value = value === 'true' || value === true;
                } else if (row.setting_type === 'number') {
                    value = parseFloat(value);
                }
                settings[row.setting_key] = value;
            });

            // Default values
            const defaultSettings = {
                image_approval_enabled: false
            };

            const finalSettings = { ...defaultSettings, ...settings };

            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(finalSettings), this.cacheExpiry);
            }

            return finalSettings;
        } catch (error) {
            logger.error('Error fetching image approval settings:', error);
            throw error;
        }
    }

    /**
     * Update image approval settings
     */
    async updateImageApprovalSettings(settings) {
        try {
            const allowedKeys = ['image_approval_enabled'];

            for (const [key, value] of Object.entries(settings)) {
                if (!allowedKeys.includes(key)) {
                    continue;
                }

                let settingValue = value;
                let settingType = 'boolean';

                if (typeof value === 'boolean') {
                    settingValue = value.toString();
                }

                // Upsert setting
                try {
                    await query(
                        `INSERT INTO admin_system_settings (setting_key, setting_value, setting_type, updated_at, updated_by)
                         VALUES ($1, $2, $3, NOW(), $4)
                         ON CONFLICT (setting_key) 
                         DO UPDATE SET 
                             setting_value = EXCLUDED.setting_value,
                             setting_type = EXCLUDED.setting_type,
                             updated_at = NOW(),
                             updated_by = EXCLUDED.updated_by`,
                        [key, settingValue, settingType, null]
                    );
                } catch (error) {
                    // If ON CONFLICT fails, try UPDATE then INSERT
                    const updateResult = await query(
                        `UPDATE admin_system_settings 
                         SET setting_value = $1, setting_type = $2, updated_at = NOW(), updated_by = $3
                         WHERE setting_key = $4`,
                        [settingValue, settingType, null, key]
                    );

                    if (updateResult.rowCount === 0) {
                        await query(
                            `INSERT INTO admin_system_settings (setting_key, setting_value, setting_type, updated_at, updated_by)
                             VALUES ($1, $2, $3, NOW(), $4)`,
                            [key, settingValue, settingType, null]
                        );
                    }
                }
            }

            // Clear cache
            if (redis.enabled) {
                await redis.del('admin:image_approval_settings');
            }

            return {
                success: true,
                message: 'Image approval settings updated successfully'
            };
        } catch (error) {
            logger.error('Error updating image approval settings:', error);
            throw error;
        }
    }

    /**
     * Get pending images (need approval)
     */
    async getPendingImages(options = {}) {
        const {
            page = 1,
            limit = 20,
            search = '',
            userId = null,
            sortBy = 'uploaded_at',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;

        try {
            // First, ensure approval_status column exists
            await this.ensureApprovalStatusColumn();

            // Check if approval_status column actually exists before using it
            const columnCheck = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'user_images' 
                AND column_name = 'approval_status'
            `);

            // Build WHERE clause - use column check to determine if we can use approval_status
            let whereConditions = [];
            if (columnCheck.rows.length > 0) {
                whereConditions.push(`(ui.approval_status IS NULL OR ui.approval_status = 'pending')`);
            } else {
                // If column doesn't exist, treat all images as pending
                whereConditions.push('1=1');
            }

            const params = [];
            let paramIndex = 1;

            if (search) {
                whereConditions.push(`(
                    u.real_name ILIKE $${paramIndex} OR 
                    u.email ILIKE $${paramIndex} OR
                    ui.file_name ILIKE $${paramIndex} OR
                    CAST(ui.user_id AS TEXT) = $${paramIndex}
                )`);
                params.push(`%${search}%`);
                paramIndex++;
            }

            if (userId) {
                whereConditions.push(`ui.user_id = $${paramIndex}`);
                params.push(userId);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Validate sortBy and map to actual column names
            const sortFieldMap = {
                'uploaded_at': 'ui.uploaded_at',
                'user_id': 'ui.user_id',
                'id': 'ui.id'
            };
            const safeSortBy = sortFieldMap[sortBy] || 'ui.uploaded_at';
            const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            // Build SELECT fields - conditionally include approval_status if it exists
            const selectFields = columnCheck.rows.length > 0 
                ? `ui.id,
                    ui.user_id,
                    ui.file_name,
                    ui.is_profile,
                    ui.featured,
                    ui.uploaded_at,
                    ui.approval_status,
                    ui.rejection_reason,
                    u.real_name,
                    u.email`
                : `ui.id,
                    ui.user_id,
                    ui.file_name,
                    ui.is_profile,
                    ui.featured,
                    ui.uploaded_at,
                    NULL as approval_status,
                    NULL as rejection_reason,
                    u.real_name,
                    u.email`;

            // Get pending images
            const result = await query(
                `SELECT 
                    ${selectFields}
                FROM user_images ui
                JOIN users u ON ui.user_id = u.id
                WHERE ${whereClause}
                ORDER BY ${safeSortBy} ${safeSortOrder}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                [...params, limit, offset]
            );

            // Get total count
            const countResult = await query(
                `SELECT COUNT(*) as total
                 FROM user_images ui
                 JOIN users u ON ui.user_id = u.id
                 WHERE ${whereClause}`,
                params
            );

            const total = parseInt(countResult.rows[0]?.total || 0);

            return {
                data: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('Error fetching pending images:', error);
            logger.error('Error details:', {
                message: error.message,
                stack: error.stack,
                query: error.query || 'N/A'
            });
            throw error;
        }
    }

    /**
     * Get all images with filters
     */
    async getImages(options = {}) {
        const {
            page = 1,
            limit = 20,
            search = '',
            userId = null,
            status = '', // 'pending', 'approved', 'rejected'
            sortBy = 'uploaded_at',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;

        try {
            // Ensure approval_status column exists
            await this.ensureApprovalStatusColumn();

            // Build WHERE clause
            let whereConditions = ['1=1'];
            const params = [];
            let paramIndex = 1;

            if (search) {
                whereConditions.push(`(
                    u.real_name ILIKE $${paramIndex} OR 
                    u.email ILIKE $${paramIndex} OR
                    ui.file_name ILIKE $${paramIndex} OR
                    CAST(ui.user_id AS TEXT) = $${paramIndex}
                )`);
                params.push(`%${search}%`);
                paramIndex++;
            }

            if (userId) {
                whereConditions.push(`ui.user_id = $${paramIndex}`);
                params.push(userId);
                paramIndex++;
            }

            if (status) {
                if (status === 'pending') {
                    whereConditions.push(`(approval_status IS NULL OR approval_status = 'pending')`);
                } else {
                    whereConditions.push(`approval_status = $${paramIndex}`);
                    params.push(status);
                    paramIndex++;
                }
            }

            const whereClause = whereConditions.join(' AND ');

            // Validate sortBy
            const allowedSortFields = ['uploaded_at', 'user_id', 'id', 'approval_status'];
            const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'uploaded_at';
            const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            // Get images
            const result = await query(
                `SELECT 
                    ui.id,
                    ui.user_id,
                    ui.file_name,
                    ui.is_profile,
                    ui.featured,
                    ui.uploaded_at,
                    ui.approval_status,
                    ui.rejection_reason,
                    ui.approved_at,
                    ui.approved_by,
                    u.real_name,
                    u.email
                FROM user_images ui
                JOIN users u ON ui.user_id = u.id
                WHERE ${whereClause}
                ORDER BY ui.${safeSortBy} ${safeSortOrder}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                [...params, limit, offset]
            );

            // Get total count
            const countResult = await query(
                `SELECT COUNT(*) as total
                 FROM user_images ui
                 JOIN users u ON ui.user_id = u.id
                 WHERE ${whereClause}`,
                params
            );

            const total = parseInt(countResult.rows[0]?.total || 0);

            return {
                data: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('Error fetching images:', error);
            throw error;
        }
    }

    /**
     * Approve image
     */
    async approveImage(imageId, adminId) {
        try {
            await this.ensureApprovalStatusColumn();

            const result = await query(
                `UPDATE user_images 
                 SET approval_status = 'approved',
                     approved_at = NOW(),
                     approved_by = $1
                 WHERE id = $2
                 RETURNING *`,
                [adminId, imageId]
            );

            if (result.rows.length === 0) {
                throw new Error('Image not found');
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Error approving image:', error);
            throw error;
        }
    }

    /**
     * Reject image
     */
    async rejectImage(imageId, adminId, reason = '') {
        try {
            await this.ensureApprovalStatusColumn();

            const result = await query(
                `UPDATE user_images 
                 SET approval_status = 'rejected',
                     rejection_reason = $1,
                     approved_at = NOW(),
                     approved_by = $2
                 WHERE id = $3
                 RETURNING *`,
                [reason, adminId, imageId]
            );

            if (result.rows.length === 0) {
                throw new Error('Image not found');
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Error rejecting image:', error);
            throw error;
        }
    }

    /**
     * Get statistics
     */
    async getStatistics() {
        try {
            await this.ensureApprovalStatusColumn();

            const stats = await query(`
                SELECT 
                    COUNT(*) as total_images,
                    COUNT(*) FILTER (WHERE approval_status = 'approved') as approved_images,
                    COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected_images,
                    COUNT(*) FILTER (WHERE approval_status IS NULL OR approval_status = 'pending') as pending_images,
                    COUNT(*) FILTER (WHERE uploaded_at >= NOW() - INTERVAL '7 days') as images_last_7_days,
                    COUNT(*) FILTER (WHERE uploaded_at >= NOW() - INTERVAL '30 days') as images_last_30_days
                FROM user_images
            `);

            return stats.rows[0] || {};
        } catch (error) {
            logger.error('Error fetching image statistics:', error);
            throw error;
        }
    }

    /**
     * Ensure approval_status column exists
     */
    async ensureApprovalStatusColumn() {
        try {
            // First check if user_images table exists
            const tableCheck = await query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name = 'user_images'
            `);

            if (tableCheck.rows.length === 0) {
                logger.warn('user_images table does not exist');
                return;
            }

            // Check if column exists
            const columnCheck = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'user_images' 
                AND column_name = 'approval_status'
            `);

            if (columnCheck.rows.length === 0) {
                try {
                    // Add approval_status column (without CHECK constraint first to avoid issues)
                    await query(`
                        ALTER TABLE user_images 
                        ADD COLUMN approval_status VARCHAR(20) DEFAULT 'pending'
                    `);

                    // Add rejection_reason column
                    await query(`
                        ALTER TABLE user_images 
                        ADD COLUMN rejection_reason TEXT
                    `);

                    // Add approved_at column
                    await query(`
                        ALTER TABLE user_images 
                        ADD COLUMN approved_at TIMESTAMP
                    `);

                    // Add approved_by column (check if admin_users table exists first)
                    try {
                        const adminUsersCheck = await query(`
                            SELECT table_name 
                            FROM information_schema.tables 
                            WHERE table_name = 'admin_users'
                        `);
                        
                        if (adminUsersCheck.rows.length > 0) {
                            await query(`
                                ALTER TABLE user_images 
                                ADD COLUMN approved_by INTEGER REFERENCES admin_users(id)
                            `);
                        } else {
                            await query(`
                                ALTER TABLE user_images 
                                ADD COLUMN approved_by INTEGER
                            `);
                        }
                    } catch (refError) {
                        // If foreign key fails, add without it
                        await query(`
                            ALTER TABLE user_images 
                            ADD COLUMN approved_by INTEGER
                        `);
                    }

                    // Create index
                    await query(`
                        CREATE INDEX IF NOT EXISTS idx_user_images_approval_status 
                        ON user_images(approval_status)
                    `);

                    logger.info('Added approval_status columns to user_images table');
                } catch (alterError) {
                    logger.error('Error adding approval_status columns:', alterError);
                    // Don't throw - allow query to continue with fallback behavior
                }
            }
        } catch (error) {
            // Log error but don't throw - allow query to continue
            logger.warn('Error ensuring approval_status column:', error.message);
        }
    }
}

module.exports = new ImageApprovalService();





















































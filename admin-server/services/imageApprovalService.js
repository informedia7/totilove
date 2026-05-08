const { query, pool } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

const PROFILE_IMAGE_PATH_CANDIDATES = [
    process.env.UPLOADS_PATH,
    path.join(__dirname, '..', 'uploads'),
    path.join(__dirname, '..', '..', 'uploads'),
    path.join(__dirname, '..', '..', 'app', 'uploads'),
    path.join(__dirname, '..', '..', 'app', 'uploads', 'profile_images'),
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), '..', 'uploads'),
    path.join(process.cwd(), '..', 'app', 'uploads')
]
    .filter(Boolean)
    .map(p => path.resolve(p));

function quoteIdentifier(identifier) {
    return `"${String(identifier).replace(/"/g, '""')}"`;
}

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

function normalizeImageFamilyKey(fileName) {
    const normalizedPath = normalizeStoredUploadPath(fileName);
    if (!normalizedPath) {
        return '';
    }

    const ext = path.extname(normalizedPath);
    let stem = ext ? normalizedPath.slice(0, -ext.length) : normalizedPath;
    stem = path.posix.basename(stem).toLowerCase();

    // Remove common generated size/thumbnail suffixes to map original + variants to same family.
    stem = stem
        .replace(/(?:[._-](?:thumb|thumbnail|small|medium|large)){1,4}$/i, '')
        .replace(/(?:[._-](?:thumb|thumbnail|small|medium|large)){1,4}$/i, '');

    return stem;
}

async function resolveProfileImageDirectories() {
    const directories = new Set();

    for (const candidate of PROFILE_IMAGE_PATH_CANDIDATES) {
        if (!(await directoryExists(candidate))) {
            continue;
        }

        if (path.basename(candidate) === 'profile_images') {
            directories.add(candidate);
            continue;
        }

        const profileImagesPath = path.join(candidate, 'profile_images');
        if (await directoryExists(profileImagesPath)) {
            directories.add(profileImagesPath);
        }
    }

    return Array.from(directories);
}

function buildProfileImageDeleteCandidates(storedPath, candidateDirectories) {
    const normalizedPath = normalizeStoredUploadPath(storedPath);
    if (!normalizedPath) {
        return [];
    }

    const candidates = new Set();
    const directRelativePath = normalizedPath.startsWith('profile_images/')
        ? normalizedPath.slice('profile_images/'.length)
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

async function deleteProfileImageFile(storedPath, candidateDirectories = null) {
    const resolvedDirectories = candidateDirectories || await resolveProfileImageDirectories();
    const deleteCandidates = buildProfileImageDeleteCandidates(storedPath, resolvedDirectories);

    if (deleteCandidates.length === 0) {
        return { deleted: false, missing: true };
    }

    for (const candidatePath of deleteCandidates) {
        try {
            await fs.unlink(candidatePath);
            logger.info(`Deleted rejected image file: ${candidatePath}`);
            return { deleted: true, missing: false };
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw new Error(`Failed deleting image file at ${candidatePath}: ${error.message}`);
            }
        }
    }

    return { deleted: false, missing: true };
}

async function deleteProfileImageFamilyFiles(storedPath, candidateDirectories = null) {
    const resolvedDirectories = candidateDirectories || await resolveProfileImageDirectories();
    const familyKey = normalizeImageFamilyKey(storedPath);
    if (!familyKey) {
        return { deleted: 0 };
    }

    async function walkFilesRecursive(currentDir, files = []) {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await walkFilesRecursive(fullPath, files);
            } else if (entry.isFile()) {
                files.push(fullPath);
            }
        }

        return files;
    }

    let deleted = 0;

    for (const directory of resolvedDirectories) {
        let files = [];
        try {
            files = await walkFilesRecursive(directory);
        } catch (error) {
            logger.warn(`Failed reading profile_images directory ${directory}: ${error.message}`);
            continue;
        }

        for (const filePath of files) {
            const fileName = path.basename(filePath);
            if (normalizeImageFamilyKey(fileName) !== familyKey) {
                continue;
            }

            const relativePath = path.relative(directory, filePath);
            const safePath = safeJoin(directory, relativePath);
            if (!safePath) {
                continue;
            }

            try {
                await fs.unlink(safePath);
                deleted++;
                logger.info(`Deleted rejected image family file: ${safePath}`);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    logger.warn(`Failed deleting rejected image family file ${safePath}: ${error.message}`);
                }
            }
        }
    }

    return { deleted };
}

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
                    u.email,
                    COALESCE(u.is_suspended, false) AS user_is_suspended`
                : `ui.id,
                    ui.user_id,
                    ui.file_name,
                    ui.is_profile,
                    ui.featured,
                    ui.uploaded_at,
                    NULL as approval_status,
                    NULL as rejection_reason,
                    u.real_name,
                    u.email,
                    COALESCE(u.is_suspended, false) AS user_is_suspended`;

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
            status = '', // 'pending', 'approved', 'rejected', 'not_approved'
            sortBy = 'uploaded_at',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;

        try {
            // Ensure approval_status column exists
            await this.ensureApprovalStatusColumn();

            // Check which optional columns exist
            const colCheck = await query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'user_images'
                  AND column_name IN ('approval_status', 'rejection_reason', 'approved_at', 'approved_by')
            `);
            const existingCols = new Set(colCheck.rows.map(r => r.column_name));
            const hasApprovalStatus = existingCols.has('approval_status');
            const hasRejectionReason = existingCols.has('rejection_reason');
            const hasApprovedAt = existingCols.has('approved_at');
            const hasApprovedBy = existingCols.has('approved_by');

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

            if (status && hasApprovalStatus) {
                if (status === 'pending') {
                    whereConditions.push(`(ui.approval_status IS NULL OR ui.approval_status = 'pending')`);
                } else if (status === 'not_approved') {
                    whereConditions.push(`(ui.approval_status IS NULL OR ui.approval_status IN ('pending', 'rejected'))`);
                } else if (status === 'approved' || status === 'rejected') {
                    whereConditions.push(`ui.approval_status = $${paramIndex}`);
                    params.push(status);
                    paramIndex++;
                } else {
                    throw new Error('Invalid status filter');
                }
            }

            const whereClause = whereConditions.join(' AND ');

            // Validate sortBy — only allow approval_status sort if column exists
            const allowedSortFields = ['uploaded_at', 'user_id', 'id'];
            if (hasApprovalStatus) allowedSortFields.push('approval_status');
            const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'uploaded_at';
            const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            // Build SELECT list defensively
            const selectExtra = [
                hasApprovalStatus ? 'ui.approval_status' : `'pending' AS approval_status`,
                hasRejectionReason ? 'ui.rejection_reason' : 'NULL AS rejection_reason',
                hasApprovedAt ? 'ui.approved_at' : 'NULL AS approved_at',
                hasApprovedBy ? 'ui.approved_by' : 'NULL AS approved_by',
            ].join(',\n                    ');

            // Get images
            const result = await query(
                `SELECT 
                    ui.id,
                    ui.user_id,
                    ui.file_name,
                    ui.is_profile,
                    ui.featured,
                    ui.uploaded_at,
                    ${selectExtra},
                    u.real_name,
                    u.email,
                    COALESCE(u.is_suspended, false) AS user_is_suspended
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
        const client = await pool.connect();
        try {
            await this.ensureApprovalStatusColumn();

            await client.query('BEGIN');

            const imageLookup = await client.query(
                `SELECT id, user_id, file_name, approval_status
                 FROM user_images
                 WHERE id = $1
                 FOR UPDATE`,
                [imageId]
            );

            if (imageLookup.rows.length === 0) {
                throw new Error('Image not found');
            }

            const imageRow = imageLookup.rows[0];
            const targetFamilyKey = normalizeImageFamilyKey(imageRow.file_name);

            const userImagesLookup = await client.query(
                `SELECT id, user_id, file_name, approval_status
                 FROM user_images
                 WHERE user_id = $1
                 FOR UPDATE`,
                [imageRow.user_id]
            );

            const relatedImages = userImagesLookup.rows.filter(row => {
                if (!row.file_name) {
                    return false;
                }

                const rowFamilyKey = normalizeImageFamilyKey(row.file_name);
                return rowFamilyKey && rowFamilyKey === targetFamilyKey;
            });

            const imagesToDelete = relatedImages.length > 0 ? relatedImages : [imageRow];
            const imageIdsToDelete = imagesToDelete.map(row => row.id);

            const fkReferences = await client.query(`
                SELECT
                    ns.nspname AS schema_name,
                    cls.relname AS table_name,
                    att.attname AS column_name
                FROM pg_constraint con
                JOIN pg_class cls ON cls.oid = con.conrelid
                JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
                JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = cols.attnum
                WHERE con.contype = 'f'
                  AND con.confrelid = 'user_images'::regclass
                ORDER BY ns.nspname, cls.relname, cols.ord
            `);

            for (const idToDelete of imageIdsToDelete) {
                for (const ref of fkReferences.rows) {
                    const deleteSql = `DELETE FROM ${quoteIdentifier(ref.schema_name)}.${quoteIdentifier(ref.table_name)} WHERE ${quoteIdentifier(ref.column_name)} = $1`;
                    await client.query(deleteSql, [idToDelete]);
                }
            }

            const deletedImage = await client.query(
                `DELETE FROM user_images
                 WHERE id = ANY($1::int[])
                 RETURNING id, user_id, file_name, approval_status`,
                [imageIdsToDelete]
            );

            await client.query('COMMIT');

            const candidateDirectories = await resolveProfileImageDirectories();
            for (const deletedRow of deletedImage.rows) {
                if (!deletedRow.file_name) {
                    continue;
                }

                try {
                    await deleteProfileImageFile(deletedRow.file_name, candidateDirectories);
                    await deleteProfileImageFamilyFiles(deletedRow.file_name, candidateDirectories);
                } catch (fileDeleteError) {
                    logger.warn(`Failed deleting rejected image file ${deletedRow.file_name}: ${fileDeleteError.message}`);
                }
            }

            return {
                id: imageRow.id,
                user_id: imageRow.user_id,
                file_name: imageRow.file_name,
                previous_status: imageRow.approval_status,
                deleted_image_ids: deletedImage.rows.map(row => row.id),
                deleted_file_names: deletedImage.rows.map(row => row.file_name).filter(Boolean),
                rejection_reason: reason || null,
                rejected_by: adminId,
                deleted: true
            };
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                logger.error('Error rolling back rejectImage transaction:', rollbackError);
            }
            logger.error('Error rejecting image:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Disapprove image (approved -> pending)
     */
    async disapproveImage(imageId, adminId) {
        try {
            await this.ensureApprovalStatusColumn();

            const result = await query(
                `UPDATE user_images
                 SET approval_status = 'pending',
                     rejection_reason = NULL,
                     approved_at = NULL,
                     approved_by = NULL
                 WHERE id = $1
                   AND approval_status = 'approved'
                 RETURNING *`,
                [imageId]
            );

            if (result.rows.length === 0) {
                throw new Error('Only approved images can be disapproved');
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Error disapproving image:', {
                imageId,
                adminId,
                error: error.message
            });
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

            // Check each column independently and add any that are missing
            const existingColumnsCheck = await query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'user_images'
                  AND column_name IN ('approval_status', 'rejection_reason', 'approved_at', 'approved_by')
            `);
            const existingSet = new Set(existingColumnsCheck.rows.map(r => r.column_name));

            const columnsToAdd = [
                { name: 'approval_status', ddl: `ALTER TABLE user_images ADD COLUMN approval_status VARCHAR(20) DEFAULT 'pending'` },
                { name: 'rejection_reason', ddl: `ALTER TABLE user_images ADD COLUMN rejection_reason TEXT` },
                { name: 'approved_at',      ddl: `ALTER TABLE user_images ADD COLUMN approved_at TIMESTAMP` },
                { name: 'approved_by',      ddl: `ALTER TABLE user_images ADD COLUMN approved_by INTEGER` },
            ];

            let addedAny = false;
            for (const col of columnsToAdd) {
                if (!existingSet.has(col.name)) {
                    try {
                        await query(col.ddl);
                        addedAny = true;
                    } catch (alterError) {
                        logger.warn(`Could not add column ${col.name} to user_images:`, alterError.message);
                    }
                }
            }

            if (addedAny) {
                try {
                    await query(`CREATE INDEX IF NOT EXISTS idx_user_images_approval_status ON user_images(approval_status)`);
                } catch (idxErr) {
                    logger.warn('Could not create approval_status index:', idxErr.message);
                }
                logger.info('Added missing approval columns to user_images table');
            }
        } catch (error) {
            // Log error but don't throw - allow query to continue
            logger.warn('Error ensuring approval_status column:', error.message);
        }
    }
}

module.exports = new ImageApprovalService();





















































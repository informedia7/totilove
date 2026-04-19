const { query } = require('../config/database');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

class ExportImportService {
    /**
     * Export uploads is intentionally Railway-only.
     */
    isRailwayEnvironment() {
        return Boolean(
            process.env.RAILWAY_ENVIRONMENT ||
            process.env.RAILWAY_PROJECT_ID ||
            process.env.RAILWAY_STATIC_URL
        );
    }

    /**
     * Resolve and validate uploads root for image export.
     */
    async getUploadsExportInfo() {
        if (!this.isRailwayEnvironment()) {
            throw new Error('Uploads export is only available in Railway environment');
        }

        if (!process.env.UPLOADS_PATH) {
            throw new Error('UPLOADS_PATH is required in Railway to export uploads folder');
        }

        const uploadsRoot = path.resolve(process.env.UPLOADS_PATH);

        try {
            const stats = await fs.promises.stat(uploadsRoot);
            if (!stats.isDirectory()) {
                throw new Error(`UPLOADS_PATH is not a directory: ${uploadsRoot}`);
            }

            await fs.promises.access(uploadsRoot, fs.constants.R_OK | fs.constants.X_OK);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `uploads_export_${timestamp}.zip`;

            return { uploadsRoot, filename };
        } catch (error) {
            logger.error('Error resolving uploads export path:', {
                uploadsRoot,
                message: error.message,
                code: error.code
            });

            if (error.code === 'ENOENT') {
                throw new Error(`Uploads path does not exist: ${uploadsRoot}`);
            }

            if (error.code === 'EACCES' || error.code === 'EPERM') {
                throw new Error(`Uploads path is not readable: ${uploadsRoot}`);
            }

            throw new Error(`Uploads folder is not accessible: ${uploadsRoot}`);
        }
    }

    /**
     * Create ZIP stream for uploads folder.
     * If TOTILOVE_URL + EXPORT_SECRET are set, proxy from main service (recommended).
     * Otherwise fall back to direct filesystem read via UPLOADS_PATH.
     */
    async createUploadsArchiveStream() {
        if (process.env.TOTILOVE_URL && process.env.EXPORT_SECRET) {
            return this.createProxiedArchiveStream();
        }
        const { uploadsRoot, filename } = await this.getUploadsExportInfo();
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.directory(uploadsRoot, 'uploads');
        return { archive, filename };
    }

    /**
     * Proxy-stream the uploads ZIP from the main totilove service.
     */
    async createProxiedArchiveStream() {
        const http = require('https');
        const url = require('url');

        const base = process.env.TOTILOVE_URL.replace(/\/$/, '');
        const secret = process.env.EXPORT_SECRET;
        const exportUrl = `${base}/uploads-export?secret=${encodeURIComponent(secret)}`;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `uploads_export_${timestamp}.zip`;

        return new Promise((resolve, reject) => {
            const parsedUrl = url.parse(exportUrl);
            const lib = parsedUrl.protocol === 'https:' ? require('https') : require('http');

            const req = lib.get(exportUrl, (response) => {
                if (response.statusCode !== 200) {
                    let body = '';
                    response.on('data', (chunk) => { body += chunk; });
                    response.on('end', () => {
                        try {
                            const json = JSON.parse(body);
                            reject(new Error(json.error || `Upstream returned ${response.statusCode}`));
                        } catch {
                            reject(new Error(`Upstream returned ${response.statusCode}`));
                        }
                    });
                    return;
                }
                resolve({ stream: response, filename });
            });

            req.on('error', (err) => reject(new Error(`Failed to reach main service: ${err.message}`)));
            req.setTimeout(60000, () => {
                req.destroy();
                reject(new Error('Upstream request timed out'));
            });
        });
    }

    /**
     * Fetch folder stats from the main totilove service (proxy) or local filesystem.
     */
    async getUploadsInfo() {
        if (process.env.TOTILOVE_URL && process.env.EXPORT_SECRET) {
            const url = require('url');
            const base = process.env.TOTILOVE_URL.replace(/\/$/, '');
            const secret = process.env.EXPORT_SECRET;
            const infoUrl = `${base}/uploads-info?secret=${encodeURIComponent(secret)}`;

            return new Promise((resolve, reject) => {
                const parsedUrl = url.parse(infoUrl);
                const lib = parsedUrl.protocol === 'https:' ? require('https') : require('http');

                const req = lib.get(infoUrl, (response) => {
                    let body = '';
                    response.on('data', (chunk) => { body += chunk; });
                    response.on('end', () => {
                        try {
                            const json = JSON.parse(body);
                            if (response.statusCode !== 200) {
                                reject(new Error(json.error || `Upstream returned ${response.statusCode}`));
                            } else {
                                resolve(json);
                            }
                        } catch {
                            reject(new Error(`Upstream returned non-JSON response (${response.statusCode})`));
                        }
                    });
                });
                req.on('error', (err) => reject(new Error(`Failed to reach main service: ${err.message}`)));
                req.setTimeout(30000, () => { req.destroy(); reject(new Error('Upstream request timed out')); });
            });
        }

        // Direct filesystem mode
        if (!process.env.UPLOADS_PATH) {
            throw new Error('UPLOADS_PATH is required to scan uploads folder');
        }

        const uploadsRoot = require('path').resolve(process.env.UPLOADS_PATH);
        const fsp = require('fs').promises;
        const fsSync = require('fs');

        if (!fsSync.existsSync(uploadsRoot)) {
            throw new Error(`Uploads path does not exist: ${uploadsRoot}`);
        }

        async function scanDir(dirPath) {
            const entries = await fsp.readdir(dirPath, { withFileTypes: true });
            let fileCount = 0;
            let totalSize = 0;
            let lastModified = null;
            const subfolders = [];

            for (const entry of entries) {
                const fullPath = require('path').join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    const sub = await scanDir(fullPath);
                    subfolders.push({ name: entry.name, path: entry.name, ...sub });
                    fileCount += sub.fileCount;
                    totalSize += sub.totalSize;
                    if (!lastModified || sub.lastModified > lastModified) lastModified = sub.lastModified;
                } else if (entry.isFile()) {
                    const stat = await fsp.stat(fullPath);
                    fileCount++;
                    totalSize += stat.size;
                    if (!lastModified || stat.mtime > lastModified) lastModified = stat.mtime;
                }
            }
            return { fileCount, totalSize, lastModified, subfolders };
        }

        const info = await scanDir(uploadsRoot);
        return {
            path: uploadsRoot,
            fileCount: info.fileCount,
            totalSize: info.totalSize,
            lastModified: info.lastModified,
            subfolders: info.subfolders,
            scannedAt: new Date().toISOString()
        };
    }

    /**
     * Export users to CSV
     */
    async exportUsersToCSV(options = {}) {
        try {
            const {
                userIds = null,
                filters = {},
                fields = null // null = all fields
            } = options;

            // Build WHERE clause
            let whereConditions = ['1=1'];
            const params = [];
            let paramIndex = 1;

            if (userIds && Array.isArray(userIds) && userIds.length > 0) {
                whereConditions.push(`u.id = ANY($${paramIndex})`);
                params.push(userIds);
                paramIndex++;
            }

            if (filters.search) {
                whereConditions.push(`(
                    u.real_name ILIKE $${paramIndex} OR 
                    u.email ILIKE $${paramIndex}
                )`);
                params.push(`%${filters.search}%`);
                paramIndex++;
            }

            if (filters.status) {
                if (filters.status === 'banned') {
                    whereConditions.push(`u.is_banned = true`);
                } else if (filters.status === 'active') {
                    whereConditions.push(`u.is_banned = false`);
                }
            }

            if (filters.emailVerified !== undefined) {
                whereConditions.push(`u.email_verified = $${paramIndex}`);
                params.push(filters.emailVerified);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Get users with all related data
            const result = await query(`
                SELECT 
                    u.id,
                    u.real_name,
                    u.email,
                    u.gender,
                    u.birthdate,
                    u.date_joined,
                    u.last_login,
                    u.email_verified,
                    u.is_banned,
                    ua.about_me,
                    ua.height_cm,
                    ua.weight_kg,
                    c.name as country,
                    ci.name as city,
                    (SELECT COUNT(*) FROM user_images WHERE user_id = u.id) as image_count,
                    (SELECT COUNT(*) FROM user_messages WHERE sender_id = u.id) as messages_sent,
                    (SELECT COUNT(*) FROM user_messages WHERE receiver_id = u.id) as messages_received,
                    (SELECT COUNT(*) FROM users_likes WHERE liked_by = u.id) as likes_given,
                    (SELECT COUNT(*) FROM users_likes WHERE liked_user_id = u.id) as likes_received
                FROM users u
                LEFT JOIN user_attributes ua ON u.id = ua.user_id
                LEFT JOIN city ci ON ua.city_id = ci.id
                LEFT JOIN country c ON ci.country_id = c.id OR ua.country_id = c.id
                WHERE ${whereClause}
                ORDER BY u.id
            `, params);

            // Convert to CSV
            if (result.rows.length === 0) {
                return { csv: '', filename: 'users_export.csv' };
            }

            const headers = Object.keys(result.rows[0]);
            const csvRows = [
                headers.join(','),
                ...result.rows.map(row => 
                    headers.map(header => {
                        const value = row[header];
                        if (value === null || value === undefined) return '';
                        // Escape commas and quotes in CSV
                        const stringValue = String(value).replace(/"/g, '""');
                        return `"${stringValue}"`;
                    }).join(',')
                )
            ];

            const csv = csvRows.join('\n');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `users_export_${timestamp}.csv`;

            return { csv, filename };
        } catch (error) {
            logger.error('Error exporting users to CSV:', error);
            throw error;
        }
    }

    /**
     * Export users to JSON
     */
    async exportUsersToJSON(options = {}) {
        try {
            const {
                userIds = null,
                filters = {},
                fields = null
            } = options;

            // Build WHERE clause (same as CSV)
            let whereConditions = ['1=1'];
            const params = [];
            let paramIndex = 1;

            if (userIds && Array.isArray(userIds) && userIds.length > 0) {
                whereConditions.push(`u.id = ANY($${paramIndex})`);
                params.push(userIds);
                paramIndex++;
            }

            if (filters.search) {
                whereConditions.push(`(
                    u.real_name ILIKE $${paramIndex} OR 
                    u.email ILIKE $${paramIndex}
                )`);
                params.push(`%${filters.search}%`);
                paramIndex++;
            }

            if (filters.status) {
                if (filters.status === 'banned') {
                    whereConditions.push(`u.is_banned = true`);
                } else if (filters.status === 'active') {
                    whereConditions.push(`u.is_banned = false`);
                }
            }

            if (filters.emailVerified !== undefined) {
                whereConditions.push(`u.email_verified = $${paramIndex}`);
                params.push(filters.emailVerified);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Get users with all related data
            const result = await query(`
                SELECT 
                    u.id,
                    u.real_name,
                    u.email,
                    u.gender,
                    u.birthdate,
                    u.date_joined,
                    u.last_login,
                    u.email_verified,
                    u.is_banned,
                    ua.about_me,
                    ua.height_cm,
                    ua.weight_kg,
                    c.name as country,
                    ci.name as city,
                    (SELECT COUNT(*) FROM user_images WHERE user_id = u.id) as image_count,
                    (SELECT COUNT(*) FROM user_messages WHERE sender_id = u.id) as messages_sent,
                    (SELECT COUNT(*) FROM user_messages WHERE receiver_id = u.id) as messages_received,
                    (SELECT COUNT(*) FROM users_likes WHERE liked_by = u.id) as likes_given,
                    (SELECT COUNT(*) FROM users_likes WHERE liked_user_id = u.id) as likes_received
                FROM users u
                LEFT JOIN user_attributes ua ON u.id = ua.user_id
                LEFT JOIN city ci ON ua.city_id = ci.id
                LEFT JOIN country c ON ci.country_id = c.id OR ua.country_id = c.id
                WHERE ${whereClause}
                ORDER BY u.id
            `, params);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `users_export_${timestamp}.json`;

            return { 
                data: result.rows,
                filename,
                count: result.rows.length
            };
        } catch (error) {
            logger.error('Error exporting users to JSON:', error);
            throw error;
        }
    }

    /**
     * Import users from JSON/CSV
     */
    async importUsers(data, format = 'json') {
        try {
            let users = [];

            if (format === 'json') {
                users = Array.isArray(data) ? data : JSON.parse(data);
            } else if (format === 'csv') {
                users = this.parseCSV(data);
            }

            const results = {
                success: 0,
                failed: 0,
                errors: []
            };

            for (let i = 0; i < users.length; i++) {
                const userData = users[i];
                try {
                    // Validate required fields
                    if (!userData.real_name || !userData.email) {
                        throw new Error('Real name and email are required');
                    }

                    // Check if user already exists
                    const existing = await query(
                        'SELECT id FROM users WHERE email = $1',
                        [userData.email]
                    );

                    if (existing.rows.length > 0) {
                        results.errors.push({
                            row: i + 1,
                            error: `User already exists: ${userData.email}`
                        });
                        results.failed++;
                        continue;
                    }

                    // Insert user
                    const insertResult = await query(`
                        INSERT INTO users (real_name, email, gender, birthdate, date_joined, email_verified)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        RETURNING id
                    `, [
                        userData.real_name,
                        userData.email,
                        userData.gender || null,
                        userData.birthdate || null,
                        userData.date_joined || new Date(),
                        userData.email_verified || false
                    ]);

                    const userId = insertResult.rows[0].id;

                    // Insert user attributes if provided
                    if (userData.about_me || userData.height_cm || userData.weight_kg) {
                        await query(`
                            INSERT INTO user_attributes (user_id, about_me, height_cm, weight_kg)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (user_id) DO UPDATE SET
                                about_me = EXCLUDED.about_me,
                                height_cm = EXCLUDED.height_cm,
                                weight_kg = EXCLUDED.weight_kg
                        `, [
                            userId,
                            userData.about_me || null,
                            userData.height_cm || null,
                            userData.weight_kg || null
                        ]);
                    }

                    results.success++;
                } catch (error) {
                    results.errors.push({
                        row: i + 1,
                        error: error.message
                    });
                    results.failed++;
                }
            }

            return results;
        } catch (error) {
            logger.error('Error importing users:', error);
            throw error;
        }
    }

    /**
     * Parse CSV string to array of objects
     */
    parseCSV(csvString) {
        const lines = csvString.split('\n').filter(line => line.trim());
        if (lines.length === 0) return [];

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length !== headers.length) continue;

            const obj = {};
            headers.forEach((header, index) => {
                let value = values[index].replace(/^"|"$/g, '').replace(/""/g, '"');
                // Try to parse as number or boolean
                if (value === 'true') value = true;
                else if (value === 'false') value = false;
                else if (!isNaN(value) && value !== '') value = parseFloat(value);
                else if (value === '') value = null;
                obj[header] = value;
            });
            data.push(obj);
        }

        return data;
    }

    /**
     * Parse CSV line handling quoted values
     */
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"' && inQuotes && nextChar === '"') {
                current += '"';
                i++; // Skip next quote
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);

        return values;
    }

    /**
     * Export payments to CSV
     */
    async exportPaymentsToCSV(options = {}) {
        try {
            const { filters = {} } = options;

            let whereConditions = ['1=1'];
            const params = [];
            let paramIndex = 1;

            if (filters.userId) {
                whereConditions.push(`p.user_id = $${paramIndex}`);
                params.push(filters.userId);
                paramIndex++;
            }

            if (filters.status) {
                whereConditions.push(`p.payment_status = $${paramIndex}`);
                params.push(filters.status);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            const result = await query(`
                SELECT 
                    p.id,
                    p.user_id,
                    u.real_name,
                    u.email,
                    p.amount,
                    p.payment_date,
                    p.payment_method,
                    p.payment_status,
                    p.transaction_id
                FROM payments p
                JOIN users u ON p.user_id = u.id
                WHERE ${whereClause}
                ORDER BY p.payment_date DESC
            `, params);

            if (result.rows.length === 0) {
                return { csv: '', filename: 'payments_export.csv' };
            }

            const headers = Object.keys(result.rows[0]);
            const csvRows = [
                headers.join(','),
                ...result.rows.map(row => 
                    headers.map(header => {
                        const value = row[header];
                        if (value === null || value === undefined) return '';
                        const stringValue = String(value).replace(/"/g, '""');
                        return `"${stringValue}"`;
                    }).join(',')
                )
            ];

            const csv = csvRows.join('\n');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `payments_export_${timestamp}.csv`;

            return { csv, filename };
        } catch (error) {
            logger.error('Error exporting payments to CSV:', error);
            throw error;
        }
    }
}

module.exports = new ExportImportService();





















































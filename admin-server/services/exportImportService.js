const { query } = require('../config/database');
const logger = require('../utils/logger');

class ExportImportService {
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





















































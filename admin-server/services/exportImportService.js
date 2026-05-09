const { query } = require('../config/database');
const logger = require('../utils/logger');
const { resolveTotilovePushBase } = require('../utils/totiloveOrigins');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const unzipper = require('unzipper');

// Same resolution idea as server.js (admin root = parent of this file's folder).
const adminRoot = path.join(__dirname, '..');

/** Off by default — proxy hits main app /uploads-info and often gets 302 login HTML. */
function uploadsProxyAllowed() {
    return String(process.env.EXPORT_IMPORT_PROXY || '').toLowerCase() === 'true';
}

const UPLOAD_PATH_CANDIDATES = [
    process.env.UPLOADS_PATH,
    '/app/app/uploads', // explicit Railway volume mount (does not depend on __dirname)
    path.join(adminRoot, 'app', 'uploads'), // Railway: /app/app/uploads when adminRoot is /app
    path.join(adminRoot, '..', 'app', 'uploads', 'profile_images'),
    path.join(adminRoot, '..', 'app', 'uploads'),
    path.join(adminRoot, '..', 'uploads'),
    path.join(adminRoot, '..', '..', 'uploads'),
    path.join(adminRoot, 'uploads'),
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), '..', 'uploads'),
    path.join(process.cwd(), '..', 'app', 'uploads'),
    path.join(process.cwd(), '..', '..', 'uploads')
]
    .filter(Boolean)
    .map((candidatePath) => path.resolve(candidatePath));

let suspensionSchemaPromise = null;

async function ensureSuspensionSchema() {
    if (!suspensionSchemaPromise) {
        suspensionSchemaPromise = (async () => {
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false`);
            await query(`ALTER TABLE users ALTER COLUMN is_suspended SET DEFAULT false`);
            await query(`UPDATE users SET is_suspended = COALESCE(is_banned, false) WHERE is_suspended IS NULL`);
        })().catch((error) => {
            suspensionSchemaPromise = null;
            throw error;
        });
    }

    return suspensionSchemaPromise;
}

async function directoryExists(dirPath) {
    try {
        const stats = await fs.promises.stat(dirPath);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

class ExportImportService {
    /**
     * Prefer UPLOADS_PATH when set: resolve, mkdir, and validate access.
     * Avoids falling through to proxy (302 login) when the volume path exists but
     * Railway-only helpers or candidate scans pick the wrong directory.
     */
    async ensureConfiguredUploadsRoot(options = {}) {
        const { requireWritable = false } = options;
        const raw = typeof process.env.UPLOADS_PATH === 'string' ? process.env.UPLOADS_PATH.trim() : '';
        if (raw) {
            const uploadsRoot = path.resolve(raw);
            await fs.promises.mkdir(uploadsRoot, { recursive: true });
            const stats = await fs.promises.stat(uploadsRoot);
            if (!stats.isDirectory()) {
                throw new Error(`UPLOADS_PATH is not a directory: ${uploadsRoot}`);
            }
            await fs.promises.access(uploadsRoot, fs.constants.R_OK | fs.constants.X_OK);
            if (requireWritable) {
                await fs.promises.access(uploadsRoot, fs.constants.W_OK);
            }
            return uploadsRoot;
        }
        return await this.resolveLocalUploadsRoot();
    }

    async resolveLocalUploadsRoot() {
        for (const candidate of UPLOAD_PATH_CANDIDATES) {
            if (!(await directoryExists(candidate))) {
                continue;
            }

            if (path.basename(candidate) === 'profile_images') {
                const parent = path.dirname(candidate);
                if (await directoryExists(parent)) {
                    return parent;
                }
                return candidate;
            }

            return candidate;
        }

        throw new Error(
            `Unable to resolve uploads directory. Set UPLOADS_PATH or create uploads folder in one of: ${UPLOAD_PATH_CANDIDATES.join(', ')}`
        );
    }

    /**
     * Safe snapshot for ADMIN_DIAGNOSTIC_UPLOADS (no secrets).
     */
    diagnoseUploadsResolution() {
        const rows = [];
        for (const p of UPLOAD_PATH_CANDIDATES) {
            try {
                const st = fs.statSync(p);
                rows.push({
                    path: p,
                    exists: true,
                    isDirectory: st.isDirectory(),
                    readable: true
                });
            } catch (e) {
                rows.push({
                    path: p,
                    exists: false,
                    code: e.code || null,
                    message: e.message
                });
            }
        }
        return {
            cwd: process.cwd(),
            adminRoot,
            EXPORT_IMPORT_PROXY: process.env.EXPORT_IMPORT_PROXY || '(unset)',
            UPLOADS_PATH: process.env.UPLOADS_PATH ? '(set)' : '(unset)',
            TOTILOVE_URL: process.env.TOTILOVE_URL ? '(set)' : '(unset)',
            EXPORT_SECRET: process.env.EXPORT_SECRET ? '(set)' : '(unset)',
            candidates: rows
        };
    }

    /**
     * Resolve and validate uploads root for image export.
     */
    async getUploadsExportInfo() {
        const uploadsRoot = await this.ensureConfiguredUploadsRoot();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `uploads_export_${timestamp}.zip`;

        return { uploadsRoot, filename };
    }

    async getUploadsImportRoot() {
        return await this.ensureConfiguredUploadsRoot({ requireWritable: true });
    }

    /**
     * Import a ZIP into UPLOADS_PATH. The ZIP may contain:
     * - `uploads/<...>` (preferred, produced by our export)
     * - `<subfolder>/<...>` directly (e.g. `profile_images/foo.jpg`)
     */
    async importUploadsZip(zipFilePath, options = {}) {
        const { overwrite = true } = options;

        if (!zipFilePath) {
            throw new Error('zipFilePath is required');
        }

        const uploadsRoot = await this.getUploadsImportRoot();

        const opened = await unzipper.Open.file(zipFilePath);
        const files = opened.files || [];

        let extractedFiles = 0;
        let skippedFiles = 0;

        for (const entry of files) {
            if (!entry || entry.type !== 'File') {
                continue;
            }

            const rawPath = String(entry.path || '').replace(/\\/g, '/');
            if (!rawPath || rawPath.includes('..')) {
                skippedFiles++;
                continue;
            }

            // Strip "uploads/" prefix if present (our export uses archive.directory(uploadsRoot, 'uploads')).
            const relative = rawPath.startsWith('uploads/') ? rawPath.slice('uploads/'.length) : rawPath;
            if (!relative) {
                skippedFiles++;
                continue;
            }

            const destPath = path.resolve(uploadsRoot, relative);
            if (!destPath.startsWith(`${uploadsRoot}${path.sep}`) && destPath !== uploadsRoot) {
                skippedFiles++;
                continue;
            }

            await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

            if (!overwrite) {
                try {
                    await fs.promises.access(destPath, fs.constants.F_OK);
                    skippedFiles++;
                    continue;
                } catch {
                    // Doesn't exist, proceed.
                }
            }

            await new Promise((resolve, reject) => {
                const readStream = entry.stream();
                const writeStream = fs.createWriteStream(destPath);
                readStream.on('error', reject);
                writeStream.on('error', reject);
                writeStream.on('finish', resolve);
                readStream.pipe(writeStream);
            });

            extractedFiles++;
        }

        return {
            uploadsRoot,
            extractedFiles,
            skippedFiles,
            totalEntries: files.length
        };
    }

    /**
     * Forward a ZIP to the main Totilove service to import into its UPLOADS_PATH.
     * Uses the main app endpoint: POST /uploads-import?secret=EXPORT_SECRET (multipart field: zip).
     *
     * Prefers `TOTILOVE_BACKEND_URL` / `TOTILOVE_RAILWAY_URL` / `TOTILOVE_INTERNAL_URL` / `TOTILOVE_PRIVATE_URL`,
     * then `TOTILOVE_URL`. Use a Railway `*.up.railway.app` or `http://<service>.railway.internal:<PORT>` origin
     * so large ZIP POSTs skip Cloudflare (502/timeouts).
     */
    async pushUploadsZipToMain(zipFilePath, options = {}) {
        const { overwrite = true } = options;

        const pushBase = resolveTotilovePushBase();
        const secret = typeof process.env.EXPORT_SECRET === 'string' ? process.env.EXPORT_SECRET.trim() : '';

        if (!pushBase) {
            throw new Error(
                'Configure TOTILOVE_URL or TOTILOVE_BACKEND_URL (or TOTILOVE_RAILWAY_URL / private mesh URL) on admin-server'
            );
        }
        if (!secret) {
            throw new Error('EXPORT_SECRET is not configured on admin-server');
        }

        const fetch = require('node-fetch');
        const FormData = require('form-data');

        const form = new FormData();
        form.append('zip', fs.createReadStream(zipFilePath), {
            filename: path.basename(zipFilePath),
            contentType: 'application/zip'
        });
        form.append('overwrite', overwrite ? 'true' : 'false');

        const url = `${pushBase}/uploads-import?secret=${encodeURIComponent(secret)}`;
        const response = await fetch(url, {
            method: 'POST',
            body: form,
            headers: form.getHeaders(),
            timeout: 600000 // 10 minutes for large zips
        });

        const text = await response.text();
        let json;
        try {
            json = JSON.parse(text);
        } catch {
            let hint = '';
            const sniff = text.toLowerCase();
            if (
                (response.status === 502 || response.status === 524) &&
                (sniff.includes('cloudflare') || sniff.includes('bad gateway'))
            ) {
                hint =
                    ' Large uploads through Cloudflare often fail with 502/524. Set admin-server env TOTILOVE_BACKEND_URL to Totilove’s Railway URL (direct HTTPS origin), or split into smaller ZIPs and retry.';
            } else if (response.status >= 500) {
                hint = ' Check Totilove logs on Railway for crashes/OOM while extracting the ZIP; try a smaller archive.';
            }
            throw new Error(`Totilove returned ${response.status} (non-JSON).${hint ? ` ${hint}` : ''} First bytes: ${text.slice(0, 200)}`);
        }

        if (!response.ok || !json.success) {
            throw new Error(json.error || `Totilove returned ${response.status}`);
        }

        return json.data || {};
    }

    /**
     * List recent files under UPLOADS_PATH for browser preview.
     * @param {object} options
     * @param {string} options.folder - one of: profile_images, chat_images/images, chat_images/thumbnails
     * @param {number} options.limit
     * @param {number} options.offset
     */
    async listUploadsFiles(options = {}) {
        const folder = String(options.folder || '').trim();
        const limit = Math.min(Math.max(parseInt(options.limit, 10) || 60, 1), 200);
        const offset = Math.max(parseInt(options.offset, 10) || 0, 0);

        const allowed = new Set([
            'profile_images',
            'chat_images/images',
            'chat_images/thumbnails'
        ]);
        if (!allowed.has(folder)) {
            throw new Error(`Invalid folder. Allowed: ${Array.from(allowed).join(', ')}`);
        }

        const uploadsRoot = await this.ensureConfiguredUploadsRoot();
        const targetDir = path.resolve(uploadsRoot, folder);
        const rootResolved = path.resolve(uploadsRoot);
        if (!targetDir.startsWith(`${rootResolved}${path.sep}`)) {
            throw new Error('Invalid folder path');
        }

        const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
        const files = [];

        for (const entry of entries) {
            if (!entry.isFile()) {
                continue;
            }
            const name = entry.name;
            const abs = path.join(targetDir, name);
            try {
                const stat = await fs.promises.stat(abs);
                files.push({
                    name,
                    relativePath: `${folder}/${name}`.replace(/\\/g, '/'),
                    size: stat.size,
                    modifiedAt: stat.mtime
                });
            } catch (e) {
                // ignore unreadable entries
            }
        }

        files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
        const paged = files.slice(offset, offset + limit);

        return {
            root: uploadsRoot,
            folder,
            limit,
            offset,
            total: files.length,
            files: paged.map(f => ({
                ...f,
                url: `/uploads/${f.relativePath}`
            }))
        };
    }

    /**
     * Create ZIP stream for uploads folder (local volume).
     * Proxy stream only if EXPORT_IMPORT_PROXY=true and TOTILOVE_URL + EXPORT_SECRET are set.
     */
    async createUploadsArchiveStream() {
        const hasUploadsPath = Boolean(process.env.UPLOADS_PATH && String(process.env.UPLOADS_PATH).trim());
        try {
            const { uploadsRoot, filename } = await this.getUploadsExportInfo();
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.directory(uploadsRoot, 'uploads');
            return { archive, filename };
        } catch (directError) {
            if (
                uploadsProxyAllowed() &&
                !hasUploadsPath &&
                process.env.TOTILOVE_URL &&
                process.env.EXPORT_SECRET
            ) {
                return this.createProxiedArchiveStream();
            }
            throw directError;
        }
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
     * Fetch folder stats from local uploads only (never proxies — proxy caused 302/HTML from main app).
     */
    async getUploadsInfo() {
        const uploadsRoot = await this.ensureConfiguredUploadsRoot();

        const fsp = require('fs').promises;
        const fsSync = require('fs');

        if (!fsSync.existsSync(uploadsRoot)) {
            throw new Error(`Uploads path does not exist: ${uploadsRoot}`);
        }

        async function scanDir(dirPath, visitedCanonical, depth) {
            if (depth > 64) {
                throw new Error(`Uploads scan stopped: directory depth exceeded at ${dirPath}`);
            }
            let canonical;
            try {
                canonical = await fsp.realpath(dirPath);
            } catch {
                canonical = path.resolve(dirPath);
            }
            if (visitedCanonical.has(canonical)) {
                return { fileCount: 0, totalSize: 0, lastModified: null, subfolders: [] };
            }
            visitedCanonical.add(canonical);

            const entries = await fsp.readdir(dirPath, { withFileTypes: true });
            let fileCount = 0;
            let totalSize = 0;
            let lastModified = null;
            const subfolders = [];

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    const sub = await scanDir(fullPath, visitedCanonical, depth + 1);
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

        let info;
        try {
            info = await scanDir(uploadsRoot, new Set(), 0);
        } catch (scanErr) {
            const wrapped = new Error(
                `Scan failed under ${uploadsRoot}: ${scanErr.message}${scanErr.code ? ` (${scanErr.code})` : ''}`
            );
            wrapped.code = scanErr.code;
            throw wrapped;
        }

        const iso = (d) => (d instanceof Date ? d.toISOString() : d);

        function normalizeFolder(f) {
            return {
                ...f,
                lastModified: f.lastModified != null ? iso(f.lastModified) : null,
                subfolders: Array.isArray(f.subfolders) ? f.subfolders.map(normalizeFolder) : []
            };
        }

        const normalizedSubfolders = Array.isArray(info.subfolders)
            ? info.subfolders.map(normalizeFolder)
            : [];

        return {
            path: uploadsRoot,
            fileCount: info.fileCount,
            totalSize: info.totalSize,
            lastModified: info.lastModified != null ? iso(info.lastModified) : null,
            subfolders: normalizedSubfolders,
            scannedAt: new Date().toISOString()
        };
    }

    /**
     * Export users to CSV
     */
    async exportUsersToCSV(options = {}) {
        try {
            await ensureSuspensionSchema();

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
                if (filters.status === 'suspended') {
                    whereConditions.push(`COALESCE(u.is_suspended, u.is_banned, false) = true`);
                } else if (filters.status === 'active') {
                    whereConditions.push(`COALESCE(u.is_suspended, u.is_banned, false) = false`);
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
                    COALESCE(u.is_suspended, u.is_banned, false) as is_suspended,
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
            await ensureSuspensionSchema();

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
                if (filters.status === 'suspended') {
                    whereConditions.push(`COALESCE(u.is_suspended, u.is_banned, false) = true`);
                } else if (filters.status === 'active') {
                    whereConditions.push(`COALESCE(u.is_suspended, u.is_banned, false) = false`);
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
                    COALESCE(u.is_suspended, u.is_banned, false) as is_suspended,
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





















































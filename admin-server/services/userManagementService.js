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

let suspensionSchemaPromise = null;

async function ensureSuspensionSchema() {
    if (!suspensionSchemaPromise) {
        suspensionSchemaPromise = (async () => {
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false`);
            await query(`ALTER TABLE users ALTER COLUMN is_suspended SET DEFAULT false`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP`);
            await query(`UPDATE users SET is_suspended = false WHERE is_suspended IS NULL`);
        })().catch((error) => {
            suspensionSchemaPromise = null;
            throw error;
        });
    }

    return suspensionSchemaPromise;
}

function suspendedSql(alias = 'u') {
    return `COALESCE(${alias}.is_suspended, false)`;
}

let adminBlacklistSchemaPromise = null;

async function ensureAdminBlacklistSchema() {
    if (!adminBlacklistSchemaPromise) {
        adminBlacklistSchemaPromise = (async () => {
            const loc = await query(`
                SELECT DISTINCT table_schema
                FROM information_schema.tables
                WHERE table_name = 'admin_blacklisted_users'
                  AND table_type = 'BASE TABLE'
            `);
            for (const row of loc.rows) {
                const sch = row.table_schema;
                if (!sch || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(sch)) continue;
                await query(
                    `ALTER TABLE ${sch}.admin_blacklisted_users ADD COLUMN IF NOT EXISTS stop_this_ip BOOLEAN DEFAULT true`
                );
                await query(
                    `ALTER TABLE ${sch}.admin_blacklisted_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`
                );
            }
            invalidateAdminBlacklistTableMeta();
        })().catch((error) => {
            adminBlacklistSchemaPromise = null;
            throw error;
        });
    }
    return adminBlacklistSchemaPromise;
}

function invalidateAdminBlacklistTableMeta() {
    adminBlacklistTableMetaCache = null;
    adminBlacklistTableMetaPromise = null;
}

let adminBlacklistTableMetaCache = null;
let adminBlacklistTableMetaPromise = null;

/**
 * Resolves primary admin_blacklisted_users table for counts and blacklist-tab listing.
 */
async function getAdminBlacklistTableMeta() {
    if (adminBlacklistTableMetaCache) {
        return adminBlacklistTableMetaCache;
    }
    if (adminBlacklistTableMetaPromise) {
        return adminBlacklistTableMetaPromise;
    }

    adminBlacklistTableMetaPromise = (async () => {
        const loc = await query(`
            SELECT table_schema
            FROM information_schema.tables
            WHERE table_name = 'admin_blacklisted_users'
              AND table_type = 'BASE TABLE'
        `);
        const schemas = loc.rows
            .map((r) => r.table_schema)
            .filter((s) => s && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

        let totalRows = 0;
        let primarySchema = 'public';
        let maxInSchema = -1;

        for (const sch of schemas) {
            const cn = await query(`SELECT COUNT(*)::int AS c FROM ${sch}.admin_blacklisted_users`);
            const n = Number(cn.rows[0]?.c ?? 0) || 0;
            totalRows += n;
            if (n > maxInSchema) {
                maxInSchema = n;
                primarySchema = sch;
            } else if (n === maxInSchema && n > 0 && sch === 'public') {
                primarySchema = sch;
            }
        }

        if (schemas.length === 0) {
            primarySchema = 'public';
        }

        const fqTable = `${primarySchema}.admin_blacklisted_users`;

        // Column list from the database (ordinal order), not driver field order from SELECT * LIMIT 0.
        const colRows = await query(
            `SELECT column_name
             FROM information_schema.columns
             WHERE table_schema = $1
               AND table_name = 'admin_blacklisted_users'
             ORDER BY ordinal_position`,
            [primarySchema]
        );
        if (colRows.rows.length === 0) {
            throw new Error(
                `admin_blacklisted_users: no columns readable in schema "${primarySchema}" (table missing or no access).`
            );
        }

        const listColumnNames = colRows.rows.map((r) => r.column_name);
        const insertColumnNames = listColumnNames.filter((n) => n !== 'id');

        adminBlacklistTableMetaCache = {
            totalRows,
            primarySchema,
            fqTable,
            schemas: schemas.length ? schemas : ['public'],
            insertColumnNames,
            listColumnNames
        };
        return adminBlacklistTableMetaCache;
    })();

    try {
        return await adminBlacklistTableMetaPromise;
    } finally {
        adminBlacklistTableMetaPromise = null;
    }
}

/**
 * Read a usable IP from `users` for blacklist archive without assuming a single column name
 * (e.g. some DBs have `last_ip_address`, others only `ip_address`). No DDL.
 * Use `pool` (not a transaction client): probing missing columns errors in PG and would abort an open transaction.
 */
async function selectUserIpColumn(executor, userId) {
    const candidates = ['last_ip_address', 'ip_address'];
    for (const col of candidates) {
        try {
            const r = await executor.query(`SELECT ${col} AS v FROM users WHERE id = $1`, [userId]);
            const v = r.rows[0]?.v;
            if (v != null && String(v).trim() !== '') {
                return String(v).trim();
            }
        } catch (e) {
            if (e && e.code === '42703') {
                continue;
            }
            throw e;
        }
    }
    return null;
}

/**
 * One archive row: every non-id column from the table is set.
 * email + both IP fields from `users` (passed in as `email` / `ip`); `blacklisted_at` uses DB DEFAULT.
 */
function buildBlacklistInsertStatement(fqTable, insertColumnNames, { email, reason, ip, stopThisIp = true, notes = '' }) {
    if (!insertColumnNames || !insertColumnNames.length || !insertColumnNames.includes('email')) {
        throw new Error('admin_blacklisted_users: missing insertable columns or email.');
    }

    const names = [];
    const valueExprs = [];
    const values = [];
    let p = 1;
    const emailVal = email != null ? String(email).toLowerCase().trim() : '';
    const reasonVal = reason != null ? String(reason).trim() : '';
    const notesVal = notes != null ? String(notes) : '';
    const ipVal = ip != null && String(ip).trim() !== '' ? String(ip).trim() : '';

    for (const col of insertColumnNames) {
        if (col === 'email') {
            names.push('email');
            valueExprs.push(`$${p++}`);
            values.push(emailVal);
            continue;
        }
        if (col === 'reason') {
            names.push('reason');
            valueExprs.push(`$${p++}`);
            values.push(reasonVal);
            continue;
        }
        if (col === 'notes') {
            names.push('notes');
            valueExprs.push(`$${p++}`);
            values.push(notesVal);
            continue;
        }
        if (col === 'user_ip_address') {
            names.push('user_ip_address');
            valueExprs.push(`$${p++}`);
            values.push(ipVal);
            continue;
        }
        if (col === 'ip_address') {
            names.push('ip_address');
            valueExprs.push(`$${p++}`);
            values.push(ipVal);
            continue;
        }
        if (col === 'blacklisted_at') {
            names.push('blacklisted_at');
            valueExprs.push('DEFAULT');
            continue;
        }
        if (col === 'updated_at') {
            names.push('updated_at');
            valueExprs.push('DEFAULT');
            continue;
        }
        if (col === 'stop_this_ip') {
            names.push('stop_this_ip');
            valueExprs.push(`$${p++}`);
            values.push(Boolean(stopThisIp));
            continue;
        }
        throw new Error(`admin_blacklisted_users: unsupported column "${col}" for blacklist insert.`);
    }

    const text = `INSERT INTO ${fqTable} (${names.join(', ')}) VALUES (${valueExprs.join(', ')}) RETURNING id`;
    return { text, values };
}

function assertBlacklistIdent(name) {
    if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        throw new Error(`Invalid admin_blacklisted_users column name: ${name}`);
    }
    return name;
}

/** `res.json` cannot encode bigint / Buffer values from pg `RETURNING *` rows. */
function serializePgRowForJson(row) {
    if (!row || typeof row !== 'object') {
        return row;
    }
    return JSON.parse(
        JSON.stringify(row, (_, v) => {
            if (typeof v === 'bigint') {
                return v.toString();
            }
            if (Buffer.isBuffer(v)) {
                return v.toString('hex');
            }
            return v;
        })
    );
}

function humanizeBlacklistColumnLabel(name) {
    if (name === 'stop_this_ip') {
        return 'Stop this IP';
    }
    return String(name)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
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
    const baseName = path.basename(normalizedPath);
    const posixDir = path.posix.dirname(normalizedPath);
    const dirPrefix = posixDir === '.' ? '' : `${posixDir}/`;

    return [
        `${stem}_thumb${ext}`,
        `${stem}_thumbnail${ext}`,
        `${stem}.thumb${ext}`,
        `${stem}.thumbnail${ext}`,
        `${stem}-thumb${ext}`,
        `${stem}-thumbnail${ext}`,
        `${stem}_small${ext}`,
        `${stem}_medium${ext}`,
        `${stem}_large${ext}`,
        `${stem}.small${ext}`,
        `${stem}.medium${ext}`,
        `${stem}.large${ext}`,
        `${stem}-small${ext}`,
        `${stem}-medium${ext}`,
        `${stem}-large${ext}`,
        `${dirPrefix}small/${baseName}`,
        `${dirPrefix}medium/${baseName}`,
        `${dirPrefix}large/${baseName}`,
        `${dirPrefix}thumb/${baseName}`,
        `${dirPrefix}thumbnail/${baseName}`
    ];
}

function normalizeImageFamilyKey(fileName) {
    const normalizedPath = normalizeStoredUploadPath(fileName);
    if (!normalizedPath) {
        return '';
    }

    const ext = path.extname(normalizedPath);
    let stem = ext ? normalizedPath.slice(0, -ext.length) : normalizedPath;
    stem = path.posix.basename(stem).toLowerCase();

    stem = stem
        .replace(/(?:[._-](?:thumb|thumbnail|small|medium|large)){1,4}$/i, '')
        .replace(/(?:[._-](?:thumb|thumbnail|small|medium|large)){1,4}$/i, '');

    return stem;
}

async function deleteStoredUploadFamilyFiles(storedPath, subdirName, candidateDirectories, label) {
    const familyKey = normalizeImageFamilyKey(storedPath);
    if (!familyKey) {
        return { deleted: 0, hadError: false };
    }

    async function walkFilesRecursive(currentDir, files = []) {
        let entries = [];
        entries = await fs.readdir(currentDir, { withFileTypes: true });

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
    let hadError = false;

    for (const directory of candidateDirectories) {
        let files = [];
        try {
            files = await walkFilesRecursive(directory);
        } catch (error) {
            hadError = true;
            logger.warn(`⚠️ Could not read ${label} directory ${directory}: ${error.message}`);
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
                logger.info(`🗑️ Deleted ${label}: ${safePath}`);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    hadError = true;
                    logger.warn(`⚠️ Could not delete ${label} at ${safePath}: ${error.message}`);
                }
            }
        }
    }

    return { deleted, hadError };
}

/**
 * After per-row deletes, remove any profile files still on disk for this user
 * (missed paths, failed unlinks, or files never listed in user_images).
 */
async function sweepRemainingProfileFilesForUser(userId, profileImageDirectories) {
    const uid = Number(userId);
    if (!Number.isFinite(uid) || uid < 1) {
        return { deleted: 0, hadError: false };
    }

    const prefix = `user_${uid}_`.toLowerCase();
    let deleted = 0;
    let hadError = false;

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

    for (const directory of profileImageDirectories) {
        let files = [];
        try {
            files = await walkFilesRecursive(directory);
        } catch (error) {
            hadError = true;
            logger.warn(`⚠️ Could not read profile_images directory for sweep ${directory}: ${error.message}`);
            continue;
        }

        for (const filePath of files) {
            const base = path.basename(filePath).toLowerCase();
            if (!base.startsWith(prefix)) {
                continue;
            }

            const relativePath = path.relative(directory, filePath);
            const safePath = safeJoin(directory, relativePath);
            if (!safePath) {
                continue;
            }

            try {
                await fs.unlink(safePath);
                deleted += 1;
                logger.info(`🗑️ Swept leftover profile file for user ${uid}: ${safePath}`);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    hadError = true;
                    logger.warn(`⚠️ Could not sweep profile file at ${safePath}: ${error.message}`);
                }
            }
        }
    }

    return { deleted, hadError };
}

class UserManagementService {
    constructor() {
        this.cacheExpiry = 300; // 5 minutes
    }

    /**
     * Get global user breakdown counts
     */
    async getUserSummary() {
        await ensureSuspensionSchema();
        await ensureAdminBlacklistSchema();

        const summaryQuery = `
            SELECT
                COUNT(DISTINCT u.id)::int AS total_users,
                COUNT(DISTINCT u.id) FILTER (WHERE ${suspendedSql('u')} = false)::int AS active_users,
                COUNT(DISTINCT u.id) FILTER (WHERE ${suspendedSql('u')} = true)::int AS suspended_users,
                COUNT(DISTINCT u.id) FILTER (WHERE COALESCE(u.email_verified, false) = true)::int AS email_verified_users,
                COUNT(DISTINCT u.id) FILTER (WHERE COALESCE(u.email_verified, false) = false)::int AS email_unverified_users,
                COUNT(DISTINCT u.id) FILTER (WHERE COALESCE(u.profile_verified, false) = true)::int AS profile_verified_users,
                COUNT(DISTINCT u.id) FILTER (WHERE ui.id IS NOT NULL)::int AS with_photos_users,
                COUNT(DISTINCT u.id) FILTER (WHERE ui.id IS NULL)::int AS no_photos_users,
                COUNT(DISTINCT u.id) FILTER (WHERE LOWER(COALESCE(u.gender, '')) = 'male')::int AS male_users,
                COUNT(DISTINCT u.id) FILTER (WHERE LOWER(COALESCE(u.gender, '')) = 'female')::int AS female_users
            FROM users u
            LEFT JOIN user_images ui ON u.id = ui.user_id
        `;

        const [result, blMeta] = await Promise.all([query(summaryQuery), getAdminBlacklistTableMeta()]);
        const row = result.rows[0] || {};

        const totalUsers = parseInt(row.total_users || 0);
        const activeUsers = parseInt(row.active_users || 0);

        return {
            totalUsers,
            activeUsers,
            notActiveUsers: Math.max(totalUsers - activeUsers, 0),
            suspendedUsers: parseInt(row.suspended_users || 0),
            emailVerifiedUsers: parseInt(row.email_verified_users || 0),
            emailUnverifiedUsers: parseInt(row.email_unverified_users || 0),
            profileVerifiedUsers: parseInt(row.profile_verified_users || 0),
            withPhotosUsers: parseInt(row.with_photos_users || 0),
            noPhotosUsers: parseInt(row.no_photos_users || 0),
            maleUsers: parseInt(row.male_users || 0),
            femaleUsers: parseInt(row.female_users || 0),
            blacklistedUsers: Number(blMeta.totalRows ?? 0) || 0
        };
    }

    /**
     * Get users with filters, pagination, and sorting
     */
    async getUsers(options = {}) {
        await ensureSuspensionSchema();

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
            blacklisted = false,
            sortBy = 'date_joined',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;
        const cacheKey = `admin:users:${JSON.stringify(options)}`;
        const useBlacklistDrive = blacklisted === true || blacklisted === 'true';

        try {
            if (redis.enabled && !useBlacklistDrive) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    parsed.summary = await this.getUserSummary();
                    return parsed;
                }
            }

            if (useBlacklistDrive) {
                await ensureAdminBlacklistSchema();
                const blMeta = await getAdminBlacklistTableMeta();
                const blFrom = `${blMeta.fqTable} ab`;
                const columnNames = blMeta.listColumnNames || [];

                let whereConditions = ['1=1'];
                const blParams = [];
                let blParamIndex = 1;

                if (search) {
                    whereConditions.push(`row_to_json(ab)::text ILIKE $${blParamIndex}`);
                    blParams.push(`%${search}%`);
                    blParamIndex++;
                }

                const whereClause = whereConditions.join(' AND ');

                const countResult = await query(
                    `SELECT COUNT(*)::int AS total FROM ${blFrom} WHERE ${whereClause}`,
                    blParams
                );
                const total = parseInt(countResult.rows[0]?.total || 0);

                let orderCol = columnNames.includes('id') ? 'id' : columnNames[0];
                if (!orderCol) {
                    orderCol = 'id';
                }
                const sortCandidate =
                    sortBy === 'blacklist_entry_id' || sortBy === 'date_joined' || sortBy === 'last_login'
                        ? 'id'
                        : sortBy;
                if (sortCandidate && columnNames.includes(sortCandidate)) {
                    orderCol = sortCandidate;
                }

                const orderExpr = `ab.${assertBlacklistIdent(orderCol)}`;
                const safeBlOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

                const blFinalParams = [...blParams, limit, offset];
                const limitIdx = blParamIndex;
                const offsetIdx = blParamIndex + 1;

                const usersQuery = `
                    SELECT ab.*
                    FROM ${blFrom}
                    WHERE ${whereClause}
                    ORDER BY ${orderExpr} ${safeBlOrder}
                    LIMIT $${limitIdx} OFFSET $${offsetIdx}
                `;

                const usersResult = await query(usersQuery, blFinalParams);

                const pkCol = columnNames.includes('id') ? 'id' : columnNames[0];
                const users = usersResult.rows.map((row) => {
                    const pkVal = pkCol != null ? row[pkCol] : null;
                    return {
                        ...row,
                        blacklist_entry_id: pkVal,
                        row_source: 'blacklist_entry',
                        id: pkVal
                    };
                });

                const blacklistColumns = columnNames.map((name) => ({
                    key: name,
                    label: humanizeBlacklistColumnLabel(name),
                    sortKey: name
                }));

                return {
                    users,
                    blacklistColumns,
                    summary: await this.getUserSummary(),
                    pagination: {
                        page,
                        limit,
                        total,
                        pages: Math.ceil(total / limit),
                        hasNext: page < Math.ceil(total / limit),
                        hasPrev: page > 1
                    }
                };
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
            if (status === 'suspended') {
                whereConditions.push(`${suspendedSql('u')} = true`);
            } else if (status === 'active') {
                whereConditions.push(`${suspendedSql('u')} = false`);
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
                    COALESCE(u.is_suspended, false) as is_suspended,
                    u.suspended_reason,
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
                status: user.is_suspended ? 'suspended' : 'active',
                image_count: statsMap[user.id]?.image_count || 0,
                messages_sent: statsMap[user.id]?.messages_sent || 0,
                messages_received: statsMap[user.id]?.messages_received || 0,
                likes_received: statsMap[user.id]?.likes_received || 0,
                likes_given: statsMap[user.id]?.likes_given || 0,
                profile_views: statsMap[user.id]?.profile_views || 0
            }));

            const result = {
                users,
                summary: await this.getUserSummary(),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1
                }
            };

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
        await ensureSuspensionSchema();

        const cacheKey = `admin:user:${userId}`;

        try {
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
            await ensureSuspensionSchema();

            const allowedFields = [
                'real_name', 'email', 'birthdate', 'gender', 'country_id', 
                'state_id', 'city_id', 'email_verified', 'profile_verified', 'is_suspended'
            ];

            const fieldAliases = {
                // Accept misspelling from clients while writing to the correct column.
                parner_preferences: 'partner_preferences'
            };

            const normalizedUpdateData = { ...updateData };
            if (Object.prototype.hasOwnProperty.call(normalizedUpdateData, 'is_banned')) {
                normalizedUpdateData.is_suspended = normalizedUpdateData.is_banned;
                delete normalizedUpdateData.is_banned;
            }

            const updateFields = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(normalizedUpdateData)) {
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

            if (Object.prototype.hasOwnProperty.call(normalizedUpdateData, 'about_me')) {
                await query(
                    `INSERT INTO user_attributes (user_id, about_me, about_partner)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (user_id)
                     DO UPDATE SET
                        about_me = COALESCE(EXCLUDED.about_me, user_attributes.about_me),
                        about_partner = COALESCE(EXCLUDED.about_partner, user_attributes.about_partner)`,
                    [
                        userId,
                        normalizedUpdateData.about_me,
                        Object.prototype.hasOwnProperty.call(normalizedUpdateData, 'partner_preferences')
                            ? normalizedUpdateData.partner_preferences
                            : (Object.prototype.hasOwnProperty.call(normalizedUpdateData, 'parner_preferences') ? normalizedUpdateData.parner_preferences : null)
                    ]
                );
            }

            const partnerPreferenceValue = Object.prototype.hasOwnProperty.call(normalizedUpdateData, 'partner_preferences')
                ? normalizedUpdateData.partner_preferences
                : (Object.prototype.hasOwnProperty.call(normalizedUpdateData, 'parner_preferences') ? normalizedUpdateData.parner_preferences : undefined);

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

            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                if (typeof redis.delPrefix === 'function') {
                    await redis.delPrefix('admin:users:');
                } else {
                    await redis.del('admin:users:*');
                }
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
     * Suspend user
     */
    async suspendUser(userId, reason = '') {
        try {
            await ensureSuspensionSchema();

            const suspensionReason = typeof reason === 'string' ? reason.trim() : '';
            if (!suspensionReason) {
                return { success: false, message: 'Suspension reason is required' };
            }

            const result = await query(
                `UPDATE users 
                 SET is_suspended = true,
                     suspended_reason = $2,
                     suspended_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [userId, suspensionReason]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                if (typeof redis.delPrefix === 'function') {
                    await redis.delPrefix('admin:users:');
                } else {
                    await redis.del('admin:users:*');
                }
            }

            return {
                success: true,
                message: 'User suspended successfully',
                user: result.rows[0]
            };
        } catch (error) {
            logger.error('Error suspending user:', error);
            throw error;
        }
    }

    /**
     * Unsuspend user
     */
    async unsuspendUser(userId) {
        try {
            await ensureSuspensionSchema();

            const result = await query(
                `UPDATE users 
                 SET is_suspended = false,
                     suspended_reason = NULL,
                     suspended_at = NULL
                 WHERE id = $1
                 RETURNING *`,
                [userId]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'User not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:user:${userId}`);
                if (typeof redis.delPrefix === 'function') {
                    await redis.delPrefix('admin:users:');
                } else {
                    await redis.del('admin:users:*');
                }
            }

            return {
                success: true,
                message: 'User unsuspended successfully',
                user: result.rows[0]
            };
        } catch (error) {
            logger.error('Error unsuspending user:', error);
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
                if (typeof redis.delPrefix === 'function') {
                    await redis.delPrefix('admin:users:');
                } else {
                    await redis.del('admin:users:*');
                }
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
                if (typeof redis.delPrefix === 'function') {
                    await redis.delPrefix('admin:users:');
                } else {
                    await redis.del('admin:users:*');
                }
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
                if (typeof redis.delPrefix === 'function') {
                    await redis.delPrefix('admin:users:');
                } else {
                    await redis.del('admin:users:*');
                }
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
                if (typeof redis.delPrefix === 'function') {
                    await redis.delPrefix('admin:users:');
                } else {
                    await redis.del('admin:users:*');
                }
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
                        
                        // Delete all same-family variants (small/medium/thumb/etc.) together.
                        const familyDeleteResult = await deleteStoredUploadFamilyFiles(
                            image.file_name,
                            'profile_images',
                            profileImageDirectories,
                            'profile image family file'
                        );
                        deletedCount += familyDeleteResult.deleted;
                        if (familyDeleteResult.hadError) {
                            errorCount++;
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

            const sweepResult = await sweepRemainingProfileFilesForUser(userId, profileImageDirectories);
            if (sweepResult.deleted > 0) {
                logger.info(
                    `📊 Profile image sweep for user ${userId}: removed ${sweepResult.deleted} leftover file(s) matching user_${userId}_*`
                );
            }
            if (sweepResult.hadError) {
                logger.warn(`⚠️ Profile image sweep for user ${userId} completed with one or more read/delete errors`);
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

            if (redis.enabled) {
                try {
                    await redis.del(`admin:user:${userId}`);
                    if (typeof redis.delPrefix === 'function') {
                        await redis.delPrefix('admin:users:');
                    } else {
                        await redis.del('admin:users:*');
                    }
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
     * Blacklist user: archive row on admin_blacklisted_users (schema-driven INSERT), then hard-delete
     * the account via deleteUser — same as admin-server1.
     */
    async blacklistUser(userId, adminId, reason = '', notes = '', ipAddress = null, userAgent = null, stopThisIp = true) {
        await ensureAdminBlacklistSchema();
        const blMeta = await getAdminBlacklistTableMeta();
        const blFq = blMeta.fqTable;
        const insertColumnNames = blMeta.insertColumnNames || [];
        const schemasForDup = blMeta.schemas.length ? blMeta.schemas : ['public'];

        const userIpFromDb = await selectUserIpColumn(pool, userId);
        const archiveIp =
            (userIpFromDb && String(userIpFromDb).trim()) ||
            (ipAddress != null && String(ipAddress).trim()) ||
            '';

        const client = await pool.connect();
        let real_name;
        let email;
        let insertedBlacklistId = null;
        let emailAlreadyBlacklisted = false;
        try {
            await client.query('BEGIN');

            const userInfo = await client.query(`SELECT id, real_name, email FROM users WHERE id = $1`, [userId]);

            if (userInfo.rows.length === 0) {
                throw new Error('User not found');
            }

            ({ real_name, email } = userInfo.rows[0]);

            const emailNorm = (email || '').toLowerCase().trim();
            if (!emailNorm) {
                const err = new Error('Cannot blacklist: user has no email on file');
                err.statusCode = 400;
                throw err;
            }

            const dupUnion = schemasForDup
                .map(
                    (sch) => `SELECT id FROM ${sch}.admin_blacklisted_users ab
                 WHERE NULLIF(LOWER(TRIM(COALESCE(ab.email, ''))), '') = $1
                   AND $1 <> ''`
                )
                .join(' UNION ALL ');
            const existingBlacklist = await client.query(`SELECT id FROM (${dupUnion}) d LIMIT 1`, [emailNorm]);

            if (existingBlacklist.rows.length > 0) {
                emailAlreadyBlacklisted = true;
            } else {
                const notesArchived = [notes, real_name ? `name_at_blacklist: ${real_name}` : '']
                    .filter((s) => s && String(s).trim())
                    .join(' | ');
                const reasonOnly = (reason && String(reason).trim()) || 'Blacklisted by admin';

                if (notesArchived && !insertColumnNames.includes('notes')) {
                    logger.info(
                        `Blacklist archive metadata (no notes column on table) user ${userId}: ${notesArchived}`
                    );
                }

                const insStmt = buildBlacklistInsertStatement(blFq, insertColumnNames, {
                    email: emailNorm,
                    reason: reasonOnly,
                    notes: notesArchived,
                    ip: archiveIp,
                    stopThisIp: Boolean(stopThisIp)
                });
                try {
                    const ins = await client.query(insStmt.text, insStmt.values);
                    insertedBlacklistId = ins.rows[0]?.id ?? null;
                } catch (insErr) {
                    if (insErr && insErr.code === '23505') {
                        emailAlreadyBlacklisted = true;
                    } else {
                        throw insErr;
                    }
                }
            }

            await client.query('COMMIT');
            if (emailAlreadyBlacklisted) {
                logger.info(
                    `Blacklist insert skipped (email already listed) for user ${userId} (${emailNorm}); proceeding with account deletion by admin ${adminId}`
                );
            } else {
                logger.info(
                    `Blacklist archive written for user ${userId} (${email}) by admin ${adminId}; running full account deletion`
                );
            }
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error blacklisting user:', error);
            throw error;
        } finally {
            client.release();
        }

        try {
            const deleteResult = await this.deleteUser(userId);
            if (!deleteResult || !deleteResult.success) {
                throw new Error(
                    insertedBlacklistId
                        ? 'Account deletion did not complete after blacklist record was created'
                        : 'Account deletion did not complete'
                );
            }
        } catch (error) {
            logger.error(`deleteUser failed after blacklist flow for user ${userId}:`, error);
            try {
                if (insertedBlacklistId) {
                    await query(`DELETE FROM ${blFq} WHERE id = $1`, [insertedBlacklistId]);
                }
            } catch (cleanupError) {
                logger.error('Failed to remove blacklist row after delete failure:', cleanupError);
            }
            invalidateAdminBlacklistTableMeta();
            throw error;
        }

        if (redis.enabled) {
            try {
                await redis.del(`admin:user:${userId}`);
                if (typeof redis.delPrefix === 'function') {
                    await redis.delPrefix('admin:users:');
                } else {
                    await redis.del('admin:users:*');
                }
            } catch (e) {
                logger.warn('Redis cache clear after blacklist:', e.message);
            }
        }

        invalidateAdminBlacklistTableMeta();

        const notice = emailAlreadyBlacklisted ? 'Users email blacklisted already.' : undefined;
        const message = emailAlreadyBlacklisted
            ? `User ${real_name} (${email}) was removed from accounts.`
            : `User ${real_name} (${email}) was removed from accounts and recorded on the admin blacklist.`;

        return {
            success: true,
            message,
            ...(notice ? { notice } : {})
        };
    }

    /**
     * Remove a row from admin_blacklisted_users by primary key (admin blacklist tab).
     */
    async unblacklistByEntryId(entryId, adminId) {
        await ensureAdminBlacklistSchema();
        const { fqTable } = await getAdminBlacklistTableMeta();

        const result = await query(
            `DELETE FROM ${fqTable} ab
             WHERE ab.id = $1
             RETURNING ab.id`,
            [entryId]
        );

        if (result.rowCount === 0) {
            return { success: false, message: 'Blacklist entry not found' };
        }

        if (redis.enabled) {
            try {
                if (typeof redis.delPrefix === 'function') {
                    await redis.delPrefix('admin:users:');
                } else {
                    await redis.del('admin:users:*');
                }
            } catch (e) {
                logger.warn('Redis cache clear after unblacklist:', e.message);
            }
        }

        invalidateAdminBlacklistTableMeta();

        logger.info(`Blacklist entry ${entryId} deleted by admin ${adminId}`);
        return { success: true, message: 'Entry removed from blacklist successfully.' };
    }

    /**
     * Update columns on admin_blacklisted_users (schema-driven; only real table columns except id).
     */
    async updateBlacklistEntry(entryId, body = {}, adminId) {
        await ensureAdminBlacklistSchema();
        const meta = await getAdminBlacklistTableMeta();
        const { fqTable, primarySchema, listColumnNames } = meta;
        const idNum = parseInt(entryId, 10);
        if (!Number.isFinite(idNum) || idNum <= 0) {
            return { success: false, message: 'Invalid blacklist entry id' };
        }

        const typeRows = await query(
            `SELECT column_name, data_type
             FROM information_schema.columns
             WHERE table_schema = $1
               AND table_name = 'admin_blacklisted_users'`,
            [primarySchema]
        );
        const typeMap = Object.fromEntries(typeRows.rows.map((r) => [r.column_name, r.data_type]));

        const forbidden = new Set(['id', 'updated_at', 'created_at']);
        const parts = [];
        const vals = [];
        let pi = 1;

        for (const [rawKey, rawVal] of Object.entries(body || {})) {
            if (!listColumnNames.includes(rawKey) || forbidden.has(rawKey)) {
                continue;
            }
            assertBlacklistIdent(rawKey);
            const dt = typeMap[rawKey];
            if (!dt) {
                continue;
            }

            let coerced;
            if (dt === 'boolean') {
                coerced = !(rawVal === false || rawVal === 'false' || rawVal === 0 || rawVal === '0');
            } else if (dt === 'integer' || dt === 'bigint' || dt === 'smallint') {
                if (rawVal === '' || rawVal === null || rawVal === undefined) {
                    coerced = null;
                } else {
                    const n = parseInt(rawVal, 10);
                    if (Number.isNaN(n)) {
                        return { success: false, message: `Invalid integer for column ${rawKey}` };
                    }
                    coerced = n;
                }
            } else if (String(dt).includes('timestamp') || dt === 'date') {
                if (rawVal === '' || rawVal === null || rawVal === undefined) {
                    coerced = null;
                } else {
                    coerced = String(rawVal).trim();
                }
            } else {
                if (rawVal === null) {
                    coerced = null;
                } else if (rawVal === undefined) {
                    continue;
                } else {
                    coerced = String(rawVal);
                }
            }

            if (rawKey === 'email' && coerced != null && typeof coerced === 'string') {
                coerced = coerced.toLowerCase().trim();
            }

            parts.push(`${rawKey} = $${pi++}`);
            vals.push(coerced);
        }

        if (parts.length === 0) {
            return { success: false, message: 'No allowed fields to update' };
        }

        vals.push(idNum);
        const sql = `UPDATE ${fqTable} SET ${parts.join(', ')} WHERE id = $${pi} RETURNING *`;

        try {
            const result = await query(sql, vals);
            if (result.rowCount === 0) {
                return { success: false, message: 'Blacklist entry not found' };
            }
            const row = result.rows[0] || null;

            if (redis.enabled) {
                try {
                    if (typeof redis.delPrefix === 'function') {
                        await redis.delPrefix('admin:users:');
                    } else {
                        await redis.del('admin:users:*');
                    }
                } catch (e) {
                    logger.warn('Redis cache clear after blacklist update:', e.message);
                }
            }

            logger.info(`Blacklist entry ${entryId} updated by admin ${adminId}`);
            return {
                success: true,
                message: 'Blacklist entry updated.',
                entry: serializePgRowForJson(row)
            };
        } catch (e) {
            if (e && e.code === '23505') {
                return { success: false, message: 'That value conflicts with an existing blacklist row (e.g. duplicate email).' };
            }
            logger.error('updateBlacklistEntry SQL error:', e);
            throw e;
        }
    }

    /**
     * Insert a new admin_blacklisted_users row (manual add; does not delete any user).
     */
    async insertBlacklistEntry(body = {}, adminId) {
        await ensureAdminBlacklistSchema();
        const meta = await getAdminBlacklistTableMeta();
        const { fqTable, primarySchema, insertColumnNames } = meta;

        if (!insertColumnNames || !insertColumnNames.length || !insertColumnNames.includes('email')) {
            return { success: false, message: 'Blacklist table is missing an email column.' };
        }

        const infoRows = await query(
            `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
             WHERE table_schema = $1
               AND table_name = 'admin_blacklisted_users'
             ORDER BY ordinal_position`,
            [primarySchema]
        );
        const colInfo = Object.fromEntries(infoRows.rows.map((r) => [r.column_name, r]));

        const emailNorm = body && body.email != null ? String(body.email).toLowerCase().trim() : '';
        if (!emailNorm) {
            return { success: false, message: 'Email is required to add a blacklist entry.' };
        }

        const names = [];
        const valueExprs = [];
        const vals = [];
        let p = 1;

        for (const col of insertColumnNames) {
            assertBlacklistIdent(col);
            const info = colInfo[col];
            if (!info) {
                continue;
            }

            if (col === 'blacklisted_at') {
                names.push(col);
                valueExprs.push('DEFAULT');
                continue;
            }

            const has = Object.prototype.hasOwnProperty.call(body, col);
            let rawVal = has ? body[col] : undefined;

            if (!has) {
                if (col === 'email') {
                    rawVal = emailNorm;
                } else if (col === 'stop_this_ip') {
                    rawVal = true;
                } else if (col === 'reason') {
                    rawVal = 'Manually added from admin';
                } else if (col === 'user_ip_address' || col === 'ip_address') {
                    rawVal = '';
                } else if (info.column_default != null) {
                    continue;
                } else if (info.is_nullable === 'YES') {
                    rawVal = null;
                } else {
                    return { success: false, message: `Missing value for required column: ${col}` };
                }
            }

            if (col === 'email') {
                rawVal = emailNorm;
            }

            const dt = info.data_type;
            let coerced;
            if (dt === 'boolean') {
                coerced = !(rawVal === false || rawVal === 'false' || rawVal === 0 || rawVal === '0');
            } else if (dt === 'integer' || dt === 'bigint' || dt === 'smallint') {
                if (rawVal === '' || rawVal === null || rawVal === undefined) {
                    coerced = null;
                } else {
                    const n = parseInt(rawVal, 10);
                    if (Number.isNaN(n)) {
                        return { success: false, message: `Invalid integer for column ${col}` };
                    }
                    coerced = n;
                }
            } else if (String(dt).includes('timestamp') || dt === 'date') {
                if (rawVal === '' || rawVal === null || rawVal === undefined) {
                    coerced = null;
                } else {
                    coerced = String(rawVal).trim();
                }
            } else {
                if (rawVal === null) {
                    coerced = null;
                } else if (rawVal === undefined) {
                    coerced = null;
                } else {
                    coerced = String(rawVal);
                }
            }

            names.push(col);
            valueExprs.push(`$${p++}`);
            vals.push(coerced);
        }

        if (names.length === 0) {
            return { success: false, message: 'No columns to insert.' };
        }

        const sql = `INSERT INTO ${fqTable} (${names.join(', ')}) VALUES (${valueExprs.join(', ')}) RETURNING *`;

        try {
            const result = await query(sql, vals);
            const row = result.rows[0] || null;

            if (redis.enabled) {
                try {
                    if (typeof redis.delPrefix === 'function') {
                        await redis.delPrefix('admin:users:');
                    } else {
                        await redis.del('admin:users:*');
                    }
                } catch (e) {
                    logger.warn('Redis cache clear after blacklist insert:', e.message);
                }
            }

            invalidateAdminBlacklistTableMeta();

            logger.info(`Blacklist entry created (manual) by admin ${adminId}, id=${row?.id}`);
            return {
                success: true,
                message: 'Blacklist entry created.',
                entry: serializePgRowForJson(row)
            };
        } catch (e) {
            if (e && e.code === '23505') {
                return {
                    success: false,
                    message: 'That email (or another unique field) is already on the blacklist.'
                };
            }
            throw e;
        }
    }

    /**
     * Bulk operations
     */
    async bulkOperation(userIds, operation, data = {}) {
        try {
            await ensureSuspensionSchema();

            const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
            let queryText;
            let params = userIds;

            switch (operation) {
                case 'suspend':
                    data.reason = typeof data.reason === 'string' ? data.reason.trim() : '';
                    if (!data.reason) {
                        return { success: false, message: 'Suspension reason is required for bulk suspend' };
                    }
                    queryText = `UPDATE users SET is_suspended = true, suspended_reason = $${userIds.length + 1}, suspended_at = NOW() WHERE id IN (${placeholders}) RETURNING id`;
                    params = [...userIds, data.reason];
                    break;
                case 'unsuspend':
                    queryText = `UPDATE users SET is_suspended = false, suspended_reason = NULL, suspended_at = NULL WHERE id IN (${placeholders}) RETURNING id`;
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
                    const stopThisIp = !(
                        data.stop_this_ip === false ||
                        data.stop_this_ip === 'false' ||
                        data.stopThisIp === false ||
                        data.stopThisIp === 'false'
                    );

                    if (!adminId) {
                        return { success: false, message: 'Admin ID is required for blacklist operation' };
                    }

                    for (const userId of userIds) {
                        try {
                            const blacklistResult = await this.blacklistUser(
                                userId,
                                adminId,
                                reason,
                                notes,
                                null,
                                null,
                                stopThisIp
                            );
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

                if (redis.enabled) {
                    for (const uid of userIds) {
                        await redis.del(`admin:user:${uid}`);
                    }
                    if (typeof redis.delPrefix === 'function') {
                        await redis.delPrefix('admin:users:');
                    } else {
                        await redis.del('admin:users:*');
                    }
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











const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { query, pool } = require('../config/database');
const logger = require('../utils/logger');

/** Same candidate dirs as server.js static /uploads resolution */
function getPossibleUploadPaths() {
    return [
        process.env.UPLOADS_PATH,
        path.join(__dirname, '..', 'app', 'uploads', 'profile_images'),
        path.join(__dirname, '..', 'app', 'uploads'),
        path.join(__dirname, '..', 'uploads'),
        path.join(__dirname, '..', '..', 'uploads'),
        path.join(__dirname, 'uploads'),
        path.join(process.cwd(), 'uploads'),
        path.join(process.cwd(), '..', 'uploads'),
        path.join(process.cwd(), '..', 'app', 'uploads'),
        path.join(process.cwd(), '..', '..', 'uploads')
    ]
        .filter(Boolean)
        .map((p) => path.resolve(p));
}

/**
 * Resolve upload root directories (folder that maps to URL /uploads/).
 * @returns {string[]}
 */
function discoverUploadRoots() {
    const possibleUploadPaths = getPossibleUploadPaths();
    const roots = new Set();
    for (const uploadPath of possibleUploadPaths) {
        if (!uploadPath || !fs.existsSync(uploadPath)) continue;
        if (path.basename(uploadPath) === 'profile_images') {
            roots.add(path.dirname(uploadPath));
        } else if (fs.existsSync(path.join(uploadPath, 'profile_images'))) {
            roots.add(uploadPath);
        } else {
            roots.add(uploadPath);
        }
    }
    return [...roots];
}

/**
 * Strip to path relative to uploads root (e.g. chat_images/images/foo.jpg).
 * @param {string|null|undefined} rawPath
 * @returns {string|null}
 */
function normalizeRelativeUnderUploads(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return null;
    let normalized = rawPath.trim();
    if (!normalized) return null;
    try {
        if (/^https?:\/\//i.test(normalized)) {
            normalized = new URL(normalized).pathname || normalized;
        }
    } catch (_) {
        /* keep string */
    }
    normalized = normalized.replace(/\\/g, '/').split('?')[0].split('#')[0];
    normalized = normalized.replace(/^\.+/, '').replace(/^\/+/, '');
    if (normalized.startsWith('uploads/')) {
        normalized = normalized.slice('uploads/'.length);
    }
    if (!normalized || normalized.includes('..')) return null;
    return normalized;
}

/**
 * Try to delete a file under known upload roots (matches /uploads/<relative> URLs).
 * @param {string|null|undefined} storedPath
 */
async function deleteStoredUploadFile(storedPath) {
    const relative = normalizeRelativeUnderUploads(storedPath);
    if (!relative) return { deleted: false, missing: true };

    const roots = discoverUploadRoots();
    for (const root of roots) {
        const abs = path.resolve(root, relative);
        const rootResolved = path.resolve(root);
        if (!abs.startsWith(`${rootResolved}${path.sep}`) && abs !== rootResolved) {
            continue;
        }
        try {
            await fsp.unlink(abs);
            logger.info(`Deleted chat image file: ${abs}`);
            return { deleted: true, path: abs };
        } catch (err) {
            if (err.code === 'ENOENT') {
                continue;
            }
            logger.warn(`Could not delete chat image file ${abs}: ${err.message}`);
        }
    }
    return { deleted: false, missing: true };
}

async function deleteChatImageFilesFromDisk(filePath, thumbnailPath) {
    const main = await deleteStoredUploadFile(filePath);
    let thumb = { deleted: false, missing: true };
    const relMain = normalizeRelativeUnderUploads(filePath);
    const relThumb = normalizeRelativeUnderUploads(thumbnailPath);
    if (thumbnailPath && relThumb && relThumb !== relMain) {
        thumb = await deleteStoredUploadFile(thumbnailPath);
    }
    return { main, thumb };
}

class ChatImageMonitorService {
    /**
     * Paginated list of chat image attachments between users (from user_message_attachments).
     */
    async getChatImages(filters = {}) {
        const {
            page = 1,
            limit = 30,
            sender_id,
            receiver_id,
            message_id,
            search = ''
        } = filters;

        const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 200);

        const whereParts = [
            `ma.attachment_type = 'image'`,
            `COALESCE(ma.is_deleted, false) = false`,
            `COALESCE(m.message_type, 'text') != 'like'`
        ];
        const params = [];
        let i = 1;

        if (message_id) {
            whereParts.push(`m.id = $${i}`);
            params.push(parseInt(message_id, 10));
            i++;
        }
        if (sender_id) {
            whereParts.push(`m.sender_id = $${i}`);
            params.push(parseInt(sender_id, 10));
            i++;
        }
        if (receiver_id) {
            whereParts.push(`m.receiver_id = $${i}`);
            params.push(parseInt(receiver_id, 10));
            i++;
        }
        if (search && String(search).trim()) {
            const term = `%${String(search).trim()}%`;
            whereParts.push(`(
                u_sender.real_name ILIKE $${i}
                OR u_receiver.real_name ILIKE $${i}
                OR ma.original_filename ILIKE $${i}
                OR ma.stored_filename ILIKE $${i}
                OR CAST(m.sender_id AS TEXT) ILIKE $${i}
                OR CAST(m.receiver_id AS TEXT) ILIKE $${i}
            )`);
            params.push(term);
            i += 1;
        }

        const whereSql = whereParts.join(' AND ');

        const countSql = `
            SELECT COUNT(*)::int AS total
            FROM user_message_attachments ma
            INNER JOIN user_messages m ON m.id = ma.message_id
            LEFT JOIN users u_sender ON m.sender_id = u_sender.id
            LEFT JOIN users u_receiver ON m.receiver_id = u_receiver.id
            WHERE ${whereSql}
        `;

        const listSql = `
            SELECT
                ma.id AS attachment_id,
                ma.message_id,
                ma.original_filename,
                ma.stored_filename,
                ma.file_path,
                ma.thumbnail_path,
                ma.file_size,
                ma.width,
                ma.height,
                ma.mime_type,
                ma.uploaded_at,
                ma.uploaded_by,
                m.sender_id,
                m.receiver_id,
                m.message AS message_caption,
                m.timestamp AS message_timestamp,
                m.status AS message_status,
                m.attachment_count AS message_attachment_count,
                u_sender.real_name AS sender_username,
                u_sender.email AS sender_email,
                COALESCE(u_sender.is_suspended, false) AS sender_is_suspended,
                u_receiver.real_name AS receiver_username,
                u_receiver.email AS receiver_email
            FROM user_message_attachments ma
            INNER JOIN user_messages m ON m.id = ma.message_id
            LEFT JOIN users u_sender ON m.sender_id = u_sender.id
            LEFT JOIN users u_receiver ON m.receiver_id = u_receiver.id
            WHERE ${whereSql}
            ORDER BY COALESCE(ma.uploaded_at, m.timestamp) DESC NULLS LAST, ma.id DESC
            LIMIT $${i} OFFSET $${i + 1}
        `;

        const countResult = await query(countSql, params);
        const total = countResult.rows[0]?.total ?? 0;

        const listParams = [...params, lim, offset];
        const listResult = await query(listSql, listParams);

        const totalPages = Math.ceil(total / lim) || 1;
        const currentPage = parseInt(page, 10) || 1;

        return {
            images: listResult.rows,
            pagination: {
                total_count: total,
                current_page: currentPage,
                total_pages: totalPages,
                has_next: currentPage < totalPages,
                has_prev: currentPage > 1,
                limit: lim
            }
        };
    }

    async getSummaryStats() {
        const statsSql = `
            SELECT
                COUNT(*)::int AS total_images,
                COUNT(*) FILTER (WHERE ma.uploaded_at >= NOW() - INTERVAL '24 hours')::int AS images_24h,
                COUNT(*) FILTER (WHERE ma.uploaded_at >= NOW() - INTERVAL '7 days')::int AS images_7d
            FROM user_message_attachments ma
            INNER JOIN user_messages m ON m.id = ma.message_id
            WHERE ma.attachment_type = 'image'
              AND COALESCE(ma.is_deleted, false) = false
              AND COALESCE(m.message_type, 'text') != 'like'
        `;
        const r = await query(statsSql);
        const row = r.rows[0] || {};
        return {
            totalImages: row.total_images ?? 0,
            images24h: row.images_24h ?? 0,
            images7d: row.images_7d ?? 0
        };
    }

    /**
     * Remove a chat image: delete DB row, decrement message attachment_count, then delete files from disk.
     */
    async rejectAttachment(attachmentId) {
        const id = parseInt(attachmentId, 10);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error('Invalid attachment id');
        }

        const client = await pool.connect();
        let filePath;
        let thumbnailPath;
        let messageId;

        try {
            await client.query('BEGIN');

            const sel = await client.query(
                `SELECT ma.id, ma.message_id, ma.file_path, ma.thumbnail_path, COALESCE(ma.is_deleted, false) AS is_deleted
                 FROM user_message_attachments ma
                 INNER JOIN user_messages m ON m.id = ma.message_id
                 WHERE ma.id = $1 AND ma.attachment_type = 'image'
                 FOR UPDATE OF ma`,
                [id]
            );

            if (sel.rows.length === 0) {
                throw new Error('Attachment not found');
            }

            const row = sel.rows[0];
            if (row.is_deleted) {
                throw new Error('Attachment already removed');
            }

            filePath = row.file_path;
            thumbnailPath = row.thumbnail_path;
            messageId = row.message_id;

            await client.query('DELETE FROM user_message_attachments WHERE id = $1', [id]);
            await client.query(
                `UPDATE user_messages
                 SET attachment_count = GREATEST(0, COALESCE(attachment_count, 0) - 1)
                 WHERE id = $1`,
                [messageId]
            );

            await client.query('COMMIT');
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackErr) {
                logger.error('rollback after rejectAttachment:', rollbackErr);
            }
            throw error;
        } finally {
            client.release();
        }

        const fileResult = await deleteChatImageFilesFromDisk(filePath, thumbnailPath);

        return {
            success: true,
            attachment_id: id,
            message_id: messageId,
            files: fileResult
        };
    }
}

module.exports = new ChatImageMonitorService();

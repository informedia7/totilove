const os = require('os');
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const { resolveUploadsRoot, ensureDirSync } = require('../../../utils/uploads');

function getProvidedSecret(req) {
    const fromQuery = typeof req.query?.secret === 'string' ? req.query.secret : '';
    const fromHeader = typeof req.headers?.['x-export-secret'] === 'string' ? req.headers['x-export-secret'] : '';
    return (fromQuery || fromHeader || '').trim();
}

function requireExportSecret(req, res, next) {
    const expected = typeof process.env.EXPORT_SECRET === 'string' ? process.env.EXPORT_SECRET.trim() : '';
    if (!expected) {
        return res.status(503).json({ success: false, error: 'EXPORT_SECRET is not configured' });
    }
    const provided = getProvidedSecret(req);
    if (!provided || provided !== expected) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    return next();
}

function setupUploadsImportRoutes(app) {
    const router = express.Router();

    const uploadsTmpDir = path.join(os.tmpdir(), 'totilove-uploads-import');
    ensureDirSync(uploadsTmpDir);

    const zipUpload = multer({
        dest: uploadsTmpDir,
        limits: {
            fileSize: 1024 * 1024 * 1024, // 1GB
            files: 1
        },
        fileFilter: (_req, file, cb) => {
            const name = String(file?.originalname || '').toLowerCase();
            if (name.endsWith('.zip') || file?.mimetype === 'application/zip' || file?.mimetype === 'application/x-zip-compressed') {
                return cb(null, true);
            }
            return cb(new Error('Only .zip files are allowed'));
        }
    });

    /**
     * Import uploads ZIP into UPLOADS_PATH.
     * Accepts a ZIP with either:
     * - `uploads/<...>` (preferred; produced by our export)
     * - `<subfolder>/<...>` directly (e.g. `profile_images/foo.jpg`)
     */
    router.post(
        '/uploads-import',
        requireExportSecret,
        zipUpload.single('zip'),
        async (req, res) => {
            const file = req.file;
            if (!file?.path) {
                return res.status(400).json({ success: false, error: 'zip file is required (field name: zip)' });
            }

            const overwrite = String(req.body?.overwrite || 'true').toLowerCase() !== 'false';
            const uploadsRoot = resolveUploadsRoot();
            ensureDirSync(uploadsRoot);

            let extractedFiles = 0;
            let skippedFiles = 0;

            try {
                const opened = await unzipper.Open.file(file.path);
                const entries = opened.files || [];

                for (const entry of entries) {
                    if (!entry || entry.type !== 'File') {
                        continue;
                    }

                    const rawPath = String(entry.path || '').replace(/\\/g, '/');
                    if (!rawPath || rawPath.includes('..')) {
                        skippedFiles++;
                        continue;
                    }

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
                            // doesn't exist, proceed
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

                return res.json({
                    success: true,
                    data: {
                        uploadsRoot,
                        extractedFiles,
                        skippedFiles,
                        totalEntries: entries.length
                    }
                });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message || 'Failed to import uploads ZIP' });
            } finally {
                try {
                    await fs.promises.unlink(file.path);
                } catch {
                    // ignore
                }
            }
        }
    );

    app.use(router);
}

module.exports = { setupUploadsImportRoutes };


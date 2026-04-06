const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

const fsPromises = fs.promises;
const PAGE_ANALYSIS_REPORT_PATH = path.join(__dirname, '..', 'data', 'page-analysis-report.json');

const buildUploadCandidates = () => {
    return [
        process.env.UPLOADS_PATH,
        path.join(__dirname, '..', 'uploads'),
        path.join(__dirname, '..', '..', 'uploads'),
        path.join(__dirname, '..', 'app', 'uploads'),
        path.join(__dirname, '..', 'app', 'uploads', 'profile_images'),
        path.join(process.cwd(), 'uploads'),
        path.join(process.cwd(), '..', 'uploads'),
        path.join(process.cwd(), '..', 'app', 'uploads'),
        path.join(process.cwd(), '..', 'app', 'uploads', 'profile_images')
    ]
        .filter(Boolean)
        .map(candidate => path.resolve(candidate));
};

const locateUploadsDirectories = () => {
    const searchedPaths = buildUploadCandidates();
    let uploadsPath = null;
    let profileImagesPath = null;

    for (const candidate of searchedPaths) {
        try {
            if (path.basename(candidate) === 'profile_images' && fs.existsSync(candidate)) {
                uploadsPath = path.dirname(candidate);
                profileImagesPath = candidate;
                break;
            }

            const profileCandidate = path.join(candidate, 'profile_images');
            if (fs.existsSync(profileCandidate)) {
                uploadsPath = candidate;
                profileImagesPath = profileCandidate;
                break;
            }

            if (fs.existsSync(candidate)) {
                uploadsPath = candidate;
                break;
            }
        } catch (error) {
            logger.warn('Presence diagnostics uploads path check failed', {
                path: candidate,
                error: error.message
            });
        }
    }

    return {
        uploadsPath,
        profileImagesPath,
        searchedPaths
    };
};

const testDefinitions = [
    {
        id: 'database-connectivity',
        label: 'Database connectivity',
        description: 'Issues a lightweight SQL query to confirm PostgreSQL is reachable.',
        run: async () => {
            const result = await query('SELECT NOW() AS current_time');
            return {
                timestamp: result.rows[0].current_time
            };
        }
    },
    {
        id: 'redis-status',
        label: 'Redis status',
        description: 'Validates whether Redis (if enabled) responds to ping commands.',
        run: async () => {
            if (!redis.enabled) {
                return {
                    enabled: false,
                    message: 'Redis disabled via configuration.'
                };
            }

            if (!redis.client) {
                throw new Error('Redis is enabled but the client is not initialized.');
            }

            const start = Date.now();
            const response = await redis.client.ping();
            return {
                enabled: true,
                response,
                latencyMs: Date.now() - start
            };
        }
    },
    {
        id: 'uploads-visibility',
        label: 'Uploads visibility',
        description: 'Ensures the admin server can see the uploads/profile_images directories.',
        run: async () => {
            const { uploadsPath, profileImagesPath, searchedPaths } = locateUploadsDirectories();
            if (!uploadsPath) {
                const error = new Error('Uploads directory not found in expected locations.');
                error.meta = { searchedPaths };
                throw error;
            }

            const response = {
                uploadsPath,
                profileImagesPath: profileImagesPath || null
            };

            await fsPromises.access(uploadsPath, fs.constants.R_OK);
            if (profileImagesPath) {
                await fsPromises.access(profileImagesPath, fs.constants.R_OK);
            }

            return response;
        }
    },
    {
        id: 'presence-assets-signature',
        label: 'Presence assets signatures',
        description: 'Scans page-analysis-report.json for known presence asset references.',
        run: async () => {
            await fsPromises.access(PAGE_ANALYSIS_REPORT_PATH, fs.constants.R_OK);
            const fileBuffer = await fsPromises.readFile(PAGE_ANALYSIS_REPORT_PATH, 'utf8');
            const indicators = [
                'presence-engine.js',
                'presence-refresh.js'
            ];
            const missing = indicators.filter(token => !fileBuffer.includes(token));

            if (missing.length) {
                throw new Error(`Missing presence indicators: ${missing.join(', ')}`);
            }

            return {
                file: PAGE_ANALYSIS_REPORT_PATH,
                indicators,
                fileSizeBytes: Buffer.byteLength(fileBuffer, 'utf8')
            };
        }
    }
];

const runPresenceDiagnostics = async () => {
    const results = [];

    for (const definition of testDefinitions) {
        const startedAt = Date.now();
        try {
            const details = await definition.run();
            results.push({
                id: definition.id,
                label: definition.label,
                description: definition.description,
                status: 'pass',
                durationMs: Date.now() - startedAt,
                details
            });
        } catch (error) {
            logger.warn(`Presence diagnostics failed: ${definition.id}`, {
                error: error.message
            });
            results.push({
                id: definition.id,
                label: definition.label,
                description: definition.description,
                status: 'fail',
                durationMs: Date.now() - startedAt,
                error: error.message,
                details: error.meta || null
            });
        }
    }

    const summary = {
        total: results.length,
        passed: results.filter(test => test.status === 'pass').length,
        failed: results.filter(test => test.status === 'fail').length,
        usersTested: null,
        usersPassing: null
    };

    return { summary, tests: results };
};

module.exports = {
    runPresenceDiagnostics
};

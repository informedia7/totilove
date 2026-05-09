const path = require('path');
const fs = require('fs');

function resolveUploadsRoot() {
    const fromEnv = typeof process.env.UPLOADS_PATH === 'string' ? process.env.UPLOADS_PATH.trim() : '';
    if (fromEnv) {
        return path.resolve(fromEnv);
    }

    // Default next to repo `app/uploads`. Resolved from this module — NOT process.cwd() — so profile/chat
    // uploads match express.static `/uploads` even when cwd differs (Railway, PM2, nested scripts).
    return path.resolve(__dirname, '..', 'app', 'uploads');
}

function resolveUploadsDir(...segments) {
    return path.join(resolveUploadsRoot(), ...segments.filter(Boolean));
}

function ensureDirSync(dirPath) {
    if (!dirPath) {
        return;
    }
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

module.exports = {
    resolveUploadsRoot,
    resolveUploadsDir,
    ensureDirSync
};


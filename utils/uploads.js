const path = require('path');
const fs = require('fs');

function resolveUploadsRoot() {
    const fromEnv = typeof process.env.UPLOADS_PATH === 'string' ? process.env.UPLOADS_PATH.trim() : '';
    if (fromEnv) {
        return path.resolve(fromEnv);
    }

    // Default for local dev. In Railway with a repo at /app and a volume mounted at /app/app/uploads,
    // setting UPLOADS_PATH=/app/app/uploads will override this.
    return path.resolve(process.cwd(), 'app', 'uploads');
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


const path = require('path');
const fs = require('fs');

function resolveUploadsRoot() {
    const fromEnv = typeof process.env.UPLOADS_PATH === 'string' ? process.env.UPLOADS_PATH.trim() : '';
    if (fromEnv) {
        return path.resolve(fromEnv);
    }

    // Production without UPLOADS_PATH should not happen — startup asserts REQUIRE UPLOADS_PATH unless opted out.
    // Fallback matches typical Railway volume Mount Path when ALLOW_EPHEMERAL_UPLOADS_IN_PRODUCTION=true.
    if (process.env.NODE_ENV === 'production') {
        const fallback = (process.env.DEFAULT_UPLOADS_PATH || '/app/app/uploads').trim();
        return path.resolve(fallback);
    }

    // Dev: stable path relative to this module (not process.cwd()).
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


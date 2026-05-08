/**
 * Lightweight structured logging. Set LOG_FORMAT=json for one JSON object per line.
 */

function useJson() {
    return process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';
}

function line(level, message, meta = {}) {
    const ts = new Date().toISOString();
    if (useJson()) {
        const payload = { ts, level, msg: message };
        if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) {
            Object.assign(payload, meta);
        }
        return JSON.stringify(payload);
    }
    const suffix =
        meta && typeof meta === 'object' && Object.keys(meta).length > 0
            ? ` ${JSON.stringify(meta)}`
            : '';
    return `[${ts}] ${level.toUpperCase()} ${message}${suffix}`;
}

const logger = {
    info(message, meta) {
        console.log(line('info', message, meta));
    },
    warn(message, meta) {
        console.warn(line('warn', message, meta));
    },
    error(message, meta) {
        console.error(line('error', message, meta));
    }
};

module.exports = logger;

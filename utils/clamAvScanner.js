/**
 * Shared async ClamAV (node-clamscan) init — use isInfected(path), never scanFile().
 */

function isClamAvExplicitlyDisabled() {
    return String(process.env.CLAMAV_DISABLED || '').toLowerCase() === 'true';
}

function isClamAvRequired() {
    return String(process.env.CLAMAV_REQUIRED || '').toLowerCase() === 'true';
}

let clamscanInitPromise = null;

async function getClamScanner() {
    if (isClamAvExplicitlyDisabled()) {
        return null;
    }
    if (!clamscanInitPromise) {
        clamscanInitPromise = (async () => {
            try {
                const NodeClam = require('clamscan');
                const rawSocket = (process.env.CLAMD_SOCKET || '').trim();
                const rawHost = (process.env.CLAMD_HOST || '').trim();
                const socket = rawSocket || false;
                const host = rawHost || false;
                const port = host
                    ? Number(String(process.env.CLAMD_PORT || '3310').trim()) || 3310
                    : (process.env.CLAMD_PORT || '').trim()
                        ? Number(String(process.env.CLAMD_PORT).trim())
                        : false;

                const useRemote = !!(socket || host);
                const preference =
                    process.env.CLAMAV_PREFERENCE || (useRemote ? 'clamdscan' : 'clamscan');

                const scanner = await new NodeClam().init({
                    debugMode: process.env.CLAMAV_DEBUG === 'true',
                    preference,
                    clamdscan: {
                        socket,
                        host,
                        port,
                        timeout: process.env.CLAMD_TIMEOUT_MS ? Number(process.env.CLAMD_TIMEOUT_MS) : 60000,
                        active: process.env.CLAMD_DISABLE !== 'true',
                        path: process.env.CLAMDSCAN_PATH || '/usr/bin/clamdscan',
                        localFallback: process.env.CLAMD_LOCAL_FALLBACK !== 'false',
                        bypassTest: process.env.CLAMD_BYPASS_PING === 'true'
                    },
                    clamscan: {
                        path: process.env.CLAMSCAN_PATH || '/usr/bin/clamscan',
                        active: process.env.CLAMSCAN_DISABLE !== 'true'
                    }
                });
                console.log('[ClamAV] Scanner initialized');
                return scanner;
            } catch (e) {
                const msg = e && e.message ? e.message : String(e);
                console.warn('[ClamAV] Init failed:', msg);
                return null;
            }
        })();
    }
    return clamscanInitPromise;
}

module.exports = {
    getClamScanner,
    isClamAvExplicitlyDisabled,
    isClamAvRequired
};

const boolFromEnv = (value) => String(value || '').toLowerCase() === 'true';

const scannerConfigured = boolFromEnv(process.env.ENABLE_VIRUS_SCANNER);
let ClamScanModule = null;
let scannerInstance = null;
let initPromise = null;
let dependencyWarningLogged = false;

function parseInteger(value, fallback) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildScannerOptions() {
    return {
        removeInfected: false,
        scanLog: process.env.CLAMAV_SCAN_LOG || null,
        clamscan: {
            path: process.env.CLAMSCAN_PATH || undefined,
            db: process.env.CLAMAV_DB_PATH || undefined,
            scanArchives: boolFromEnv(process.env.CLAMSCAN_SCAN_ARCHIVES ?? 'true')
        },
        clamdscan: {
            active: boolFromEnv(process.env.CLAMD_ACTIVE),
            host: process.env.CLAMD_HOST || undefined,
            port: parseInteger(process.env.CLAMD_PORT, undefined),
            socket: process.env.CLAMD_SOCKET || undefined,
            timeout: parseInteger(process.env.CLAMD_TIMEOUT, 120000)
        }
    };
}

async function loadScannerModule() {
    if (ClamScanModule) {
        return ClamScanModule;
    }

    try {
        ClamScanModule = require('clamscan');
        return ClamScanModule;
    } catch (error) {
        if (!dependencyWarningLogged) {
            console.warn('[VirusScanner] clamscan module not available. Install with: npm install clamscan');
            dependencyWarningLogged = true;
        }
        return null;
    }
}

async function getVirusScanner() {
    if (!scannerConfigured) {
        return null;
    }

    if (scannerInstance) {
        return scannerInstance;
    }

    if (!initPromise) {
        initPromise = (async () => {
            const ClamScan = await loadScannerModule();
            if (!ClamScan) {
                return null;
            }

            try {
                const scanner = await new ClamScan(buildScannerOptions()).init();
                console.log('[VirusScanner] ClamAV initialized');
                return scanner;
            } catch (error) {
                console.error('[VirusScanner] Failed to initialize ClamAV:', error.message);
                return null;
            }
        })();
    }

    const scanner = await initPromise;
    if (!scanner) {
        initPromise = null;
        return null;
    }

    scannerInstance = scanner;
    return scannerInstance;
}

async function scanFileWithClamAV(filePath) {
    const scanner = await getVirusScanner();
    if (!scanner) {
        return null;
    }
    return scanner.scanFile(filePath);
}

function isScannerConfigured() {
    return scannerConfigured;
}

module.exports = {
    isScannerConfigured,
    getVirusScanner,
    scanFileWithClamAV
};

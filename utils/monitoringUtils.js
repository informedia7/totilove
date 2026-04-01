const { performance } = require('perf_hooks');

function clampNumber(value, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return min;
    }
    return Math.min(Math.max(parsed, min), max);
}

function clampInt(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(Math.round(value), min), max);
}

class MonitoringUtils {
    constructor() {
        this.connectionCount = 0;
        this.maxConcurrentUsers = 0;
        this.messageCount = 0;
        this.performanceMetrics = {
            messageLatency: [],
            connectionLatency: [],
            memoryUsage: [],
            cpuUsage: []
        };
        
        // Adaptive rate limiting for high load
        this.rateLimitMap = new Map();
        this.isHighLoad = false;
        this.loadThreshold = 8000; // Switch to high-load mode at 8K users
        this.presenceMonitoringEnabled = false;
        this.presenceMetrics = {
            streamRequests: 0,
            streamUnavailable: 0,
            streamErrors: 0,
            activeStreams: 0,
            totalStreams: 0,
            lastFilterSize: 0,
            heartbeat: {
                total: 0,
                failures: 0,
                rateLimited: 0,
                avgLatencyMs: 0,
                lastLatencyMs: 0
            }
        };
        this.clientPresenceMetrics = {
            refreshSamples: [],
            totals: {
                successes: 0,
                failures: 0
            },
            lastSampleTs: null,
            meta: null
        };
    }

    startMonitoring() {
        // Monitor every 10 seconds
        setInterval(() => {
            this.monitorLoad();
        }, 10000);
        
        // Memory cleanup every 30 seconds under high load
        this.cleanupInterval = setInterval(() => {
            this.cleanupMemory();
        }, 30010);
        
        // Performance metrics collection
        setInterval(() => {
            this.collectMetrics();
        }, 5000);
    }

    monitorLoad() {
        const connections = this.connectionCount;
        const memUsage = process.memoryUsage();
        
        // Adaptive load threshold based on memory and connections
        const wasHighLoad = this.isHighLoad;
        this.isHighLoad = connections > this.loadThreshold || memUsage.heapUsed > 512 * 1024 * 1024; // 512MB
        
        if (this.isHighLoad !== wasHighLoad) {
            this.adaptToLoad();
        }
        
        // Update max concurrent users
        if (connections > this.maxConcurrentUsers) {
            this.maxConcurrentUsers = connections;
        }
        
        // Memory warning
        if (memUsage.heapUsed > 768 * 1024 * 1024) { // 768MB
            console.warn(`High memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        }
    }

    adaptToLoad() {
        if (this.isHighLoad) {
            // Switch to high-load optimizations
            // Reduce WebSocket ping frequency
            if (global.io) {
                global.io.engine.pingInterval = 15000;
                global.io.engine.pingTimeout = 20000;
            }
            
            // Increase rate limiting
            this.highLoadRateLimit = true;
            
        } else {
            // Return to normal performance mode
            // Restore normal ping frequency
            if (global.io) {
                global.io.engine.pingInterval = 12000;
                global.io.engine.pingTimeout = 30010;
            }
            
            // Normal rate limiting
            this.highLoadRateLimit = false;
        }
    }

    cleanupMemory() {
        // Clean up rate limit map
        const now = Date.now();
        for (const [key, limit] of this.rateLimitMap.entries()) {
            if (now > limit.resetTime + 300100) { // 5 minutes old
                this.rateLimitMap.delete(key);
            }
        }
        
        // Clean up performance metrics (keep last 100 entries)
        Object.keys(this.performanceMetrics).forEach(key => {
            if (this.performanceMetrics[key].length > 100) {
                this.performanceMetrics[key] = this.performanceMetrics[key].slice(-100);
            }
        });
        
        // Force garbage collection if under high load and available
        if (this.isHighLoad && global.gc) {
            global.gc();
        }
    }

    collectMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        this.performanceMetrics.memoryUsage.push({
            timestamp: Date.now(),
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external
        });
        
        this.performanceMetrics.cpuUsage.push({
            timestamp: Date.now(),
            user: cpuUsage.user,
            system: cpuUsage.system
        });
    }

    trackConnection(socketId) {
        this.connectionCount++;
        const connectionLatency = performance.now();
        this.performanceMetrics.connectionLatency.push({
            timestamp: Date.now(),
            latency: connectionLatency
        });
    }

    trackDisconnection() {
        this.connectionCount--;
    }

    trackMessage() {
        this.messageCount++;
    }

    setPresenceMonitoringEnabled(enabled) {
        this.presenceMonitoringEnabled = Boolean(enabled);
    }

    trackPresenceStreamRequest({ streamingAvailable = true, filterSize = 0 } = {}) {
        if (!this.presenceMonitoringEnabled) {
            return;
        }
        this.presenceMetrics.streamRequests++;
        if (!streamingAvailable) {
            this.presenceMetrics.streamUnavailable++;
        }
        this.presenceMetrics.lastFilterSize = filterSize;
    }

    trackPresenceStreamConnection() {
        if (!this.presenceMonitoringEnabled) {
            return;
        }
        this.presenceMetrics.activeStreams++;
        this.presenceMetrics.totalStreams++;
    }

    trackPresenceStreamDisconnection() {
        if (!this.presenceMonitoringEnabled) {
            return;
        }
        if (this.presenceMetrics.activeStreams > 0) {
            this.presenceMetrics.activeStreams--;
        }
    }

    trackPresenceStreamError() {
        if (!this.presenceMonitoringEnabled) {
            return;
        }
        this.presenceMetrics.streamErrors++;
    }

    trackPresenceHeartbeat({ success = true, rateLimited = false, latencyMs = null } = {}) {
        if (!this.presenceMonitoringEnabled) {
            return;
        }
        const heartbeat = this.presenceMetrics.heartbeat;
        heartbeat.total++;
        if (!success) {
            heartbeat.failures++;
        }
        if (rateLimited) {
            heartbeat.rateLimited++;
        }
        if (Number.isFinite(latencyMs)) {
            heartbeat.lastLatencyMs = latencyMs;
            if (heartbeat.avgLatencyMs === 0) {
                heartbeat.avgLatencyMs = latencyMs;
            } else {
                const smoothing = 0.2;
                heartbeat.avgLatencyMs = (heartbeat.avgLatencyMs * (1 - smoothing)) + (latencyMs * smoothing);
            }
        }
    }

    recordClientPresenceSamples(samples = [], metadata = {}, context = {}) {
        if (!Array.isArray(samples) || samples.length === 0) {
            return;
        }
        const normalized = samples.slice(0, 50).map(sample => {
            const sanitized = sample || {};
            return {
                ts: clampNumber(sanitized.ts || Date.now(), 0, Date.now()),
                durationMs: clampNumber(sanitized.durationMs || 0, 0, 120000),
                batchSize: clampInt(sanitized.batchSize || 0, 0, 1000),
                trackedCount: clampInt(sanitized.trackedCount || 0, 0, 5000),
                waitingCount: clampInt(sanitized.waitingCount || 0, 0, 5000),
                hiddenQueue: clampInt(sanitized.hiddenQueue || 0, 0, 5000),
                visibleUsers: clampInt(sanitized.visibleUsers || 0, 0, 5000),
                cacheSize: clampInt(sanitized.cacheSize || 0, 0, 10000),
                success: sanitized.success !== false,
                pageHidden: Boolean(sanitized.pageHidden),
                transport: typeof sanitized.transport === 'string'
                    ? sanitized.transport.slice(0, 16)
                    : 'unknown',
                httpStatus: Number.isInteger(sanitized.httpStatus)
                    ? clampInt(sanitized.httpStatus, 0, 999)
                    : null,
                source: typeof sanitized.source === 'string'
                    ? sanitized.source.slice(0, 12)
                    : null,
                errorCode: typeof sanitized.errorCode === 'string'
                    ? sanitized.errorCode.slice(0, 80)
                    : null
            };
        });

        normalized.forEach(sample => {
            if (sample.success) {
                this.clientPresenceMetrics.totals.successes += 1;
            } else {
                this.clientPresenceMetrics.totals.failures += 1;
            }
        });

        this.clientPresenceMetrics.refreshSamples.push(...normalized);
        if (this.clientPresenceMetrics.refreshSamples.length > 200) {
            this.clientPresenceMetrics.refreshSamples = this.clientPresenceMetrics.refreshSamples.slice(-200);
        }
        this.clientPresenceMetrics.lastSampleTs = Date.now();
        this.clientPresenceMetrics.meta = {
            clientId: typeof metadata.clientId === 'string' ? metadata.clientId.slice(0, 64) : null,
            version: typeof metadata.version === 'string' ? metadata.version.slice(0, 32) : null,
            pathname: typeof metadata.pathname === 'string' ? metadata.pathname.slice(0, 180) : null,
            userAgent: typeof metadata.userAgent === 'string' ? metadata.userAgent.slice(0, 160) : null,
            sourceIp: context?.ip || null
        };
    }

    getMetrics() {
        const memUsage = process.memoryUsage();
        return {
            performance: this.performanceMetrics,
            currentLoad: {
                connections: this.connectionCount,
                isHighLoad: this.isHighLoad,
                loadThreshold: this.loadThreshold,
                memoryUsage: memUsage,
                cpuUsage: process.cpuUsage()
            },
            status: 'healthy',
            load: this.isHighLoad ? 'high' : 'normal',
            maxConcurrent: this.maxConcurrentUsers,
            messageCount: this.messageCount,
            memory: {
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
            },
            presence: this.presenceMonitoringEnabled ? {
                ...this.presenceMetrics
            } : null,
            clientPresence: this.clientPresenceMetrics,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };
    }

    cleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

module.exports = MonitoringUtils; 
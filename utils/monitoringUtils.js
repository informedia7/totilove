const { performance } = require('perf_hooks');

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
    }

    startMonitoring() {
        // Monitor every 10 seconds
        setInterval(() => {
            this.monitorLoad();
        }, 10000);
        
        // Memory cleanup every 30 seconds under high load
        this.cleanupInterval = setInterval(() => {
            this.cleanupMemory();
        }, 30000);
        
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
                global.io.engine.pingTimeout = 30000;
            }
            
            // Normal rate limiting
            this.highLoadRateLimit = false;
        }
    }

    cleanupMemory() {
        // Clean up rate limit map
        const now = Date.now();
        for (const [key, limit] of this.rateLimitMap.entries()) {
            if (now > limit.resetTime + 300000) { // 5 minutes old
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
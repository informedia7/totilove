// Lightning-Fast Server - Modular Architecture
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cluster = require('cluster');
const os = require('os');

// Config modules
const { setupDatabase } = require('./server/config/database');
const { setupRedis } = require('./server/config/redis');
const { configureExpress } = require('./server/config/express');
const { setupServices } = require('./server/config/services');
const { setupControllers } = require('./server/config/controllers');
const { setupWebSocket } = require('./server/config/websocket');

// Routes
const { setupRoutes } = require('./server/routes');

// Utilities
const MonitoringUtils = require('./utils/monitoringUtils');
const AuthMiddleware = require('./middleware/auth');


class Server {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            // High performance WebSocket settings
            pingTimeout: 30000,
            pingInterval: 12000,
            maxHttpBufferSize: 1e6,
            transports: ['websocket', 'polling'],
            perMessageDeflate: {
                zlibDeflateOptions: {
                    level: 1,
                    windowBits: 13,
                },
                threshold: 1024,
                concurrencyLimit: 20,
            },
            allowEIO3: true
        });

        // Initialize state
        this.db = null;
        this.redis = null;
        this.csrfMiddleware = null;
        this.sessions = new Map();
        this.authMiddleware = new AuthMiddleware(this.sessions);
        this.monitoringUtils = new MonitoringUtils();
        
        // Services and controllers (initialized in init)
        this.messageService = null;
        this.sessionService = null;
        this.activityTracker = null;
        this.sessionTracker = null;
        this.controllers = {};
        this.websocketHandler = null;
        this.blockRateLimiter = null;
        
        this.init();
    }

    async init() {
        // 1. Setup database
        this.db = await setupDatabase();
        
        // 2. Setup Redis and CSRF middleware
        const { redis, csrfMiddleware } = await setupRedis();
        this.redis = redis;
        this.csrfMiddleware = csrfMiddleware;
        
        // 3. Setup services
        const services = setupServices(this.db, this.redis);
        this.messageService = services.messageService;
        this.sessionService = services.sessionService;
        this.activityTracker = services.activityTracker;
        this.sessionTracker = services.sessionTracker;
        this.blockRateLimiter = services.blockRateLimiter;
        
        // 4. Configure Express
        configureExpress(this.app, this.sessionTracker);
        
        // 5. Setup controllers
        this.controllers = setupControllers(
            this.db,
            this.redis,
            this.authMiddleware,
            this.sessionTracker,
            this.messageService,
            this.io
        );
        
        // 6. Setup routes
        setupRoutes(this.app, {
            csrfMiddleware: this.csrfMiddleware,
            activityTracker: this.activityTracker,
            authMiddleware: this.authMiddleware,
            controllers: this.controllers,
            db: this.db,
            redis: this.redis,
            io: this.io,
            monitoringUtils: this.monitoringUtils,
            blockRateLimiter: this.blockRateLimiter
        });
        
        // 7. Setup WebSocket
        this.websocketHandler = setupWebSocket(
            this.io,
            this.messageService,
            this.monitoringUtils,
            this.db
        );
        
        // 8. Start monitoring
        this.monitoringUtils.startMonitoring();
    }

    start() {
        const PORT = process.env.PORT || 3000;
        
        this.server.listen(PORT, () => {
            // Server started successfully
        });

        // Graceful shutdown handling
        process.on('SIGTERM', this.gracefulShutdown.bind(this));
        process.on('SIGINT', this.gracefulShutdown.bind(this));
    }

    gracefulShutdown() {
        // Stop accepting new connections
        this.server.close(() => {
            // Close database connections
            if (this.db) {
                this.db.end();
            }
            
            // Close Redis connection
            if (this.redis) {
                this.redis.quit();
            }
            
            // Cleanup monitoring
            this.monitoringUtils.cleanup();
            
            process.exit(0);
        });
        
        // Force shutdown after 30 seconds
        setTimeout(() => {
            process.exit(1);
        }, 30000);
    }
}

// Cluster support for production
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
    const numCPUs = os.cpus().length;
    const numWorkers = Math.min(numCPUs, 4);
    
    // Fork workers
    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }
    
    // Handle worker exits
    cluster.on('exit', (worker, code, signal) => {
        cluster.fork();
    });
    
} else {
    // Start single server instance
    const server = new Server();
    server.start();
} 
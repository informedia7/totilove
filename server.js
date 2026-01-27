// Lightning-Fast Server - Modular Architecture
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cluster = require('cluster');
const os = require('os');
const { createClient: createRedisClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

// Config modules
const appConfig = require('./config/config');
const { setupDatabase } = require('./server/config/database');
const { setupRedis } = require('./server/config/redis');
const { configureExpress } = require('./server/config/express');
const { setupServices } = require('./server/config/services');
const { setupControllers } = require('./server/config/controllers');
const { setupWebSocket } = require('./server/config/websocket');
const featureFlags = require('./config/featureFlags');

// Routes
const { setupRoutes } = require('./server/routes');

// Utilities
const MonitoringUtils = require('./utils/monitoringUtils');
const AuthMiddleware = require('./middleware/auth');

function createNoopSocket() {
    const noop = () => {};
    const room = {};
    room.emit = noop;
    room.to = () => room;
    room.in = () => room;
    return {
        emit: noop,
        on: noop,
        use: noop,
        to: () => room,
        in: () => room,
        of: () => room,
        sockets: new Map(),
        engine: { on: noop }
    };
}


class Server {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        const presenceFlags = typeof featureFlags.getPresenceFlags === 'function'
            ? featureFlags.getPresenceFlags()
            : { monitoringEnabled: false, socketEnabled: true };
        this.presenceFlags = presenceFlags;
        this.socketsEnabled = presenceFlags.socketEnabled !== false;
        this.io = this.socketsEnabled ? socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            // High performance WebSocket settings
            pingTimeout: 30010,
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
        }) : createNoopSocket();
        if (!this.socketsEnabled) {
            console.info('ℹ️ Socket transport disabled via feature flag; running HTTP/SSE only');
        }

        // Initialize state
        this.db = null;
        this.redis = null;
        this.csrfMiddleware = null;
        this.sessions = new Map();
        this.authMiddleware = new AuthMiddleware(this.sessions);
        this.monitoringUtils = new MonitoringUtils();
        if (typeof this.monitoringUtils.setPresenceMonitoringEnabled === 'function') {
            this.monitoringUtils.setPresenceMonitoringEnabled(this.presenceFlags.monitoringEnabled);
        }
        
        // Services and controllers (initialized in init)
        this.messageService = null;
        this.sessionService = null;
        this.controllers = {};
        this.websocketHandler = null;
        this.blockRateLimiter = null;
        this.presenceService = null;
        this.socketAdapterClients = null;
        this.socketAdapterEnabled = false;
        this.isShuttingDown = false;
        
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
        this.blockRateLimiter = services.blockRateLimiter;
        this.presenceService = services.presenceService;
        this.stateService = services.stateService;
        
        // 4. Configure Express
        configureExpress(this.app);
        
        // 5. Setup controllers
        this.controllers = setupControllers(
            this.db,
            this.redis,
            this.authMiddleware,
            null,
            this.messageService,
            this.io,
            this.presenceService
        );
        
        // 6. Setup routes
        setupRoutes(this.app, {
            csrfMiddleware: this.csrfMiddleware,
            authMiddleware: this.authMiddleware,
            controllers: this.controllers,
            db: this.db,
            redis: this.redis,
            io: this.io,
            monitoringUtils: this.monitoringUtils,
            blockRateLimiter: this.blockRateLimiter,
            presenceService: this.presenceService,
            stateService: this.stateService
        });
        
        if (this.socketsEnabled && this.io) {
            // Configure Socket.IO adapter for multi-node fanout
            await this.configureSocketAdapter();

            // 7. Setup WebSocket
            this.websocketHandler = setupWebSocket(
                this.io,
                this.messageService,
                this.monitoringUtils,
                this.db,
                this.presenceService,
                this.socketAdapterEnabled
            );
        } else {
            console.info('ℹ️ WebSocket handler skipped (socket transport disabled)');
        }
        
        // 8. Start monitoring
        this.monitoringUtils.startMonitoring();
    }

    async configureSocketAdapter() {
        if (!this.io || !this.socketsEnabled || this.socketAdapterClients || process.env.DISABLE_SOCKET_ADAPTER === 'true') {
            return;
        }

        try {
            const pubClient = createRedisClient(appConfig.redis);
            const subClient = pubClient.duplicate();
            await Promise.all([pubClient.connect(), subClient.connect()]);
            this.io.adapter(createAdapter(pubClient, subClient));
            this.socketAdapterClients = { pubClient, subClient };
            this.socketAdapterEnabled = true;
            console.log('✅ Socket.IO Redis adapter configured');
        } catch (error) {
            console.warn('⚠️ Socket.IO Redis adapter unavailable:', error.message);
        }
    }

    start() {
        const PORT = process.env.PORT || 3001;
        
        this.server.listen(PORT, () => {
            // Server started successfully
        });

        // Graceful shutdown handling
        process.on('SIGTERM', this.gracefulShutdown.bind(this));
        process.on('SIGINT', this.gracefulShutdown.bind(this));
    }

    gracefulShutdown() {
        if (this.isShuttingDown) {
            return;
        }
        this.isShuttingDown = true;
        
        // Stop accepting new connections
        this.server.close(() => {
            (async () => {
                try {
                    if (this.db?.end) {
                        await this.db.end();
                    }

                    if (this.redis?.quit) {
                        await this.redis.quit();
                    }

                    if (this.presenceService?.shutdown) {
                        await this.presenceService.shutdown();
                    } else if (this.presenceService?.stopCleanup) {
                        this.presenceService.stopCleanup();
                    }

                    if (this.socketAdapterClients) {
                        const { pubClient, subClient } = this.socketAdapterClients;
                        const quitTasks = [];
                        if (pubClient?.quit) {
                            quitTasks.push(pubClient.quit());
                        }
                        if (subClient?.quit) {
                            quitTasks.push(subClient.quit());
                        }
                        if (quitTasks.length > 0) {
                            await Promise.allSettled(quitTasks);
                        }
                    }
                } catch (error) {
                    console.error('⚠️ Graceful shutdown error:', error.message);
                } finally {
                    this.monitoringUtils.cleanup();
                    process.exit(0);
                }
            })();
        });
        
        // Force shutdown after 30 seconds
        setTimeout(() => {
            process.exit(1);
        }, 30010);
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
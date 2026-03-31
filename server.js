// Lightning-Fast Server - Modular Architecture
const express = require('express');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
const cluster = require('cluster');
const os = require('os');
const path = require('path');
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
        this.bootState = 'starting';
        this.bootError = null;
        this.initCompletedAt = null;
        configureExpress(this.app);
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

        this.registerBootstrapRoutes();
        
        this.init().catch((error) => {
            this.bootState = 'error';
            this.bootError = error;
            console.error('❌ Server initialization failed:', error.message);
        });
    }

    registerBootstrapRoutes() {
        this.app.get('/', (req, res, next) => {
            if (this.bootState === 'ready') {
                return next();
            }

            return this.serveBootstrapPage('index', res);
        });

        this.app.get('/pages/:pageName', (req, res, next) => {
            if (this.bootState === 'ready') {
                return next();
            }

            return this.serveBootstrapPage(req.params.pageName, res);
        });

        this.app.get('/:pageName', (req, res, next) => {
            if (this.bootState === 'ready') {
                return next();
            }

            const pageName = req.params.pageName;
            if (!pageName || pageName.startsWith('api') || pageName === 'assets' || pageName === 'uploads' || pageName === 'js' || pageName === 'components' || pageName === 'socket.io' || pageName === 'admin') {
                return next();
            }

            return this.serveBootstrapPage(pageName, res, next);
        });

        this.app.post('/login', async (req, res, next) => {
            if (this.bootState === 'ready') {
                return next();
            }

            const authController = this.controllers?.authController;
            if (authController && typeof authController.login === 'function') {
                try {
                    return await authController.login(req, res);
                } catch (error) {
                    return res.status(500).json({ success: false, error: 'Login failed' });
                }
            }

            return res.status(503).json({
                success: false,
                error: 'Service is starting, please try again in a moment.'
            });
        });

        this.app.post('/register', async (req, res, next) => {
            if (this.bootState === 'ready') {
                return next();
            }

            const authController = this.controllers?.authController;
            if (authController && typeof authController.register === 'function') {
                try {
                    return await authController.register(req, res);
                } catch (error) {
                    return res.status(500).json({ success: false, error: 'Registration failed' });
                }
            }

            return res.status(503).json({
                success: false,
                error: 'Service is starting, please try again in a moment.'
            });
        });

        this.app.get('/health', (_req, res) => {
            res.status(200).json({
                ok: true,
                state: this.bootState,
                timestamp: new Date().toISOString()
            });
        });

        this.app.get('/status', (_req, res) => {
            res.status(200).json({
                ok: true,
                state: this.bootState,
                startedAt: this.initCompletedAt,
                socketsEnabled: this.socketsEnabled,
                databaseReady: !!this.db,
                redisReady: !!this.redis,
                error: this.bootError ? this.bootError.message : null,
                timestamp: new Date().toISOString()
            });
        });
    }

    serveBootstrapPage(pageName, res, next = null) {
        const normalizedPageName = String(pageName || 'index')
            .replace(/^\/+/, '')
            .replace(/\.html$/i, '');

        const pageFileName = normalizedPageName === 'index' ? 'index.html' : `${normalizedPageName}.html`;
        const pagePath = path.join(__dirname, 'app', 'pages', pageFileName);

        if (fs.existsSync(pagePath)) {
            return res.sendFile(pagePath);
        }

        if (typeof next === 'function') {
            return next();
        }

        return res.status(404).json({
            ok: false,
            error: 'page_not_found',
            page: normalizedPageName
        });
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
        
        // 4. Setup controllers
        this.controllers = setupControllers(
            this.db,
            this.redis,
            this.authMiddleware,
            null,
            this.messageService,
            this.io,
            this.presenceService
        );
        
        // 5. Setup routes
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

            // 6. Setup WebSocket
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
        
        // 7. Start monitoring
        this.monitoringUtils.startMonitoring();
        this.bootState = 'ready';
        this.initCompletedAt = new Date().toISOString();
        console.log(`✅ Server initialization complete at ${this.initCompletedAt}`);
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
            console.log(`✅ Server started successfully on port ${PORT}`);
            console.log(`📍 Health check: http://localhost:${PORT}/health`);
            console.log(`📊 Status endpoint: http://localhost:${PORT}/status`);
            console.log(`🚀 Ready to accept requests`);
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

// Cluster support is opt-in. Railway should run a single worker unless explicitly enabled.
if (cluster.isPrimary && process.env.NODE_ENV === 'production' && appConfig.server.cluster) {
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
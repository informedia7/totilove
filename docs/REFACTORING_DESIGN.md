# Server.js Refactoring Design - Best Option
**Date:** 2025-01-14  
**Goal:** Transform 1,380-line monolithic server.js into clean, modular architecture

---

## 🎯 Design Principles

1. **Separation of Concerns** - Each module has a single responsibility
2. **Dependency Injection** - Clear dependencies, easy to test
3. **Maintainability** - Easy to find and modify code
4. **Scalability** - Easy to add new features
5. **No Functionality Loss** - All existing features preserved

---

## 📁 Proposed Directory Structure

```
server/
├── config/
│   ├── database.js          # Database connection setup
│   ├── redis.js             # Redis connection setup
│   ├── express.js           # Express middleware configuration
│   ├── services.js          # Service initialization
│   ├── controllers.js       # Controller initialization
│   └── websocket.js         # WebSocket setup
│
├── routes/
│   ├── index.js             # Main route aggregator
│   ├── api/
│   │   ├── auth.js          # Auth routes (session check, CSRF token)
│   │   ├── users.js         # User routes (online status, block/unblock)
│   │   ├── activity.js      # Activity routes (favorites, likes, etc.)
│   │   ├── search.js        # Search routes
│   │   └── monitoring.js    # Health/metrics endpoints
│   ├── images.js            # Image serving routes
│   └── middleware.js        # Route-specific middleware (rate limiting)
│
└── server.js                # Main server class (200-300 lines max)
```

---

## 🔧 Module Breakdown

### 1. server/config/database.js
**Purpose:** Database connection setup  
**Exports:** `setupDatabase() -> Promise<Pool>`

```javascript
// Handles PostgreSQL connection with high-load configuration
// Returns database pool instance
```

### 2. server/config/redis.js
**Purpose:** Redis connection and CSRF middleware initialization  
**Exports:** `setupRedis() -> Promise<{redis, csrfMiddleware}>`

```javascript
// Handles Redis connection
// Initializes CSRF middleware with Redis support
// Returns both redis client and csrfMiddleware
```

### 3. server/config/express.js
**Purpose:** Express app middleware configuration  
**Exports:** `configureExpress(app, sessionTracker) -> void`

```javascript
// CORS, cookie parser, body parsers
// Static file serving
// Security headers (CSP, XSS protection, etc.)
// Origin validation
// Session activity tracking middleware
```

### 4. server/config/services.js
**Purpose:** Initialize all application services  
**Exports:** `setupServices(db, redis) -> {messageService, sessionService, activityTracker, sessionTracker}`

```javascript
// MessageService
// SessionService
// ActivityTracker
// SessionTracker (wrapper)
```

### 5. server/config/controllers.js
**Purpose:** Initialize all controllers  
**Exports:** `setupControllers(db, redis, authMiddleware, sessionTracker, messageService, io) -> {authController, messageController, ...}`

```javascript
// All controller instances
// Uses database/controllers/ for consistency
```

### 6. server/config/websocket.js
**Purpose:** WebSocket handler setup  
**Exports:** `setupWebSocket(io, messageService, monitoringUtils, db) -> WebSocketHandler`

```javascript
// WebSocket handler initialization
```

### 7. server/routes/index.js
**Purpose:** Main route aggregator - imports and mounts all routes  
**Exports:** `setupRoutes(app, dependencies) -> void`

```javascript
// Imports all route modules
// Applies middleware
// Mounts all routes
// Single entry point for all routing
```

### 8. server/routes/middleware.js
**Purpose:** Route-specific middleware (rate limiting, etc.)  
**Exports:** 
- `createUserStatusRateLimit() -> middleware`
- `createCSRFRateLimit() -> middleware`

```javascript
// Rate limiting middleware factories
// Reusable middleware creation
```

### 9. server/routes/api/auth.js
**Purpose:** Authentication-related API routes  
**Exports:** `setupAuthRoutes(app, authMiddleware, csrfMiddleware) -> void`

```javascript
// GET /api/auth/check-session
// GET /api/csrf-token (with rate limiting)
```

### 10. server/routes/api/users.js
**Purpose:** User-related API routes  
**Exports:** `setupUserRoutes(app, db, redis, io, blockRateLimiter) -> void`

```javascript
// GET /api/users/:userId/last-online
// POST /api/users/:userId/last-online
// GET /api/users/last-online-bulk
// POST /api/users/cleanup-offline
// POST /api/users/:userId/block
// DELETE /api/users/:userId/block
// GET /api/blocked-users
// GET /api/block-statistics
// POST /api/users/bulk-unblock
```

### 11. server/routes/api/activity.js
**Purpose:** Activity-related API routes  
**Exports:** `setupActivityRoutes(app, activityController) -> void`

```javascript
// GET /api/activity/viewers
// GET /api/activity/favorites
// GET /api/activity/messages
// GET /api/activity/likes
// GET /api/activity/who-liked-me
// GET /api/activity/who-i-like
// POST /api/favorites
// DELETE /api/favorites/:userId
// POST /api/likes
// DELETE /api/likes/:userId
// POST /api/like-user
// POST /api/reports
```

### 12. server/routes/api/search.js
**Purpose:** Search API routes  
**Exports:** `setupSearchRoutes(app, searchController) -> void`

```javascript
// GET /api/search
// GET /api/search/filters
```

### 13. server/routes/api/monitoring.js
**Purpose:** Monitoring and health check routes  
**Exports:** `setupMonitoringRoutes(app, monitoringUtils) -> void`

```javascript
// GET /health
// GET /metrics
```

### 14. server/routes/images.js
**Purpose:** Image serving routes  
**Exports:** `setupImageRoutes(app) -> void`

```javascript
// GET /api/images/:filename
// GET /api/thumbnails/:filename
```

---

## 📝 Refactored server.js Structure

```javascript
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
            cors: { origin: "*", methods: ["GET", "POST"] },
            pingTimeout: 30000,
            pingInterval: 12000,
            maxHttpBufferSize: 1e6,
            transports: ['websocket', 'polling'],
            perMessageDeflate: {
                zlibDeflateOptions: { level: 1, windowBits: 13 },
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
        this.server.close(() => {
            if (this.db) this.db.end();
            if (this.redis) this.redis.quit();
            this.monitoringUtils.cleanup();
            process.exit(0);
        });
        
        setTimeout(() => process.exit(1), 30000);
    }
}

// Cluster support for production
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
    const numWorkers = Math.min(os.cpus().length, 4);
    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }
    cluster.on('exit', (worker) => cluster.fork());
} else {
    const server = new Server();
    server.start();
}
```

**Estimated size:** ~150-200 lines (down from 1,380)

---

## 🔄 Migration Strategy

### Phase 1: Critical Fixes (30 minutes)
1. ✅ Fix SessionActivityTracker import in server.js
2. ✅ Remove all empty files
3. ✅ Verify duplicate controllers

### Phase 2: Create Config Modules (2-3 hours)
1. Create `server/config/` directory
2. Extract database setup → `database.js`
3. Extract Redis setup → `redis.js`
4. Extract Express config → `express.js`
5. Extract services setup → `services.js`
6. Extract controllers setup → `controllers.js`
7. Extract WebSocket setup → `websocket.js`

### Phase 3: Create Route Modules (3-4 hours)
1. Create `server/routes/` directory structure
2. Extract route middleware → `middleware.js`
3. Extract auth routes → `api/auth.js`
4. Extract user routes → `api/users.js`
5. Extract activity routes → `api/activity.js`
6. Extract search routes → `api/search.js`
7. Extract monitoring routes → `api/monitoring.js`
8. Extract image routes → `images.js`
9. Create route aggregator → `index.js`

### Phase 4: Refactor server.js (1 hour)
1. Update imports
2. Update init() method to use new modules
3. Remove all extracted code
4. Test thoroughly

### Phase 5: Cleanup (1 hour)
1. Remove duplicate controllers
2. Update any remaining imports
3. Final testing
4. Documentation

**Total Estimated Time:** 8-10 hours

---

## ✅ Benefits of This Design

### 1. Maintainability
- **Single Responsibility:** Each file has one clear purpose
- **Easy to Find:** Routes organized by feature
- **Easy to Modify:** Changes isolated to specific modules

### 2. Testability
- **Dependency Injection:** Easy to mock dependencies
- **Isolated Modules:** Each module can be tested independently
- **Clear Interfaces:** Well-defined exports

### 3. Scalability
- **Easy to Add Routes:** Just add new file in `server/routes/api/`
- **Easy to Add Features:** Clear structure for new functionality
- **No Merge Conflicts:** Smaller files = fewer conflicts

### 4. Readability
- **server.js:** Now ~200 lines, easy to understand
- **Route Files:** 50-200 lines each, focused and clear
- **Config Files:** Simple setup functions

### 5. Performance
- **No Performance Impact:** Same code, better organized
- **Lazy Loading:** Can optimize imports if needed
- **Clear Dependencies:** Easier to optimize

---

## 🎯 File Size Targets

| File | Current | Target | Status |
|------|---------|--------|--------|
| server.js | 1,380 | 200 | ✅ |
| Route files | N/A | 50-200 each | ✅ |
| Config files | N/A | 50-150 each | ✅ |
| Total | 1,380 | ~1,200 | ✅ |

*Note: Total may be slightly higher due to module overhead, but organization is much better*

---

## 🔍 Controller Consolidation Strategy

### Decision: Use `database/controllers/` as Primary Location

**Reasoning:**
- More comprehensive implementations
- Better organized
- Already used for most controllers in server.js

### Action Plan:
1. Keep `database/controllers/` versions
2. Remove `controllers/` duplicates:
   - `templateController.js` (keep database version, update server.js)
   - `messageController.js` (already using database version)
   - `imageMessageController.js` (verify identical, remove one)
3. Keep `controllers/` for:
   - `searchController.js` (only exists here)
   - `activityController.js` (only exists here)

### Final Structure:
```
controllers/              # App-specific controllers
├── searchController.js
└── activityController.js

database/controllers/     # Database-focused controllers
├── authController.js
├── messageController.js
├── templateController.js
├── matchesController.js
├── imageMessageController.js
└── matchCompatibilityEngine.js
```

---

## 📋 Implementation Checklist

### Pre-Refactoring
- [ ] Fix SessionActivityTracker import (CRITICAL)
- [ ] Remove 7 empty files
- [ ] Verify duplicate controllers are identical
- [ ] Create backup branch

### Config Modules
- [ ] Create `server/config/database.js`
- [ ] Create `server/config/redis.js`
- [ ] Create `server/config/express.js`
- [ ] Create `server/config/services.js`
- [ ] Create `server/config/controllers.js`
- [ ] Create `server/config/websocket.js`
- [ ] Test each module independently

### Route Modules
- [ ] Create `server/routes/middleware.js`
- [ ] Create `server/routes/api/auth.js`
- [ ] Create `server/routes/api/users.js`
- [ ] Create `server/routes/api/activity.js`
- [ ] Create `server/routes/api/search.js`
- [ ] Create `server/routes/api/monitoring.js`
- [ ] Create `server/routes/images.js`
- [ ] Create `server/routes/index.js`
- [ ] Test each route module

### Refactoring
- [ ] Update server.js imports
- [ ] Update server.js init() method
- [ ] Remove extracted code from server.js
- [ ] Test server startup
- [ ] Test all routes
- [ ] Test WebSocket connections

### Cleanup
- [ ] Remove duplicate controllers
- [ ] Update any remaining imports
- [ ] Run full test suite
- [ ] Update documentation

---

## 🚀 Next Steps

1. **Review this design** - Ensure it meets requirements
2. **Start with Phase 1** - Fix critical issues first
3. **Implement incrementally** - One module at a time
4. **Test thoroughly** - After each phase
5. **Document changes** - Update README if needed

---

## 📝 Notes

- All existing functionality will be preserved
- No breaking changes to API endpoints
- Backward compatible with existing code
- Can be done incrementally (one module at a time)
- Easy to rollback if issues arise

---

**Design End**








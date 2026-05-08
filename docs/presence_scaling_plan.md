# Presence Scaling Implementation Plan

## 1. Current Architecture Overview
- **Client**: `presence-engine.js` binds DOM elements, polls `/api/users-online-status`, sends `/api/presence/heartbeat` heartbeats (legacy `/api/user-online` removed), and listens to page-specific socket events.
- **Server**: Express routes in `controllers/searchController.js`, `controllers/messageController.js`, and legacy Socket.IO handlers in `utils/websocketHandler.js` read/write presence state directly from the relational database.
- **Storage**: User online/offline flags stored in primary DB tables (`users`, `user_sessions`, etc.); no dedicated cache or TTL-based eviction.
- **Auto-refresh**: Results, Matches, Talk each schedule their own 30s refresh loops; fallbacks hit `/api/user-status/:id` individually when sockets or PresenceEngine arent ready.

### Key Pain Points
1. **Database Load**: Every heartbeat and status fetch reads/writes the main DB, causing write amplification and slow queries under load.
2. **Single-Node Socket.IO**: Current websocket handler only scales vertically; no adapter for multi-instance fanout.
3. **Client Overdraw**: Pages bind every indicator regardless of visibility and keep polling while tabs are hidden.
4. **Uncached APIs**: `/api/users-online-status` always recomputes responses; no ETag, CDN, or memoization.

## 2. Target System Goals
- **Redis-backed state**: Heartbeats and status reads occur entirely in Redis with TTL enforcement.
- **Distributed realtime tier**: Socket.IO (or MQTT/uWebSockets.js) behind a load balancer with shared pub/sub so logout/login broadcasts reach all clients instantly.
- **Smart clients**: PresenceEngine caps bindings, pauses refresh when `document.hidden`, and virtualizes long lists.
- **Cache-aware APIs**: Batch endpoints expose ETag headers and optional streaming (`/presence/subscribe`) for delta delivery.

## 3. Implementation Roadmap

### 3.1 Redis Presence Service
1. **Infrastructure**
   - Provision Redis cluster (or reuse existing `config/redis.js` instance) with high-availability settings.
   - Add configuration entries (`config/redis.js`, `.env`) for presence-specific databases / key prefixes.
2. **Heartbeat Writer**
    - New module `services/presenceService.js` with functions:
       - `markOnline(userId, ttlMs)` -> `SETEX presence:user:{id} "online" ttl` and add to `presence:online` sorted set with expiry timestamp.
       - `markOffline(userId)` -> remove from Redis keys/sets.
    - `/api/presence/heartbeat` (now the sole heartbeat endpoint) calls the Redis service synchronously for writes; keep DB updates asynchronous for analytics. The legacy `/api/user-online` route has been removed and replies with HTTP 410.
3. **Batch Reader**
   - Implement `getStatuses(userIds)` to pipeline `MGET` + `PTTL` for each user, returning `{ isOnline, lastSeen }` from Redis.
   - Modify `/api/users-online-status` and PresenceEngine batch responses to use Redis results. DB fallback only when Redis unavailable.
4. **Sweeper Job**
   - Background worker (cron or Node interval) to scan `presence:online` sorted set and remove entries whose expiry < current time (safety net if clients disconnect without logout).
5. **Testing**
   - Add integration tests hitting Redis mock to ensure TTL behavior; ensure feature flag to toggle Redis vs DB while rolling out.

### 3.2 Realtime Fanout Tier
1. **Socket Layer Refactor**
   - Replace `utils/websocketHandler.js` with modular socket bootstrap (e.g., `server/realtime/index.js`).
   - Integrate `socket.io-redis` adapter (or switch to uWebSockets.js) to share events across instances.
2. **Authentication**
   - Ensure socket auth reuses session tokens; consider JWT to avoid sticky sessions.
3. **Presence Events**
   - Emit `presence:update` messages whenever Redis `markOnline/markOffline` executes.
   - Clients subscribe once and update local cache without hitting HTTP endpoints.
4. **Load Balancer Deployment**
   - Document required NGINX/ELB configuration: WebSocket upgrade headers, sticky session policy if still needed.
5. **Fallback Strategy**
   - PresenceEngine keeps HTTP polling if socket connection missing; once socket connected, disable redundant timers.

### 3.3 Client Throttling & Virtualization
1. **Binding Cap**
   - Extend `PresenceEngine` to track number of active indicators; drop off-screen nodes using `IntersectionObserver`.
   - Only request status for the first N visible users (configurable, default 100).
2. **Tab Visibility**
   - Add `document.visibilitychange` listener; pause refresh timers when tab hidden, resume on visibility.
3. **Virtualized Lists**
   - Integrate a lightweight virtual scroll helper for Results/Matches (reuse existing grid but recycle rows). Document target max DOM nodes (<200).
4. **Testing/UX**
   - Ensure virtualization doesnt break modals or quick actions; add QA checklist for scroll positions and selection states.

#### Continuous Iteration Notes
- Instrument `PresenceEngine` refresh intervals with `performance.mark()` and log samples to `monitoringUtils` so each change to caps/thresholds is backed by data instead of subjective feel.
- Schedule bi-weekly UX timing reviews; compare virtualized vs non-virtualized video captures on low-end Android to validate the <500ms hydration target and adjust `maxTrackedUsers` accordingly.
- Keep an A/B flag (`presence.virtualizationVariant`) ready so experimental tweaks (e.g., different `IntersectionObserver` root margins) can be rolled out to 10% cohorts without touching mainline code repeatedly.
- Document regression findings in `docs/presence_virtualization_QA.md` after every pass so future iterations don't revisit previously closed gaps.

### 3.4 Cached & Streaming APIs
1. **Batch Endpoint Enhancements**
   - Add ETag header computed from hash of user IDs + latest Redis version.
   - Respect `If-None-Match`: return 304 when statuses unchanged within TTL window.
2. **Short-Lived Caching**
   - Configure CDN/edge (CloudFront/Fastly) to cache `/api/users-online-status` for 5-10 seconds when query hash identical.
3. **/presence/subscribe Endpoint**
   - Implement Server-Sent Events (SSE) or WebSocket channel serving minimal payloads (userId + new state) derived from Redis pub/sub.
   - PresenceEngine optionally prefers this stream to reduce HTTP overhead.
4. **Rate Limiting**
   - Apply per-IP/hour limits on `/api/user-status/:id` and fallback endpoints via existing middleware (`middleware/rateLimiter.js` or new implementation).

## 4. Dependencies & Coordination
- **DevOps**: Need Redis provisioning, load balancer/socket adapter deployment, CDN rule updates.
- **Backend**: Modify Express controllers, add Redis service layer, rewrite websocket handler, add SSE endpoint.
- **Frontend**: Update PresenceEngine, Results/Matches/Talk pages to adopt throttling + new subscribe endpoint.
- **QA**: Regression tests on chat presence, results/matches indicators, mobile browsers, background-tab behavior.

## 5. Rollout Strategy
1. **Feature flags** for Redis presence and socket fanout so we can test with internal accounts first.
2. **Canary deployment**: enable new PresenceEngine throttling for a subset of traffic.
3. **Monitoring**: add metrics (Redis hit rate, socket connection counts, API cache ratio) to existing dashboards.
4. **Fallback plan**: ability to toggle back to DB-backed presence quickly if Redis cluster issues arise.

---
This document should guide the detailed implementation work for the new scalable presence system. Update it as tasks progress.

## 6. Implementation Status (Jan 18 2026)

### 6.1 Completed Deliverables
- **Redis Presence Core**: ✅ `services/presenceService.js` handles markOnline/markOffline, TTL sweeps, and publishes `presence:update` via Redis pub/sub. Stale sweeper interval set to 60s with auto-cleanup enabled.
- **HTTP & Socket Integration**: ✅ `/api/presence/heartbeat`, `/api/users-online-status`, and `/api/user-offline` now proxy through the Redis service while `utils/websocketHandler.js` rebroadcasts Redis events to connected sockets. `/api/user-online` has been decommissioned and now returns HTTP 410 for stale clients.
- **Distributed Fanout**: ✅ Socket.IO instances share state via `@socket.io/redis-adapter`, removing single-node bottlenecks and ensuring login/logout broadcasts reach all pods.
- **Streaming API (SSE)**: ✅ `/presence/subscribe` streams filtered presence deltas; PresenceEngine consumes it with reconnect/backoff logic before falling back to HTTP polling.
- **PresenceEngine Enhancements**: ✅ Engine now honors `maxTrackedUsers`, defers hidden-tab refresh for 45s, auto-measures card heights for virtualization, and applies deferred-indicator styling.
- **Virtualized Lists (Talk, Matches, Results)**: ✅ Shared `VirtualizedPresenceList` limits DOM nodes to <200, wiring grid/list toggles, quick actions, and presence binding recycling across all major pages (Matches threshold 60, Results threshold 80).
- **Cached Batch API**: ✅ `/api/users-online-status` emits `ETag` + `Cache-Control: private, max-age=5` headers, responding with 304 when caller supplies a matching `If-None-Match` hash of `(userIds + payload checksum)`.
- **Dependency Hygiene**: ✅ `npm audit fix --force` executed; ticket #OPS-218 tracks regression testing for upgraded packages (`vite`, `bcrypt`, `nodemailer`, etc.).
- **Presence Telemetry Loop**: ✅ PresenceEngine instruments each batch refresh with `performance.now()` timings and streams anonymized samples to `/metrics/presence-client`, where `monitoringUtils` aggregates client-side throttling insights for the UX review cadence.

### 6.2 In Progress / Next Actions
1. **Client Throttling & Virtualization QA (3.3)**
   - Owners: Frontend + QA.
   - Tasks: Run cross-browser scroll tests (Chrome, Safari, Firefox, Android WebView), verify deferred indicators hydrate within 500ms, validate modals/actions from virtualized cards, adjust thresholds if CPU spikes >30% on low-end devices.
2. **Presence Feature Flags & Monitoring (3.1–3.4)**
   - Owners: Backend + DevOps.
   - Tasks: Expose `presence.redisEnabled` and `presence.streamingEnabled` toggles via `featureFlags.js`, add Grafana dashboards for Redis ops/sec + SSE error rates, configure alerting (OpsGenie) for Redis latency >20ms (p95) or SSE reconnect spikes.
3. **Regression & Load Testing (All Sections)**
   - Owners: QA + Performance.
   - Tasks: Execute auth/messaging regression suite, run k6/gatling scenario simulating 100k concurrent presence clients (mix of sockets + SSE + HTTP fallback), capture Redis memory/cpu headroom, finalize go/no-go checklist before enabling flags for 100% traffic.

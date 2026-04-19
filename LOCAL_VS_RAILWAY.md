# Local vs Railway — Environment Differences

## Quick Reference

| Aspect | Local (dev) | Railway (prod) |
|---|---|---|
| URL | `http://localhost:3001` | `https://totilove.com` |
| `NODE_ENV` | `development` | `production` |
| Trust proxy | not set | `TRUST_PROXY=1` |
| Cookie `secure` | `false` (HTTP allowed) | `true` (HTTPS only) |
| Database | `localhost:5432` | `DATABASE_URL` (Railway Postgres) |
| Redis | `localhost:6379` | `REDIS_URL` (Railway Redis) |
| Uploads path | `./app/uploads/` (local disk) | `/app/app/uploads` (Railway volume) |
| `BASE_URL` | `http://localhost:3001` | `https://totilove.com` |
| Error details in API | Full stack traces | Generic messages only |
| Cluster workers | Single process | Single process (opt-in via `ENABLE_CLUSTER=true`) |
| DB SSL | off | `DB_SSL=true` → `{ rejectUnauthorized: false }` |
| Email links | `http://localhost:3001/...` | `https://totilove.com/...` |

---

## Detail Per Area

### PORT & HOST

```
Local:   server listens on localhost:3001 (default)
Railway: PORT is injected automatically by Railway at runtime
         server must bind 0.0.0.0 so Railway's router can reach it
```

Relevant file: [`config/config.js`](config/config.js)
```js
port: process.env.PORT || 3001,
host: process.env.HOST || 'localhost',
```

---

### NODE_ENV

Set in [`railway.json`](railway.json):
```json
"variables": {
  "NODE_ENV": "production"
}
```

Controls:
- Cookie `secure` flag
- Error detail exposure in API responses
- CSRF origin whitelist (localhost allowed only in dev)
- Cluster mode availability

---

### Trust Proxy

Railway runs behind a reverse proxy (nginx/load balancer). Without trust proxy:
- `req.protocol` returns `http` even on HTTPS requests
- `req.ip` returns the proxy IP instead of the real client IP
- Secure cookies never get set because Express thinks the request is not HTTPS

Set in [`railway.json`](railway.json):
```json
"variables": {
  "TRUST_PROXY": "1"
}
```

Applied in [`server/config/express.js`](server/config/express.js):
```js
const trustProxyValue = process.env.TRUST_PROXY;
if (trustProxyValue !== undefined) {
    app.set('trust proxy', normalized);
}
```

---

### Session Cookie

Set in [`database/controllers/authController.js`](database/controllers/authController.js):
```js
const isProduction = process.env.NODE_ENV === 'production';
res.cookie('sessionToken', sessionToken, {
    httpOnly: true,          // always — blocks JS access (XSS protection)
    secure: isProduction,    // HTTPS-only on Railway, HTTP ok locally
    sameSite: 'strict',      // always — CSRF protection
    maxAge: 2 * 60 * 60 * 1000,
    path: '/'
});
```

---

### Database

Local fallback in [`config/config.js`](config/config.js):
```js
host:     process.env.DB_HOST     || 'localhost',
port:     process.env.DB_PORT     || 5432,
database: process.env.DB_NAME     || 'totilove',
user:     process.env.DB_USER     || 'postgres',
password: process.env.DB_PASSWORD || 'password',
ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
```

On Railway: set `DATABASE_URL` (Railway Postgres auto-injects this) and `DB_SSL=true`.

---

### Redis

Local fallback in [`config/config.js`](config/config.js):
```js
url:  process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || null,
host: process.env.REDIS_HOST || 'localhost',
port: process.env.REDIS_PORT || 6379,
```

On Railway: set `REDIS_URL` (Railway Redis auto-injects this).

---

### Uploads Folder

| | Path | Persistent? |
|---|---|---|
| Local | `./app/uploads/` (relative to project root) | Yes (developer's disk) |
| Railway | `/app/app/uploads` | Only with volume `totilove-volume` mounted |

Without the Railway volume, every redeploy wipes all uploaded files.

Static file serving ([`server/config/express.js`](server/config/express.js)):
```js
app.use('/uploads', express.static(path.join(__dirname, '../../app', 'uploads')));
```

Multer write destination ([`controllers/imageMessageController.js`](controllers/imageMessageController.js)):
```js
destination: (req, file, cb) => cb(null, 'app/uploads/chat_images/')
```

---

### Email BASE_URL

Used to build verification and password reset links.

Set via env var:
```
Local:   BASE_URL=http://localhost:3001
Railway: BASE_URL=https://totilove.com
```

In [`services/emailService.js`](services/emailService.js):
```js
this.baseUrl = process.env.BASE_URL || 'http://localhost:3001';

// verification link:  ${baseUrl}/api/verify-email?token=...
// password reset link: ${baseUrl}/reset-password?token=...
```

---

### Error Detail Exposure

In [`database/controllers/authController.js`](database/controllers/authController.js):
```js
// development: full stack trace in response
// production:  generic message only, stack logged server-side
if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = error.stack;
}
```

---

### Cluster Mode

In [`server.js`](server.js):
```js
// Cluster is opt-in — Railway runs single worker unless ENABLE_CLUSTER=true
if (cluster.isPrimary && NODE_ENV === 'production' && appConfig.server.cluster) {
    const numWorkers = Math.min(numCPUs, 4);
    for (let i = 0; i < numWorkers; i++) cluster.fork();
}
```

Set `ENABLE_CLUSTER=true` on Railway only if you need multi-core scaling. Default: single process.

---

## Diagram

```
┌──────────────────────────────────┐      ┌──────────────────────────────────────┐
│           LOCAL (dev)            │      │           RAILWAY (prod)              │
│                                  │      │                                       │
│  http://localhost:3001           │      │  https://totilove.com                 │
│  NODE_ENV = development          │      │  NODE_ENV = production                │
│                                  │      │  TRUST_PROXY = 1                      │
│  ┌──────────────────────────┐   │      │  ┌──────────────────────────────┐    │
│  │ Express                   │   │      │  │ Nginx (Railway proxy)         │    │
│  │ no trust proxy            │   │      │  │       │                       │    │
│  │ cookie.secure = false     │   │      │  │       ▼                       │    │
│  └──────────────────────────┘   │      │  │ Express                       │    │
│                                  │      │  │ trust proxy = 1               │    │
│  ┌──────────┐  ┌─────────────┐  │      │  │ cookie.secure = true          │    │
│  │ Postgres  │  │ Redis       │  │      │  └──────────────────────────────┘    │
│  │ localhost │  │ localhost   │  │      │                                       │
│  │ :5432     │  │ :6379       │  │      │  ┌──────────────┐  ┌─────────────┐  │
│  │ no SSL    │  │ no auth     │  │      │  │ Postgres      │  │ Redis       │  │
│  └──────────┘  └─────────────┘  │      │  │ DATABASE_URL  │  │ REDIS_URL   │  │
│                                  │      │  │ SSL enabled   │  │ with auth   │  │
│  ┌──────────────────────────┐   │      │  └──────────────┘  └─────────────┘  │
│  │ ./app/uploads/            │   │      │                                       │
│  │ (developer disk)          │   │      │  ┌──────────────────────────────┐    │
│  └──────────────────────────┘   │      │  │ /app/app/uploads              │    │
│                                  │      │  │ Railway volume: totilove-volume│    │
│  BASE_URL = http://localhost:3001│      │  │ survives redeploys            │    │
│                                  │      │  └──────────────────────────────┘    │
│  API errors: full stack trace    │      │                                       │
│                                  │      │  BASE_URL = https://totilove.com      │
│  Email links: localhost URLs     │      │                                       │
│  (for testing only)              │      │  API errors: generic messages only    │
│                                  │      │                                       │
│                                  │      │  Email links: real https:// URLs      │
└──────────────────────────────────┘      └──────────────────────────────────────┘

              │                                          │
              ▼                                          ▼
      Dev machine only                         Real users + persistent data
```

---

## Required Railway Env Vars (totilove service)

| Var | Description |
|---|---|
| `NODE_ENV` | `production` (set in railway.json) |
| `TRUST_PROXY` | `1` (set in railway.json) |
| `DATABASE_URL` | Auto-injected by Railway Postgres plugin |
| `REDIS_URL` | Auto-injected by Railway Redis plugin |
| `SESSION_SECRET` | Random secret for cookie signing |
| `BASE_URL` | `https://totilove.com` |
| `RESEND_API_KEY` | Email provider key |
| `RESEND_FROM_EMAIL` | Verified sender address |
| `EXPORT_SECRET` | Shared secret for uploads-export proxy endpoint |
| `UPLOADS_PATH` | `/app/app/uploads` (volume mount path) |

# Railway deployment configuration (Totilove)

This repo is set up to deploy on Railway using **Nixpacks** with a healthcheck at **`/health`**.

The goal of this document is to list the **exact Railway configuration** required so the service boots with:

- **100% working Postgres connection**
- **Redis connection** (optional-but-recommended; app can degrade gracefully if Redis is unavailable)
- **Persistent uploads storage** (Railway Volume)
- Required secrets and URLs for auth + email

---

## Service type

- **Service**: Node.js web service
- **Entry point**: `server.js`
- **Start command**: `npm run start` (runs `node server.js`)

Your repo already contains `railway.json` which Railway will use.

---

## Railway build & deploy settings (matches `railway.json`)

Railway uses Nixpacks with:

- **Build command**: `npm install && npm run build`
- **Start command**: `npm run start`
- **Healthcheck path**: `/health`
- **Replicas**: `1`
- **Restart policy**: on-failure (max 3 retries)

`railway.json` also sets:

- **`NODE_ENV=production`**
- **`TRUST_PROXY=1`**
- **`NIXPACKS_NODE_VERSION=20`**
- **`NPM_CONFIG_PRODUCTION=false`** (so devDependencies are available if needed during build)

---

## Required Railway plugins / resources

### Postgres (required)

Add a **Postgres** plugin to the same Railway project.

Railway will inject **`DATABASE_URL`** into your service automatically (when the services are linked).

### Redis (recommended)

Add a **Redis** plugin to the same Railway project.

Railway will inject **`REDIS_URL`** into your service automatically (when the services are linked).

### Volume (required for uploads persistence)

Your app stores user-uploaded images under `app/uploads/...`.

If you do not add a Railway **Volume**, uploads will be lost on every deploy.

- **Mount path**: `/app/app/uploads`
- **Environment variable**: set `UPLOADS_PATH=/app/app/uploads`

---

## Environment variables (Railway service)

### Required (must set)

- **`SESSION_SECRET`**: strong random string (cookie/session signing)
- **`JWT_SECRET`**: strong random string (JWT signing)
- **`BASE_URL`**: your public URL, e.g. `https://your-domain.com`
- **`UPLOADS_PATH`**: `/app/app/uploads` (must match the mounted volume path)

### Postgres (required)

**Preferred (Railway way):**

- **`DATABASE_URL`**: auto-injected by Railway Postgres

**SSL (important on Railway):**

Set one of:

- **`DB_SSL=true`** (recommended), or
- **`PGSSLMODE=require`**

Your code enables TLS when `DB_SSL=true` or `PGSSLMODE=require` and uses `rejectUnauthorized: false` (typical for managed Postgres).

**Fallback variables (optional):** only needed if you are not using `DATABASE_URL`

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- or the `PG*` equivalents: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`

### Redis (recommended)

**Preferred (Railway way):**

- **`REDIS_URL`**: auto-injected by Railway Redis

Optional extras (only if your Redis provider requires them separately):

- `REDIS_PASSWORD`, `REDIS_DB`

### CORS (recommended)

- **`CORS_ORIGINS`**: comma-separated allowlist (recommended for production)
  - Example: `CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com`
  - If not set, code defaults to `['*']` (too open for most production setups)

### Email (choose one path)

Your repo includes Resend config in `.env.example`. If you want email features, set:

- **`RESEND_API_KEY`**
- **`RESEND_FROM_EMAIL`** (must be a verified sender in Resend)
- *(optional)* **`EMAIL_FROM`** (some flows may use this)

If you use SMTP instead of Resend (only if your `emailService` is wired for SMTP in your current branch), set:

- `EMAIL_ENABLED=true`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
- `SMTP_SECURE` (`true`/`false`)
- `SMTP_FROM_NAME`

---

## “100% DB connection” checklist

To ensure Postgres works reliably on Railway:

- **Postgres plugin exists** in the Railway project.
- **Your service is linked** to the Postgres plugin so Railway injects `DATABASE_URL`.
- **`DB_SSL=true`** (or `PGSSLMODE=require`) is set on the service.
- The service boots successfully and `/health` returns HTTP 200.

If the app cannot reach Postgres at boot, it will log `Database connection failed` and exit (Railway will restart it).

---

## “It boots but can’t login / cookies broken” checklist

Because Railway runs behind a reverse proxy, you must have:

- **`TRUST_PROXY=1`** (already set in `railway.json`)
- **`NODE_ENV=production`** (already set in `railway.json`)

Without trust proxy in production, Express may think requests are HTTP (not HTTPS) and **secure cookies won’t set** correctly.

---

## Uploads persistence checklist

To keep uploads across deploys:

- Add a Railway **Volume** to the service
- Mount it at **`/app/app/uploads`**
- Set **`UPLOADS_PATH=/app/app/uploads`**

Your code still writes uploads to relative paths like `app/uploads/chat_images/...`; the volume mount ensures those writes land on persistent storage.

---

## Optional performance / scaling env vars

Keep defaults unless you know you need them.

- **`ENABLE_CLUSTER=true`**: enable multi-worker clustering in production (default is off; Railway runs one process)
- **`DISABLE_SOCKET_ADAPTER=true`**: forces Socket.IO to skip the Redis adapter
- **`LOG_LEVEL`**: e.g. `info`, `debug`

---

## Verification after deploy

After Railway deploy finishes:

- Open **`/health`** → should return `200` with `{ ok: true }`
- Open **`/status`** → confirm:
  - `state` is `ready`
  - `databaseReady` is `true`
  - `redisReady` is `true` (if Redis plugin is configured)

---

## Notes for multi-service repos (admin-server)

This repo also has an `admin-server/` directory with its own `package.json`.

If you deploy it as a separate Railway service, it will need **its own**:

- Build/start commands (pointing to the admin server entry)
- Environment variables (Postgres + Redis + `UPLOADS_PATH` if it reads uploads)
- Optional Volume mount (same `/app/app/uploads` path convention if shared)


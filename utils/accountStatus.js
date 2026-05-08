const ACCOUNT_STATUS = {
    ACTIVE: 'active',
    PAUSED: 'paused'
};

let ensureAccountStatusSchemaPromise = null;

function normalizeAccountStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized === ACCOUNT_STATUS.ACTIVE) {
        return ACCOUNT_STATUS.ACTIVE;
    }
    if (normalized === ACCOUNT_STATUS.PAUSED || normalized === 'pause' || normalized === 'on_pause') {
        return ACCOUNT_STATUS.PAUSED;
    }
    return ACCOUNT_STATUS.ACTIVE;
}

function normalizeBooleanFlag(value) {
    return value === true || value === 'true' || value === 't' || value === '1' || value === 1;
}

async function ensureAccountStatusSchema(db) {
    if (!db || typeof db.query !== 'function') {
        throw new Error('Database connection is required to ensure account status schema');
    }

    if (!ensureAccountStatusSchemaPromise) {
        ensureAccountStatusSchemaPromise = (async () => {
            await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(16) NOT NULL DEFAULT 'active'");
            await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE');
            await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS pause_reason TEXT');
            await db.query("UPDATE users SET account_status = LOWER(TRIM(account_status)) WHERE account_status IS NOT NULL");
            await db.query("UPDATE users SET account_status = 'active' WHERE account_status IS NULL OR TRIM(account_status) = '' OR account_status NOT IN ('active', 'paused')");
            await db.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_account_status");
            await db.query("ALTER TABLE users ADD CONSTRAINT chk_users_account_status CHECK (account_status IN ('active', 'paused'))");
            await db.query('CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status)');
            await db.query('CREATE INDEX IF NOT EXISTS idx_users_paused_at ON users(paused_at)');
        })();

        try {
            await ensureAccountStatusSchemaPromise;
        } catch (error) {
            ensureAccountStatusSchemaPromise = null;
            throw error;
        }
    }

    return ensureAccountStatusSchemaPromise;
}

async function getUserAccountStatus(db, userId) {
    await ensureAccountStatusSchema(db);

    const result = await db.query(
        `SELECT account_status, paused_at, pause_reason,
                COALESCE(is_suspended, false) AS is_suspended
         FROM users
         WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return {
        accountStatus: normalizeAccountStatus(result.rows[0].account_status),
        pausedAt: result.rows[0].paused_at || null,
        pauseReason: result.rows[0].pause_reason || null,
        isSuspended: normalizeBooleanFlag(result.rows[0].is_suspended),
        isPaused: normalizeAccountStatus(result.rows[0].account_status) === ACCOUNT_STATUS.PAUSED
    };
}

async function isAccountPaused(db, userId) {
    const status = await getUserAccountStatus(db, userId);
    if (!status) {
        return false;
    }
    return status.isPaused;
}

async function isAccountSuspended(db, userId) {
    const status = await getUserAccountStatus(db, userId);
    if (!status) {
        return false;
    }
    return status.isSuspended;
}

module.exports = {
    ACCOUNT_STATUS,
    normalizeAccountStatus,
    ensureAccountStatusSchema,
    getUserAccountStatus,
    isAccountPaused,
    isAccountSuspended
};

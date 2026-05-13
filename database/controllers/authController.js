const bcrypt = require('bcrypt');
const crypto = require('crypto');
const ActivityRateLimiter = require('../../utils/activityRateLimiter');
const emailService = require('../../services/emailService');
const config = require('../../config/config');
const {
    ACCOUNT_STATUS,
    ensureAccountStatusSchema,
    normalizeAccountStatus
} = require('../../utils/accountStatus');

const REAL_NAME_REGEX = /^[A-Za-z]{2,100}$/;

/** ISO date YYYY-MM-DD; real calendar date; age between 18 and 120 years (matches register UI). */
function validateRegistrationBirthdate(birthdateRaw) {
    const s = String(birthdateRaw ?? '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) {
        return { valid: false, error: 'Invalid birthdate format' };
    }
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    const bd = new Date(y, mo - 1, d);
    if (bd.getFullYear() !== y || bd.getMonth() !== mo - 1 || bd.getDate() !== d) {
        return { valid: false, error: 'Invalid birthdate' };
    }
    const today = new Date();
    const maxBd = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const minBd = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
    if (bd > maxBd) {
        return { valid: false, error: 'You must be at least 18 years old' };
    }
    if (bd < minBd) {
        return { valid: false, error: 'Birthdate is outside the allowed range (maximum age 120 years)' };
    }
    return { valid: true };
}

function sanitizeTextInput(value, maxLength = 2000) {
    if (value === undefined || value === null) {
        return null;
    }
    const textValue = String(value);
    const withoutTags = textValue.replace(/<[^>]*>/g, '');
    const withoutControlChars = withoutTags.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    return withoutControlChars.trim().slice(0, maxLength);
}

function normalizeNullableValue(value) {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (
            trimmed === '' ||
            trimmed.toLowerCase() === 'null' ||
            trimmed.toLowerCase() === 'undefined' ||
            trimmed.toLowerCase() === 'not specified'
        ) {
            return null;
        }
        return trimmed;
    }
    return value;
}

function parseNullableInt(value) {
    const normalized = normalizeNullableValue(value);
    if (normalized === null) {
        return null;
    }
    const parsed = parseInt(normalized, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function isNotImportantSelection(value) {
    if (value === undefined || value === null) {
        return false;
    }

    const normalized = String(value).trim().toLowerCase();
    return normalized === '0' || normalized === '__not_important__' || normalized === 'not important';
}

async function resolveHeightCmByReference(client, referenceId) {
    const id = parseNullableInt(referenceId);
    if (!id) {
        return null;
    }
    const result = await client.query('SELECT height_cm FROM user_height_reference WHERE id = $1 LIMIT 1', [id]);
    return result.rows.length > 0 ? result.rows[0].height_cm : null;
}

async function resolveWeightKgByReference(client, referenceId) {
    const id = parseNullableInt(referenceId);
    if (!id) {
        return null;
    }
    const result = await client.query('SELECT weight_kg FROM user_weight_reference WHERE id = $1 LIMIT 1', [id]);
    return result.rows.length > 0 ? result.rows[0].weight_kg : null;
}

class AuthController {
    constructor(db, authMiddleware, sessionTracker = null, presenceService = null) {
        this.db = db;
        this.auth = authMiddleware;
        this.sessionTracker = sessionTracker;
        this.presenceService = presenceService;
        this.rateLimiter = new ActivityRateLimiter(db);
        this.tableExistenceCache = new Map();
        this.columnExistenceCache = new Map();
        this.schemaCacheMaxEntries = 256;
    }

    getCachedValue(cacheMap, key) {
        if (!cacheMap || !cacheMap.has(key)) {
            return undefined;
        }

        const value = cacheMap.get(key);
        // Refresh insertion order to keep recently-used entries.
        cacheMap.delete(key);
        cacheMap.set(key, value);
        return value;
    }

    setCachedValue(cacheMap, key, value) {
        if (!cacheMap) {
            return;
        }

        if (cacheMap.has(key)) {
            cacheMap.delete(key);
        }

        cacheMap.set(key, value);

        while (cacheMap.size > this.schemaCacheMaxEntries) {
            const oldestKey = cacheMap.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }
            cacheMap.delete(oldestKey);
        }
    }

    async tableExists(tableName, runner = null) {
        if (!tableName) {
            return false;
        }

        const cachedExists = this.getCachedValue(this.tableExistenceCache, tableName);
        if (cachedExists !== undefined) {
            return cachedExists;
        }

        const queryRunner = runner || this.db;
        if (!queryRunner || typeof queryRunner.query !== 'function') {
            return false;
        }

        try {
            const result = await queryRunner.query('SELECT to_regclass($1) AS table_name', [tableName]);
            const exists = Boolean(result.rows && result.rows[0] && result.rows[0].table_name);
            this.setCachedValue(this.tableExistenceCache, tableName, exists);
            return exists;
        } catch (error) {
            console.warn(`⚠️ Could not verify ${tableName} table:`, error.message);
            this.setCachedValue(this.tableExistenceCache, tableName, false);
            return false;
        }
    }

    async columnExists(tableName, columnName, runner = null) {
        if (!tableName || !columnName) {
            return false;
        }

        const cacheKey = `${tableName}.${columnName}`;
        const cachedExists = this.getCachedValue(this.columnExistenceCache, cacheKey);
        if (cachedExists !== undefined) {
            return cachedExists;
        }

        const queryRunner = runner || this.db;
        if (!queryRunner || typeof queryRunner.query !== 'function') {
            return false;
        }

        try {
            const result = await queryRunner.query(`
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = $1
                    AND column_name = $2
                ) AS column_exists
            `, [tableName, columnName]);

            const exists = Boolean(result.rows && result.rows[0] && result.rows[0].column_exists);
            this.setCachedValue(this.columnExistenceCache, cacheKey, exists);
            return exists;
        } catch (error) {
            console.warn(`⚠️ Could not verify ${tableName}.${columnName} column:`, error.message);
            this.setCachedValue(this.columnExistenceCache, cacheKey, false);
            return false;
        }
    }

    collectRegistrationIps(req) {
        const registrationIps = [];
        const pushIp = (v) => {
            if (v == null || typeof v !== 'string') return;
            const t = v.trim();
            if (t && !registrationIps.includes(t)) registrationIps.push(t);
        };
        const forwardedFor = req.headers['x-forwarded-for'];
        if (forwardedFor && typeof forwardedFor === 'string') {
            forwardedFor.split(',').forEach((h) => pushIp(h));
        }
        pushIp(req.ip);
        pushIp(req.connection?.remoteAddress);
        return registrationIps;
    }

    /**
     * Turn stored profile file name or path into a public URL path for the navbar / API.
     */
    normalizeProfileImagePublicUrl(fileNameOrPath) {
        if (fileNameOrPath === undefined || fileNameOrPath === null) return null;
        const trimmed = String(fileNameOrPath).trim();
        if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
            return null;
        }
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        if (trimmed.startsWith('/')) return trimmed;
        const clean = trimmed.replace(/^\/?uploads\/profile_images\//i, '');
        if (!clean) return null;
        return `/uploads/profile_images/${clean}`;
    }

    async fetchApprovedPrimaryProfileFileName(userId) {
        if (!userId || !this.db) return null;
        const result = await this.db.query(
            `
            SELECT ui_choice.file_name
            FROM user_images ui_choice
            WHERE ui_choice.user_id = $1
              AND ui_choice.file_name IS NOT NULL
              AND ui_choice.approval_status = 'approved'
            ORDER BY
                CASE
                    WHEN ui_choice.is_profile = 1 THEN 0
                    WHEN ui_choice.featured = 1 THEN 1
                    ELSE 2
                END,
                ui_choice.uploaded_at DESC NULLS LAST,
                ui_choice.id DESC
            LIMIT 1
        `,
            [userId]
        );
        return result.rows[0]?.file_name || null;
    }

    /**
     * Ensures session.user carries profile_image / avatar_photo for clients (e.g. homepage navbar).
     * Mutates sessionUser and caches on the in-memory session object.
     */
    async enrichSessionUserProfileImages(sessionUser) {
        if (!sessionUser || sessionUser.id == null || !this.db) return;
        const existingRaw = sessionUser.profile_image || sessionUser.avatar_photo;
        let normalized = this.normalizeProfileImagePublicUrl(existingRaw);
        if (!normalized) {
            try {
                const fileName = await this.fetchApprovedPrimaryProfileFileName(sessionUser.id);
                normalized = this.normalizeProfileImagePublicUrl(fileName);
            } catch (err) {
                console.warn('[AuthController] enrichSessionUserProfileImages:', err.message);
            }
        }
        if (normalized) {
            sessionUser.profile_image = normalized;
            sessionUser.avatar_photo = normalized;
        }
    }

    async adminBlacklistGate(req, res, normalizedEmail) {
        const registrationIps = this.collectRegistrationIps(req);
        const ipCsv = registrationIps.join(',');
        try {
            const blacklistHit = await this.db.query(
                `SELECT 1 FROM admin_blacklisted_users
                 WHERE LOWER(TRIM(email)) = $1
                    OR (
                      COALESCE(stop_this_ip, false) = true
                      AND user_ip_address IS NOT NULL
                      AND EXISTS (
                        SELECT 1 FROM unnest(string_to_array($2, ',')) AS c(ip)
                        WHERE NULLIF(TRIM(c.ip), '') IS NOT NULL
                          AND LOWER(TRIM(user_ip_address)) = LOWER(TRIM(c.ip))
                      )
                    )
                 LIMIT 1`,
                [normalizedEmail, ipCsv]
            );

            if (blacklistHit.rows.length > 0) {
                console.warn('[AuthController] Blocked: admin blacklist (email or stop_this_ip + IP)');
                res.status(400).json({
                    success: false,
                    error: 'unspecified server error'
                });
                return true;
            }
            return false;
        } catch (err) {
            console.error('[AuthController] Blacklist lookup failed:', err.message);
            res.status(400).json({
                success: false,
                error: 'unspecified server error'
            });
            return true;
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;
            const normalizedEmail = String(email || '').trim().toLowerCase();

            if (!normalizedEmail || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Email and password are required'
                });
            }

            if (normalizedEmail.length > 50) {
                return res.status(400).json({
                    success: false,
                    error: 'Email must be 50 characters or less'
                });
            }
            
            const query = `
                SELECT id, real_name, email, password, birthdate, gender, 
                       city_id, country_id, state_id, date_joined, last_login,
                       COALESCE(email_verified, false) as email_verified,
                       COALESCE(is_suspended, false) as is_suspended
                FROM users 
                WHERE LOWER(TRIM(email)) = $1
            `;
            
            const result = await this.db.query(query, [normalizedEmail]);
            
            if (result.rows.length === 0) {
                console.warn('[AuthController.login] No user row for normalized email (check spelling / registration DB)');
                return res.status(401).json({ 
                    success: false, 
                    error: 'Invalid email or password' 
                });
            }
            
            const user = result.rows[0];
            
            // Support legacy non-bcrypt passwords and upgrade them after successful login.
            const storedPassword = String(user.password || '');
            const isBcryptHash = /^\$2[aby]\$/.test(storedPassword);
            let passwordMatch = false;
            let passwordUpgradeFailed = false;

            const plainPassword = typeof password === 'string' ? password : String(password ?? '');

            if (isBcryptHash) {
                passwordMatch = await bcrypt.compare(plainPassword, storedPassword);
            } else {
                passwordMatch = plainPassword === storedPassword;

                if (passwordMatch) {
                    try {
                        const upgradedHash = await bcrypt.hash(plainPassword, 10);
                        await this.db.query('UPDATE users SET password = $1 WHERE id = $2', [upgradedHash, user.id]);
                        user.password = upgradedHash;
                    } catch (upgradeError) {
                        passwordUpgradeFailed = true;
                        console.warn('⚠️ Failed to upgrade legacy password hash for user', user.id, upgradeError.message);
                    }
                }
            }

            if (passwordUpgradeFailed) {
                console.warn(`⚠️ Continuing login for user ${user.id} with legacy password hash still in place`);
            }
            
            if (!passwordMatch) {
                console.warn('[AuthController.login] Password mismatch for user id', user.id);
                return res.status(401).json({ 
                    success: false, 
                    error: 'Invalid email or password' 
                });
            }

            // Check if account is suspended
            if (user.is_suspended) {
                return res.status(403).json({
                    success: false,
                    suspended: true,
                    error: 'Your account has been suspended'
                });
            }
            
            // Check if email is verified (optional - you can make this required)
            // For now, we'll allow login but warn if not verified
            if (!user.email_verified) {
                // You can choose to block login here by returning an error:
                // return res.status(403).json({
                //     success: false,
                //     error: 'Please verify your email address before logging in',
                //     requiresEmailVerification: true
                // });
                
                // Or allow login but include a warning:
                console.log(`⚠️ User ${user.id} logged in with unverified email`);
            }
            
            // Generate session token
            const sessionToken = this.auth.createSession(user);
            
            // Update user login time: save current last_login to previous_login, then update last_login to NOW()
            await this.db.query(
                'UPDATE users SET previous_login = last_login, last_login = NOW() WHERE id = $1',
                [user.id]
            );
            
            // Set HTTP-only cookie (industry standard - secure, no JavaScript access)
            const isProduction = process.env.NODE_ENV === 'production';
            res.cookie('sessionToken', sessionToken, {
                httpOnly: true, // Prevents XSS attacks
                secure: isProduction, // HTTPS only in production
                sameSite: 'strict', // CSRF protection
                maxAge: config.session?.duration || (2 * 60 * 60 * 1000),
                path: '/'
            });
            
            // Remove password from user object before sending
            delete user.password;

            res.json({
                success: true,
                user: user,
                emailVerified: user.email_verified,
                ...(user.email_verified ? {} : {
                    warning: 'Please verify your email address to access all features'
                })
            });
            
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Login failed' 
            });
        }
    }

    async register(req, res) {
        try {
            // Extract only the fields we need, ignore confirmPassword and other extra fields
            const { real_name, email, password, birthdate, gender, country, state, city, age_min, age_max, preferred_gender, location_radius, agree_terms } = req.body;

            const agreeTermsAccepted =
                agree_terms === true ||
                agree_terms === 'true' ||
                agree_terms === 'on' ||
                agree_terms === 1 ||
                agree_terms === '1';
            if (!agreeTermsAccepted) {
                return res.status(400).json({
                    success: false,
                    error: 'You must confirm that you are 18+ and agree to the Terms of Service and Privacy Policy.'
                });
            }
            
            // Use real_name
            const displayName = real_name;
            const normalizedEmail = String(email || '').trim().toLowerCase();

            if (normalizedEmail.length > 50) {
                return res.status(400).json({
                    success: false,
                    error: 'Email must be 50 characters or less'
                });
            }
            
            // Validate required fields
            if (!displayName || !email || !password || !birthdate || !gender || !country) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields'
                });
            }

            const birthdateCheck = validateRegistrationBirthdate(birthdate);
            if (!birthdateCheck.valid) {
                return res.status(400).json({
                    success: false,
                    error: birthdateCheck.error
                });
            }
            
            // Validate real_name format (2-100 characters, letters, spaces, hyphens, apostrophes, periods)
            if (displayName.length < 2 || displayName.length > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Real name must be between 2 and 100 characters'
                });
            }
            
            if (!/^[a-zA-Z]{2,100}$/.test(displayName.trim())) {
                return res.status(400).json({
                    success: false,
                    error: 'Name can only contain letters'
                });
            }

            if (await this.adminBlacklistGate(req, res, normalizedEmail)) {
                return;
            }
            
            // Check if user already exists (only check email, real_name doesn't need to be unique)
            const existingUser = await this.db.query(
                'SELECT id, real_name, email, COALESCE(email_verified, false) AS email_verified FROM users WHERE LOWER(TRIM(email)) = $1',
                [normalizedEmail]
            );
            
            if (existingUser.rows.length > 0) {
                const existing = existingUser.rows[0];

                if (existing.email_verified) {
                    return res.status(400).json({
                        success: false,
                        alreadyRegistered: true,
                        error:
                            'This email is already registered. Use Login with your password, or Forgot password if you need to reset it.'
                    });
                }

                // Same email, still unverified: apply the password from this submission so login matches what they just typed.
                const hashedPasswordForRetry = await bcrypt.hash(String(password), 10);
                await this.db.query('UPDATE users SET password = $1 WHERE id = $2', [
                    hashedPasswordForRetry,
                    existing.id
                ]);

                // Existing but unverified account: regenerate and resend verification email.
                const verificationToken = crypto.randomBytes(32).toString('hex');
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                const supportsVerificationCode = await this.columnExists('email_verification_tokens', 'verification_code');

                await this.db.query(`
                    DELETE FROM email_verification_tokens
                    WHERE user_id = $1
                    AND used_at IS NULL
                `, [existing.id]);

                if (supportsVerificationCode) {
                    await this.db.query(`
                        INSERT INTO email_verification_tokens (user_id, token, verification_code, expires_at)
                        VALUES ($1, $2, $3, $4)
                    `, [existing.id, verificationToken, verificationCode, expiresAt]);
                } else {
                    await this.db.query(`
                        INSERT INTO email_verification_tokens (user_id, token, expires_at)
                        VALUES ($1, $2, $3)
                    `, [existing.id, verificationToken, expiresAt]);
                }

                const resendResult = await emailService.sendVerificationEmail(
                    existing.email,
                    existing.real_name || displayName,
                    verificationToken,
                    supportsVerificationCode ? verificationCode : null
                );

                return res.json({
                    success: true,
                    message: resendResult.success
                        ? 'Account already exists but is not verified. We sent a new verification email.'
                        : 'Account exists but is not verified. We could not send email right now, please use resend verification.',
                    accountExisted: true,
                    accountCreated: false,
                    requiresEmailVerification: true,
                    emailDispatch: {
                        success: Boolean(resendResult.success),
                        provider: resendResult.provider || null,
                        error: resendResult.error || null
                    },
                    user: {
                        id: existing.id,
                        real_name: existing.real_name,
                        email: existing.email,
                        email_verified: false
                    }
                });
            }
            
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Prepare values for insertion - ensure all are properly typed
            const countryId = country ? parseInt(country) : null;
            const stateId = state ? parseInt(state) : null;
            const cityId = city ? parseInt(city) : null;
            
            // Log the values being inserted for debugging
            console.log('Inserting user with values:', {
                real_name: displayName,
                email: normalizedEmail,
                passwordLength: hashedPassword.length,
                birthdate,
                gender,
                countryId,
                stateId,
                cityId
            });
            
            // Insert new user with location data - email_verified defaults to false
            const result = await this.db.query(`
                INSERT INTO users (real_name, email, password, birthdate, gender, country_id, state_id, city_id, email_verified)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
                RETURNING id, real_name, email, birthdate, gender, country_id, state_id, city_id, date_joined, email_verified
            `, [
                displayName.trim(), // real_name
                normalizedEmail,
                hashedPassword, 
                birthdate, 
                gender, 
                countryId, 
                stateId, 
                cityId
            ]);
            
            const newUser = result.rows[0];
            
            // Create user_preferences record with age preferences and other settings
            try {
                const ageMin = age_min ? parseInt(age_min) : null;
                const ageMax = age_max ? parseInt(age_max) : null;
                const preferredGender = preferred_gender || null;
                const locationRadius = location_radius ? parseInt(location_radius) : null;
                
                await this.db.query(`
                    INSERT INTO user_preferences (user_id, age_min, age_max, preferred_gender, location_radius)
                    VALUES ($1, $2, $3, $4, $5)
                `, [newUser.id, ageMin, ageMax, preferredGender, locationRadius]);
                
                console.log('✅ Created user_preferences for user:', newUser.id, {
                    age_min: ageMin,
                    age_max: ageMax,
                    preferred_gender: preferredGender,
                    location_radius: locationRadius
                });
            } catch (prefError) {
                console.error('⚠️ Error creating user_preferences:', prefError.message);
                // Continue with registration even if preferences creation fails
                // User can set preferences later
            }
            
            // Generate email verification token and code
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
            const supportsVerificationCode = await this.columnExists('email_verification_tokens', 'verification_code');
            
            // Store verification token and code in database
            let emailDispatch = { success: true, provider: null, error: null };
            try {
                if (supportsVerificationCode) {
                    await this.db.query(`
                        INSERT INTO email_verification_tokens (user_id, token, verification_code, expires_at)
                        VALUES ($1, $2, $3, $4)
                    `, [newUser.id, verificationToken, verificationCode, expiresAt]);
                } else {
                    await this.db.query(`
                        INSERT INTO email_verification_tokens (user_id, token, expires_at)
                        VALUES ($1, $2, $3)
                    `, [newUser.id, verificationToken, expiresAt]);
                }
                
                // Send verification email with a code only when the database supports it.
                const emailResult = await emailService.sendVerificationEmail(
                    normalizedEmail,
                    displayName, // Use real_name for email
                    verificationToken,
                    supportsVerificationCode ? verificationCode : null
                );
                emailDispatch = {
                    success: Boolean(emailResult.success),
                    provider: emailResult.provider || null,
                    error: emailResult.error || null
                };
                
                if (!emailResult.success) {
                    console.warn('⚠️ Failed to send verification email:', emailResult.error);
                    // Continue with registration even if email fails
                }
            } catch (tokenError) {
                console.error('❌ Error creating verification token:', tokenError);
                // If token creation fails, we still want to complete registration
                // The user can request a new verification email later
            }
            
            // Don't auto-login - user needs to verify email first
            // But we can still return success so they know registration worked
            res.json({
                success: true,
                message: emailDispatch.success
                    ? 'Registration successful! Please check your email to verify your account.'
                    : 'Registration successful, but we could not send the verification email right now. Please use resend verification.',
                accountExisted: false,
                accountCreated: true,
                requiresEmailVerification: true,
                emailDispatch,
                user: {
                    id: newUser.id,
                    real_name: newUser.real_name,
                    email: newUser.email,
                    email_verified: newUser.email_verified
                }
            });
            
        } catch (error) {
            console.error('Registration error:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                detail: error.detail,
                hint: error.hint,
                position: error.position
            });
            res.status(500).json({ 
                success: false, 
                error: 'Registration failed',
                message: error.message || 'Internal server error'
            });
        }
    }

    async logout(req, res) {
        try {
            const userId = req.session?.userId || req.body?.userId;
            const sessionToken = req.cookies?.sessionToken || req.cookies?.session;
            
            // Remove auth session token if present
            if (sessionToken && this.auth?.sessions instanceof Map) {
                this.auth.sessions.delete(sessionToken);
            }
            
            // Update database session status if userId available
            if (userId) {
                try {
                    // Deactivate ALL sessions for this user and set last_activity to NOW
                    const result = await this.db.query(
                        'UPDATE user_sessions SET is_active = false, last_activity = NOW() WHERE user_id = $1',
                        [userId]
                    );
                    
                    console.log(`🔴 User ${userId} logged out - ${result.rowCount} session(s) marked inactive`);
                    
                    // Broadcast offline status via WebSocket
                    if (global.io) {
                        global.io.emit('userOffline', {
                            userId: userId,
                            timestamp: Date.now()
                        });
                        global.io.emit('user_offline', {
                            userId: userId,
                            timestamp: Date.now()
                        });
                    }
                } catch (dbError) {
                    console.warn('⚠️ Database logout update failed:', dbError.message);
                }
            }
            
            // Destroy express-session if present, then clear cookies in all cases.
            if (req.session && typeof req.session.destroy === 'function') {
                req.session.destroy((err) => {
                    if (err) {
                        console.error('❌ Session destroy error:', err);
                    }
                    res.clearCookie('sessionToken');
                    res.clearCookie('auth.sid');
                    res.json({ success: true, message: 'Logged out successfully' });
                });
            } else {
                res.clearCookie('sessionToken');
                res.clearCookie('auth.sid');
                res.json({ success: true, message: 'Logged out successfully' });
            }
            
        } catch (error) {
            console.error('❌ Logout error:', error);
            // Still try to clear cookie and destroy session
            try {
                if (req.session) req.session.destroy(() => {});
                res.clearCookie('sessionToken');
                res.clearCookie('auth.sid');
            } catch (e) {}
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async searchUsers(req, res) {
        try {
            await ensureAccountStatusSchema(this.db);

            const {
                ageMin, ageMax, gender, location, 
                onlineStatus, withImages, withPhotos, page = 1, limit,
                sortBy = 'relevance', distance, verified, recentlyActive, onlineNow,
                education, occupation, income, smoking, drinking, children,
                heightMin, heightMax, heightFtMin, heightFtMax, heightInMin, heightInMax,
                bodyType, ethnicity, interests, exercise,
                maritalStatus, lifestyle, bodyArt, englishAbility,
                usePreferredCountries, relocation, weightMin, weightMax
            } = req.query;

            const toIntInRange = (value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
                if (value === undefined || value === null || value === '') {
                    return null;
                }
                const parsed = Number.parseInt(String(value).trim(), 10);
                if (!Number.isInteger(parsed)) {
                    return null;
                }
                if (parsed < min || parsed > max) {
                    return null;
                }
                return parsed;
            };

            const normalizeIdFilter = (value) => {
                if (value === undefined || value === null) {
                    return null;
                }
                const normalized = String(value).trim().toLowerCase();
                if (!normalized || normalized === 'any') {
                    return null;
                }
                const parsed = Number.parseInt(normalized, 10);
                return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
            };

            const normalizedPage = toIntInRange(page, 1, 100000) || 1;
            const normalizedLimit = toIntInRange(limit, 1, 100);
            const normalizedAgeMin = toIntInRange(ageMin, 18, 100);
            const normalizedAgeMax = toIntInRange(ageMax, 18, 100);
            const normalizedHeightMin = toIntInRange(heightMin, 80, 260);
            const normalizedHeightMax = toIntInRange(heightMax, 80, 260);
            const normalizedWeightMin = toIntInRange(weightMin, 30, 300);
            const normalizedWeightMax = toIntInRange(weightMax, 30, 300);
            const normalizedHeightFtMin = toIntInRange(heightFtMin, 2, 8);
            const normalizedHeightFtMax = toIntInRange(heightFtMax, 2, 8);
            const normalizedHeightInMin = toIntInRange(heightInMin, 0, 11);
            const normalizedHeightInMax = toIntInRange(heightInMax, 0, 11);

            const normalizedEducation = normalizeIdFilter(education);
            const normalizedOccupation = normalizeIdFilter(occupation);
            const normalizedIncome = normalizeIdFilter(income);
            const normalizedSmoking = normalizeIdFilter(smoking);
            const normalizedDrinking = normalizeIdFilter(drinking);
            const normalizedChildren = normalizeIdFilter(children);
            const normalizedBodyType = normalizeIdFilter(bodyType);
            const normalizedEthnicity = normalizeIdFilter(ethnicity);
            const normalizedExercise = normalizeIdFilter(exercise);
            const normalizedMaritalStatus = normalizeIdFilter(maritalStatus);
            const normalizedLifestyle = normalizeIdFilter(lifestyle);
            const normalizedBodyArt = normalizeIdFilter(bodyArt);
            const normalizedEnglishAbility = normalizeIdFilter(englishAbility);
            const normalizedRelocation = normalizeIdFilter(relocation);

            const normalizedLocation = typeof location === 'string' ? location.trim().slice(0, 120) : '';
            
            const currentUserId = req.query.userId || req.headers['x-user-id'];
            
            if (!currentUserId) {
                return res.status(401).json({ error: 'User ID required' });
            }
            
            // Get user preferences from database
            let userPreferences = null;
            let userContactCountries = [];
            let userAcceptsAllCountries = false;
            
            try {
                const preferencesResult = await this.db.query(`
                    SELECT age_min, age_max, preferred_gender, location_radius, preferred_countries
                    FROM user_preferences 
                    WHERE user_id = $1
                `, [currentUserId]);
                
                if (preferencesResult.rows.length > 0) {
                    userPreferences = preferencesResult.rows[0];
                }
                
                // Get user's contact countries preferences
                const contactCountriesResult = await this.db.query(`
                    SELECT country_id, is_all_countries
                    FROM user_contact_countries 
                    WHERE user_id = $1
                `, [currentUserId]);
                
                if (contactCountriesResult.rows.length > 0) {
                    userContactCountries = contactCountriesResult.rows.map(row => row.country_id).filter(id => id !== null);
                    userAcceptsAllCountries = contactCountriesResult.rows.some(row => row.is_all_countries);
                }
            } catch (prefError) {
                console.log('⚠️ Could not load user preferences:', prefError.message);
            }
            
            // Get user's same-gender contact preference
            let userNoSameGenderContact = true; // Default to true (block same gender)
            try {
                const sameGenderResult = await this.db.query(`
                    SELECT no_same_gender_contact
                    FROM user_profile_settings 
                    WHERE user_id = $1
                `, [currentUserId]);
                
                if (sameGenderResult.rows.length > 0) {
                    userNoSameGenderContact = sameGenderResult.rows[0].no_same_gender_contact;
                }
            } catch (sameGenderError) {
                console.log('⚠️ Could not load same-gender contact preference:', sameGenderError.message);
            }
            
            // Try to get cached results first (ULTRA-FAST)
            try {
                // Note: Redis caching would be implemented here if Redis is available
                console.log('Cache miss, executing optimized search');
            } catch (cacheError) {
                console.log('Cache miss, executing optimized search');
            }
            
            // ULTRA-OPTIMIZED query with minimal joins and better indexing
            let query = `
                SELECT 
                    u.id,
                    u.real_name,
                    u.email,
                    u.birthdate,
                    u.gender,
                    u.date_joined,
                    u.last_login,
                    c.name as country_name,
                    c.emoji as country_emoji,
                    st.name as state_name,
                    ci.name as city_name,
                    ua.occupation,
                    ui.file_name as profile_image,
                    EXTRACT(YEAR FROM AGE(u.birthdate)) as age,     
                    CASE
                        WHEN us.is_active = true AND us.last_activity > NOW() - INTERVAL '2 minutes' THEN true
                        ELSE false
                    END as is_online
                FROM users u
                LEFT JOIN country c ON u.country_id = c.id
                LEFT JOIN state st ON u.state_id = st.id
                LEFT JOIN city ci ON u.city_id = ci.id
                LEFT JOIN user_attributes ua ON u.id = ua.user_id
                LEFT JOIN LATERAL (
                    SELECT ui_choice.file_name
                    FROM user_images ui_choice
                    WHERE ui_choice.user_id = u.id
                      AND ui_choice.file_name IS NOT NULL
                      AND ui_choice.approval_status = 'approved'
                    ORDER BY
                        CASE
                            WHEN ui_choice.is_profile = 1 THEN 0
                            WHEN ui_choice.featured = 1 THEN 1
                            ELSE 2
                        END,
                        ui_choice.uploaded_at DESC NULLS LAST,
                        ui_choice.id DESC
                    LIMIT 1
                ) ui ON true
                LEFT JOIN user_sessions us ON u.id = us.user_id AND us.is_active = true
                WHERE u.id != $1 AND u.real_name IS NOT NULL
                AND COALESCE(u.account_status, 'active') = 'active'
                AND COALESCE(u.is_suspended, false) = false
            `;
            
            const queryParams = [currentUserId];
            let paramIndex = 2;
            
            // Apply filters with optimized conditions
            // Use search parameters if provided, otherwise use user preferences
            const preferredAgeMin = userPreferences ? toIntInRange(userPreferences.age_min, 18, 100) : null;
            const preferredAgeMax = userPreferences ? toIntInRange(userPreferences.age_max, 18, 100) : null;
            const effectiveAgeMin = normalizedAgeMin ?? preferredAgeMin;
            const effectiveAgeMax = normalizedAgeMax ?? preferredAgeMax;
            // Use provided gender or fall back to user preferences
            const effectiveGender = gender || (userPreferences ? userPreferences.preferred_gender : 'male');
            
            
            if (effectiveAgeMin !== null) {
                query += ` AND EXTRACT(YEAR FROM AGE(u.birthdate)) >= $${paramIndex}`;
                queryParams.push(effectiveAgeMin);
                paramIndex++;
            }
            
            if (effectiveAgeMax !== null) {
                query += ` AND EXTRACT(YEAR FROM AGE(u.birthdate)) <= $${paramIndex}`;
                queryParams.push(effectiveAgeMax);
                paramIndex++;
            }
            
            if (effectiveGender) {
                // Map frontend gender values to database values (normalized to lowercase)
                let dbGender = effectiveGender;
                const genderLower = (effectiveGender || '').toLowerCase().trim();
                if (genderLower === 'male' || genderLower === 'm') {
                    dbGender = 'male';
                } else if (genderLower === 'female' || genderLower === 'f') {
                    dbGender = 'female';
                }
                
                query += ` AND LOWER(TRIM(u.gender)) = $${paramIndex}`;
                queryParams.push(dbGender.toLowerCase());
                paramIndex++;
            }
            
            // Apply same-gender contact restriction
            if (userNoSameGenderContact) {
                // Get current user's gender to exclude same gender users
                const currentUserGenderResult = await this.db.query(`
                    SELECT gender FROM users WHERE id = $1
                `, [currentUserId]);
                
                if (currentUserGenderResult.rows.length > 0) {
                    const currentUserGender = currentUserGenderResult.rows[0].gender;
                    query += ` AND u.gender != $${paramIndex}`;
                    queryParams.push(currentUserGender);
                    paramIndex++;
                }
            }
            
            if (normalizedLocation) {
                query += ` AND (c.name ILIKE $${paramIndex} OR st.name ILIKE $${paramIndex} OR ci.name ILIKE $${paramIndex})`;
                queryParams.push(`%${normalizedLocation}%`);
                paramIndex++;
            }
            
            if (onlineStatus === 'online' || onlineNow === 'true') {
                query += ` AND us.is_active = true AND us.last_activity > NOW() - INTERVAL '2 minutes'`;
            }
            
            if (withPhotos === 'true' || withImages === 'true') {
                query += ` AND EXISTS (
                    SELECT 1 FROM user_images ui2 
                    WHERE ui2.user_id = u.id 
                    AND ui2.file_name IS NOT NULL
                )`;
            } else if (withPhotos === 'false' || withImages === 'false') {
                query += ` AND NOT EXISTS (
                    SELECT 1 FROM user_images ui2 
                    WHERE ui2.user_id = u.id 
                    AND ui2.file_name IS NOT NULL
                )`;
            }
            
            // Additional filters for user attributes
            
            if (recentlyActive === 'true') {
                query += ` AND u.last_login > NOW() - INTERVAL '7 days'`;
            }
            
            // Note: verified filter is not implemented as there's no verification field in the users table
            // This would need to be added to the database schema first
            if (verified === 'true') {
                console.log('⚠️ Verified profiles filter requested but not implemented - no verification field in database');
                // Since there's no verification field, return no results when this filter is requested
                query += ` AND 1 = 0`; // This will always be false, returning no results
            }
            
          
            if (normalizedEducation !== null) {
                query += ` AND ua.education_id = $${paramIndex}`;
                queryParams.push(normalizedEducation);
                paramIndex++;
            }

            if (normalizedOccupation !== null) {
                query += ` AND ua.occupation_category_id = $${paramIndex}`;
                queryParams.push(normalizedOccupation);
                paramIndex++;
            }

            if (normalizedIncome !== null) {
                query += ` AND ua.income_id = $${paramIndex}`;
                queryParams.push(normalizedIncome);
                paramIndex++;
            }

            if (normalizedSmoking !== null) {
                query += ` AND ua.smoking_id = $${paramIndex}`;
                queryParams.push(normalizedSmoking);
                paramIndex++;
            }

            if (normalizedDrinking !== null) {
                query += ` AND ua.drinking_id = $${paramIndex}`;
                queryParams.push(normalizedDrinking);
                paramIndex++;
            }

            if (normalizedChildren !== null) {
                query += ` AND ua.living_situation_id = $${paramIndex}`;
                queryParams.push(normalizedChildren);
                paramIndex++;
            }

            if (normalizedHeightMin !== null) {
                query += ` AND ua.height_cm >= $${paramIndex}`;
                queryParams.push(normalizedHeightMin);
                paramIndex++;
            }

            if (normalizedHeightMax !== null) {
                query += ` AND ua.height_cm <= $${paramIndex}`;
                queryParams.push(normalizedHeightMax);
                paramIndex++;
            }

            if (normalizedBodyType !== null) {
                query += ` AND ua.body_type_id = $${paramIndex}`;
                queryParams.push(normalizedBodyType);
                paramIndex++;
            }

            if (normalizedEthnicity !== null) {
                query += ` AND ua.ethnicity_id = $${paramIndex}`;
                queryParams.push(normalizedEthnicity);
                paramIndex++;
            }

          
            if (normalizedExercise !== null) {
                query += ` AND ua.exercise_habits_id = $${paramIndex}`;
                queryParams.push(normalizedExercise);
                paramIndex++;
            }

            if (normalizedMaritalStatus !== null) {
                query += ` AND ua.marital_status_id = $${paramIndex}`;
                queryParams.push(normalizedMaritalStatus);
                paramIndex++;
            }

            if (normalizedLifestyle !== null) {
                query += ` AND ua.lifestyle_id = $${paramIndex}`;
                queryParams.push(normalizedLifestyle);
                paramIndex++;
            }

            if (normalizedBodyArt !== null) {
                query += ` AND ua.body_art_id = $${paramIndex}`;
                queryParams.push(normalizedBodyArt);
                paramIndex++;
            }

            if (normalizedEnglishAbility !== null) {
                query += ` AND ua.english_ability_id = $${paramIndex}`;
                queryParams.push(normalizedEnglishAbility);
                paramIndex++;
            }

            if (normalizedRelocation !== null) {
                query += ` AND ua.relocation_id = $${paramIndex}`;
                queryParams.push(normalizedRelocation);
                paramIndex++;
            }

          
                if (normalizedWeightMin !== null) {
                    query += ` AND ua.weight_kg >= $${paramIndex}`;
                    queryParams.push(normalizedWeightMin);
                    paramIndex++;
                }

            if (normalizedWeightMax !== null) {
                query += ` AND ua.weight_kg <= $${paramIndex}`;
                queryParams.push(normalizedWeightMax);
                paramIndex++;
            }

            // Height in feet / inches(if needed):
            if (normalizedHeightFtMin !== null) {
                    query += ` AND ua.height_ft >= $${paramIndex}`;
                    queryParams.push(normalizedHeightFtMin);
                    paramIndex++;
                }

            if (normalizedHeightFtMax !== null) {
                query += ` AND ua.height_ft <= $${paramIndex}`;
                queryParams.push(normalizedHeightFtMax);
                paramIndex++;
            }

            if (normalizedHeightInMin !== null) {
                query += ` AND ua.height_in >= $${paramIndex}`;
                queryParams.push(normalizedHeightInMin);
                paramIndex++;
            }

            if (normalizedHeightInMax !== null) {
                query += ` AND ua.height_in <= $${paramIndex}`;
                queryParams.push(normalizedHeightInMax);
                paramIndex++;
            }

            
            // Filter by user's contact countries preferences (only if usePreferredCountries is true)
            const shouldUsePreferredCountries = usePreferredCountries === 'true';
            
            console.log(`🌍 Country filtering: usePreferredCountries=${usePreferredCountries}, shouldUse=${shouldUsePreferredCountries}`);
            
            if (shouldUsePreferredCountries) {
                if (!userAcceptsAllCountries && userContactCountries.length > 0) {
                    query += ` AND u.country_id = ANY($${paramIndex})`;
                    queryParams.push(userContactCountries);
                    paramIndex++;
                    console.log(`🌍 Filtering by user's preferred countries:`, userContactCountries);
                }
                
                // Only apply mutual country preference if the current user has specific country preferences
                // If current user accepts all countries, don't restrict by mutual preferences
                if (!userAcceptsAllCountries) {
                    // Get current user's country
                    const currentUserCountryResult = await this.db.query(`
                        SELECT country_id FROM users WHERE id = $1
                    `, [currentUserId]);
                    
                    if (currentUserCountryResult.rows.length > 0 && currentUserCountryResult.rows[0].country_id) {
                        const currentUserCountryId = currentUserCountryResult.rows[0].country_id;
                        
                        // Check if potential matches are willing to contact the current user's country
                        // If a user has no contact preferences set, assume they accept all countries
                        query += ` AND (
                            NOT EXISTS (SELECT 1 FROM user_contact_countries ucc WHERE ucc.user_id = u.id)
                            OR EXISTS (
                                SELECT 1 FROM user_contact_countries ucc 
                                WHERE ucc.user_id = u.id 
                                AND (ucc.is_all_countries = true OR ucc.country_id = $${paramIndex})
                            )
                        )`;
                        queryParams.push(currentUserCountryId);
                        paramIndex++;
                        console.log(`🌍 Filtering by mutual country preferences. Current user country:`, currentUserCountryId);
                    }
                } else {
                    console.log(`🌍 Current user accepts all countries - skipping mutual preference check`);
                }
            } else {
                console.log(`🌍 Skipping country preference filtering (usePreferredCountries: false)`);
            }
            
            // ULTRA-FAST sorting with optimized ORDER BY
            switch (sortBy) {
                case 'age':
                    query += ` ORDER BY EXTRACT(YEAR FROM AGE(u.birthdate))`;
                    break;
                case 'newest':
                    query += ` ORDER BY u.date_joined DESC`;
                    break;
                case 'oldest':
                    query += ` ORDER BY u.date_joined ASC`;
                    break;
                case 'online':
                    query += ` ORDER BY u.last_login DESC NULLS LAST`;
                    break;
                default: // relevance - optimized for speed
                    query += ` ORDER BY u.last_login DESC NULLS LAST, u.date_joined DESC`;
            }
            
            // Add pagination - use limit if provided, otherwise get all results
            if (normalizedLimit !== null) {
                const offset = (normalizedPage - 1) * normalizedLimit;
                query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
                queryParams.push(normalizedLimit, offset);
                console.log(`🔍 Applying limit: ${normalizedLimit}, offset: ${offset}`);
            } else {
                console.log(`🔍 No limit specified - returning all results`);
            }
            
            const startTime = Date.now();
            console.log(`🔍 Final query:`, query);
            console.log(`🔍 Query params:`, queryParams);
            const searchResult = await this.db.query(query, queryParams);
            const queryTime = Date.now() - startTime;
            
            console.log(`⚡ Search query executed in ${queryTime}ms`);
            
            // Get interests for all users in one query
            const userIds = searchResult.rows.map(user => user.id);
            let interestsMap = {};
            
            if (userIds.length > 0) {
                try {
                    const interestsQuery = `
                        SELECT ui.user_id, i.name, i.icon
                        FROM user_interests ui
                        JOIN interests i ON ui.interest_id = i.id
                        WHERE ui.user_id = ANY($1)
                        ORDER BY ui.user_id, i.name
                    `;
                    
                    const interestsResult = await this.db.query(interestsQuery, [userIds]);
                    
                    // Group interests by user_id
                    interestsResult.rows.forEach(row => {
                        if (!interestsMap[row.user_id]) {
                            interestsMap[row.user_id] = [];
                        }
                        interestsMap[row.user_id].push({
                            name: row.name,
                            icon: row.icon || 'fa-star'
                        });
                    });
                } catch (interestsError) {
                    console.log('⚠️ Could not load interests:', interestsError.message);
                }
            }
            
            // ULTRA-FAST response formatting
            // NOTE: online status comes from active-session heartbeat in this query.
            const formattedResults = searchResult.rows.map(user => {
                // Get user's interests
                const userInterests = interestsMap[user.id] || [];
                
                // Generate a more realistic about text if none exists
                let aboutText = user.occupation ? `Works as ${user.occupation}` : 'No bio available';
                
                // Fix profile image path
                let profileImage = null;
                if (user.profile_image) {
                    // Remove any leading slashes or uploads/ prefix if already present
                    const cleanImageName = user.profile_image.replace(/^\/?uploads\/profile_images\//, '');
                    profileImage = cleanImageName;
                }
                
                return {
                    id: user.id,
                    name: user.real_name || `User${user.id}`,
                    real_name: user.real_name || `User${user.id}`,
                    age: user.age || 0,
                    gender: user.gender || null,
                    location: [user.city_name, user.state_name, user.country_name]
                        .filter(Boolean)
                        .join(', ') || 'Location not specified',
                    interests: userInterests,
                    online: user.is_online || false,
                    profile_image: profileImage,
                    about: aboutText,
                    occupation: user.occupation || null,
                    country_emoji: user.country_emoji || null,
                    last_active: user.is_online ? 'Online now' : 'Recently active'
                };
            });
            
            console.log(`✅ Search completed: ${formattedResults.length} results found in ${queryTime}ms`);
            console.log(`🚀 PERFORMANCE: Optimized search query (removed user_sessions JOIN) - ${queryTime}ms for ${formattedResults.length} users`);
            
            const response = {
                success: true,
                results: formattedResults,
                total: formattedResults.length,
                page: normalizedPage,
                limit: normalizedLimit,
                performance: {
                    queryTime: queryTime,
                    cached: false
                }
            };
            
            res.json(response);
            
        } catch (error) {
            console.error('❌ Search API error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Search failed',
                details: error.message 
            });
        }
    }

    // Get detailed online status for multiple users efficiently
    async getUsersOnlineStatus(req, res) {
        try {
            const { userIds } = req.body;
            
            if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User IDs array is required' 
                });
            }

            // Limit to prevent abuse
            const limitedUserIds = userIds.slice(0, 100);
            
            // First cleanup old sessions
            await this.db.query(`
                UPDATE user_sessions 
                SET is_active = false 
                WHERE last_activity < NOW() - INTERVAL '2 minutes'
            `);
            
            const query = `
                SELECT 
                    u.id,
                    u.real_name,
                    u.last_login,
                    us.is_active as session_active,
                    us.last_activity,
                    CASE
                        WHEN us.is_active = true AND us.last_activity > NOW() - INTERVAL '2 minutes' THEN true
                        ELSE false
                    END as is_online,
                    CASE
                        WHEN us.last_activity IS NOT NULL THEN us.last_activity
                        ELSE u.last_login
                    END as last_seen
                FROM users u
                LEFT JOIN user_sessions us ON u.id = us.user_id AND us.is_active = true
                WHERE u.id = ANY($1)
            `;
            
            const result = await this.db.query(query, [limitedUserIds]);

            let presenceMap = {};
            if (
                this.presenceService &&
                typeof this.presenceService.isEnabled === 'function' &&
                this.presenceService.isEnabled() &&
                typeof this.presenceService.getStatuses === 'function'
            ) {
                try {
                    const fetched = await this.presenceService.getStatuses(limitedUserIds);
                    if (fetched && typeof fetched === 'object') {
                        presenceMap = fetched;
                    }
                } catch (presenceError) {
                    console.warn('⚠️ getUsersOnlineStatus: presence merge skipped:', presenceError.message);
                }
            }

            const statusMap = {};
            result.rows.forEach(user => {
                const uid = Number(user.id);
                const presenceEntry =
                    presenceMap && Number.isFinite(uid) ? presenceMap[uid] || presenceMap[String(uid)] : null;

                let lastSeenTime = user.last_activity || user.last_login;
                let isOnline = user.is_online;

                if (presenceEntry && typeof presenceEntry.isOnline === 'boolean') {
                    isOnline = presenceEntry.isOnline;
                    if (presenceEntry.lastSeen != null) {
                        lastSeenTime = presenceEntry.lastSeen;
                    }
                }

                statusMap[user.id] = {
                    userId: user.id,
                    real_name: user.real_name,
                    isOnline,
                    lastLogin: user.last_login,
                    lastActivity: user.last_activity,
                    lastSeen: lastSeenTime,
                    sessionActive: user.session_active,
                    timestamp: Date.now()
                };
            });

            res.json({
                success: true,
                statuses: statusMap,
                total: result.rows.length
            });
            
        } catch (error) {
            console.error('❌ Get users online status error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get users online status',
                details: error.message 
            });
        }
    }

    getCountryEmoji(country) {
        // Simple country to emoji mapping
        const countryEmojis = {
            'US': '🇺🇸',
            'CA': '🇨🇦',
            'GB': '🇬🇧',
            'AU': '🇦🇺',
            'DE': '🇩🇪',
            'FR': '🇫🇷',
            'ES': '🇪🇸',
            'IT': '🇮🇹',
            'JP': '🇯🇵',
            'KR': '🇰🇷',
            'CN': '🇨🇳',
            'IN': '🇮🇳',
            'BR': '🇧🇷',
            'MX': '🇲🇽',
            'AR': '🇦🇷',
            'CL': '🇨🇱',
            'CO': '🇨🇴',
            'PE': '🇵🇪',
            'VE': '🇻🇪',
            'EC': '🇪🇨'
        };
        return countryEmojis[country] || '🌍';
    }

    async getSettings(req, res) {
        try {
            const userId = req.query.userId || req.headers['x-user-id'];
            
            if (!userId) {
                return res.status(400).json({ error: 'User ID required' });
            }

            console.log('🔧 Loading settings for user:', userId);

            // Get user profile settings
            const profileSettingsResult = await this.db.query(`
                SELECT profile_visibility, email_notifications, show_online_status, 
                       contact_age_min, contact_age_max, require_photos, messages_per_day,
                       no_same_gender_contact, notify_new_messages, notify_profile_views,
                       show_last_active, verified_profiles_only
                FROM user_profile_settings 
                WHERE user_id = $1
            `, [userId]);

            // Get user contact countries with country details
            const contactCountriesResult = await this.db.query(`
                SELECT ucc.country_id, c.name, c.emoji
                FROM user_contact_countries ucc
                JOIN country c ON ucc.country_id = c.id
                WHERE ucc.user_id = $1
                ORDER BY c.name ASC
            `, [userId]);

            // Get all countries for the dropdown
            const allCountriesResult = await this.db.query(`
                SELECT id, name, emoji
                FROM country 
                ORDER BY name ASC
            `);

            // Format contact countries for frontend
            const contactCountries = contactCountriesResult.rows.map(row => ({
                id: row.country_id,
                name: row.name,
                emoji: row.emoji
            }));

            // Get profile settings or use defaults
            const profileSettings = profileSettingsResult.rows[0] || {
                profile_visibility: 'public',
                email_notifications: true,
                show_online_status: true,
                contact_age_min: 18,
                contact_age_max: 65,
                require_photos: false,
                messages_per_day: 50,
                no_same_gender_contact: true,
                notify_new_messages: true,
                notify_profile_views: false,
                show_last_active: true,
                verified_profiles_only: false
            };

            console.log('📋 Settings loaded:', {
                profileSettings: profileSettings,
                contactCountriesCount: contactCountries.length,
                allCountriesCount: allCountriesResult.rows.length
            });

            res.json({
                success: true,
                settings: {
                    ...profileSettings,
                    contact_countries: contactCountries,
                    all_countries: allCountriesResult.rows
                }
            });

        } catch (error) {
            console.error('❌ Get settings error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get settings',
                details: error.message 
            });
        }
    }

    async updateSettings(req, res) {
        try {
            const userId = req.body.userId || req.headers['x-user-id'];
            
            if (!userId) {
                return res.status(400).json({ error: 'User ID required' });
            }

            const { preferences, contactCountries } = req.body;

            // Update preferences
            if (preferences) {
                await this.db.query(`
                    INSERT INTO user_preferences (user_id, age_min, age_max, preferred_gender, location_radius, preferred_countries)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (user_id) DO UPDATE SET
                        age_min = EXCLUDED.age_min,
                        age_max = EXCLUDED.age_max,
                        preferred_gender = EXCLUDED.preferred_gender,
                        location_radius = EXCLUDED.location_radius,
                        preferred_countries = EXCLUDED.preferred_countries
                `, [userId, preferences.age_min, preferences.age_max, preferences.preferred_gender, preferences.location_radius, preferences.preferred_countries]);
            }

            // Update contact countries
            if (contactCountries) {
                // Delete existing contact countries
                await this.db.query(`DELETE FROM user_contact_countries WHERE user_id = $1`, [userId]);
                
                // Insert new contact countries
                for (const country of contactCountries) {
                    await this.db.query(`
                        INSERT INTO user_contact_countries (user_id, country_id, is_all_countries)
                        VALUES ($1, $2, $3)
                    `, [userId, country.country_id, country.is_all_countries]);
                }
            }

            res.json({ success: true, message: 'Settings updated successfully' });

        } catch (error) {
            console.error('❌ Update settings error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update settings',
                details: error.message 
            });
        }
    }

    async updateSettingsBulk(req, res) {
        try {
            const userId = req.body.userId || req.query.userId || req.headers['x-user-id'];
            
            if (!userId) {
                return res.status(400).json({ error: 'User ID required' });
            }

            const { settings } = req.body;

            if (!settings || typeof settings !== 'object') {
                return res.status(400).json({ error: 'Settings object required' });
            }

            console.log('💾 Bulk settings update for user:', userId);
            console.log('📋 Settings received:', settings);
            console.log('🔍 Profile visibility value:', settings.profile_visibility, typeof settings.profile_visibility);

            // Start transaction
            await this.db.query('BEGIN');

            try {
                // Handle profile settings
                            if (settings.profile_visibility !== undefined || 
                settings.email_notifications !== undefined || 
                settings.show_online_status !== undefined ||
                settings.contact_age_min !== undefined ||
                settings.contact_age_max !== undefined ||
                settings.require_photos !== undefined ||
                settings.messages_per_day !== undefined ||
                settings.no_same_gender_contact !== undefined ||
                settings.notify_new_messages !== undefined ||
                settings.notify_profile_views !== undefined ||
                settings.show_last_active !== undefined ||
                settings.verified_profiles_only !== undefined) {
                    
                    console.log('📝 Updating profile settings...');
                    
                    // Validate and sanitize profile_visibility
                    // Always ensure we have a valid value to prevent constraint violations
                    // Valid values must match database constraint: 'public', 'private', or 'friends'
                    const validVisibilityValues = ['public', 'private', 'friends'];
                    const isProfileVisibilityProvided = settings.profile_visibility !== undefined;
                    let profileVisibility = settings.profile_visibility;
                    
                    console.log('🔍 Profile visibility processing:', {
                        provided: isProfileVisibilityProvided,
                        rawValue: profileVisibility,
                        type: typeof profileVisibility
                    });
                    
                    // If profile_visibility is provided, validate and sanitize it
                    if (isProfileVisibilityProvided) {
                        // Handle null, undefined, or non-string values
                        if (profileVisibility == null || typeof profileVisibility !== 'string') {
                            console.log(`⚠️ Profile visibility is null or not a string: "${profileVisibility}", defaulting to 'public'`);
                            profileVisibility = 'public';
                        } else {
                            // Trim whitespace and convert to lowercase for comparison
                            profileVisibility = profileVisibility.trim().toLowerCase();
                            
                            // Validate: must be a non-empty string and in the valid list
                            if (!profileVisibility || !validVisibilityValues.includes(profileVisibility)) {
                                console.log(`⚠️ Invalid profile_visibility value: "${settings.profile_visibility}" -> "${profileVisibility}", defaulting to 'public'`);
                                profileVisibility = 'public';
                            }
                        }
                    } else {
                        // Not provided, use default
                        profileVisibility = 'public';
                    }
                    
                    // Final validation: ensure we always have a valid value for INSERT
                    // For UPDATE, we'll only update if it was provided
                    let finalProfileVisibility = 'public';
                    if (isProfileVisibilityProvided && profileVisibility && validVisibilityValues.includes(profileVisibility)) {
                        finalProfileVisibility = profileVisibility;
                    }
                    
                    // Ultimate safety check: ensure finalProfileVisibility is always valid
                    if (!finalProfileVisibility || !validVisibilityValues.includes(finalProfileVisibility)) {
                        console.log(`🚨 CRITICAL: finalProfileVisibility is invalid: "${finalProfileVisibility}", forcing to 'public'`);
                        finalProfileVisibility = 'public';
                    }
                    
                    console.log('✅ Final profile visibility value:', finalProfileVisibility, 'isValid:', validVisibilityValues.includes(finalProfileVisibility));
                    
                    // Build parameters array with validated values
                    const queryParams = [
                        userId,
                        finalProfileVisibility, // $2 - Always a valid value
                        settings.email_notifications,
                        settings.show_online_status,
                        settings.contact_age_min,
                        settings.contact_age_max,
                        settings.require_photos,
                        settings.messages_per_day,
                        settings.no_same_gender_contact,
                        settings.notify_new_messages,
                        settings.notify_profile_views,
                        settings.show_last_active,
                        settings.verified_profiles_only,
                        isProfileVisibilityProvided // $14 - Flag to indicate if profile_visibility was provided
                    ];
                    
                    // Final safety check on the actual parameter we're about to send
                    if (!queryParams[1] || !validVisibilityValues.includes(queryParams[1])) {
                        console.error('🚨 CRITICAL ERROR: Invalid profile_visibility in query params:', queryParams[1]);
                        queryParams[1] = 'public'; // Force to valid value
                    }
                    
                    console.log('📤 About to execute query with profile_visibility:', queryParams[1], 'type:', typeof queryParams[1]);
                    
                    await this.db.query(`
                        INSERT INTO user_profile_settings 
                        (user_id, profile_visibility, email_notifications, show_online_status, 
                         contact_age_min, contact_age_max, require_photos, messages_per_day, 
                         no_same_gender_contact, notify_new_messages, notify_profile_views,
                         show_last_active, verified_profiles_only, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
                        ON CONFLICT (user_id) 
                        DO UPDATE SET 
                            profile_visibility = CASE 
                                WHEN $14 = true THEN $2
                                WHEN user_profile_settings.profile_visibility IN ('public', 'friends', 'private') THEN user_profile_settings.profile_visibility
                                ELSE 'public'
                            END,
                            email_notifications = COALESCE($3, user_profile_settings.email_notifications),
                            show_online_status = COALESCE($4, user_profile_settings.show_online_status),
                            contact_age_min = COALESCE($5, user_profile_settings.contact_age_min),
                            contact_age_max = COALESCE($6, user_profile_settings.contact_age_max),
                            require_photos = COALESCE($7, user_profile_settings.require_photos),
                            messages_per_day = COALESCE($8, user_profile_settings.messages_per_day),
                            no_same_gender_contact = COALESCE($9, user_profile_settings.no_same_gender_contact),
                            notify_new_messages = COALESCE($10, user_profile_settings.notify_new_messages),
                            notify_profile_views = COALESCE($11, user_profile_settings.notify_profile_views),
                            show_last_active = COALESCE($12, user_profile_settings.show_last_active),
                            verified_profiles_only = COALESCE($13, user_profile_settings.verified_profiles_only),
                            updated_at = NOW()
                    `, queryParams);
                    
                    console.log('✅ Profile settings updated');
                }

                // Handle contact countries
                if (settings.contact_countries !== undefined) {
                    console.log('🌍 Processing contact countries:', settings.contact_countries);
                    
                    // Delete existing contact countries
                    const deleteResult = await this.db.query(
                        'DELETE FROM user_contact_countries WHERE user_id = $1', 
                        [userId]
                    );
                    console.log(`🗑️ Deleted ${deleteResult.rowCount} existing contact countries`);
                    
                    // Handle the contact countries
                    if (Array.isArray(settings.contact_countries) && settings.contact_countries.length > 0) {
                        console.log(`➕ Adding ${settings.contact_countries.length} contact countries`);
                        
                        for (const country of settings.contact_countries) {
                            if (country && country.id) {
                                console.log(`➕ Adding country ID: ${country.id}`);
                                await this.db.query(`
                                    INSERT INTO user_contact_countries (user_id, country_id, is_all_countries)
                                    VALUES ($1, $2, false)
                                `, [userId, country.id]);
                            }
                        }
                    } else {
                        console.log('🌍 No specific countries selected, defaulting to "All Countries"');
                        // If no countries selected, it means "All Countries" (no restrictions)
                        // We don't need to insert anything as the absence of records means "All Countries"
                    }
                    
                    console.log('✅ Contact countries updated');
                }

                // Commit transaction
                await this.db.query('COMMIT');
                console.log('✅ Transaction committed successfully');

                res.json({ 
                    success: true, 
                    message: 'Settings updated successfully',
                    updatedSettings: settings
                });

            } catch (error) {
                // Rollback transaction on error
                await this.db.query('ROLLBACK');
                throw error;
            }

        } catch (error) {
            console.error('❌ Bulk update settings error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update settings',
                details: error.message 
            });
        }
    }

    async getCountries(req, res) {
        try {
            const countriesResult = await this.db.query(`
                SELECT id, name, emoji
                FROM country 
                ORDER BY name ASC
            `);

            res.json({
                success: true,
                countries: countriesResult.rows
            });

        } catch (error) {
            console.error('❌ Get countries error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get countries',
                details: error.message 
            });
        }
    }

    async getUserProfile(req, res) {
        const { userId } = req.params;
        const currentUserId = req.headers['x-user-id'] || req.query.currentUser;
        
        console.log(`👤 Loading detailed profile for user: ${userId} (requested by: ${currentUserId})`);
        console.log(`🔍 Request params:`, req.params);
        console.log(`🔍 Request query:`, req.query);
        console.log(`🔍 Request headers:`, req.headers);
            
        try {
            // Log profile view to users_profile_views table (only if viewing someone else's profile)
            // Use UPSERT to update timestamp if view already exists (only latest view kept)
            // Use rate limiting to prevent rapid-fire updates (5 second window)
            if (currentUserId && currentUserId != userId) {
                try {
                    const viewerId = parseInt(currentUserId);
                    const viewedUserId = parseInt(userId);
                    
                    // Check if viewer is blocked by viewed user or vice versa
                    const blockCheck = await this.db.query(`
                        SELECT id FROM users_blocked_by_users 
                        WHERE (blocker_id = $1 AND blocked_id = $2) 
                           OR (blocker_id = $2 AND blocked_id = $1)
                    `, [viewerId, viewedUserId]);
                    
                    // Don't log profile view if either user has blocked the other
                    if (blockCheck.rows.length > 0) {
                        console.log(`🚫 Profile view not logged: User ${viewerId} is blocked from viewing user ${viewedUserId}`);
                        // Continue to return profile data, but don't log the view
                    } else {
                        // Check rate limit (prevent same view within 5 seconds)
                        const recentView = await this.db.query(`
                            SELECT id, viewed_at FROM users_profile_views
                            WHERE viewer_id = $1
                                AND viewed_user_id = $2
                                AND viewed_at > NOW() - INTERVAL '5 seconds'
                            LIMIT 1
                        `, [viewerId, viewedUserId]);
                        
                        if (recentView.rows.length === 0) {
                            // UPSERT: Insert new view or update timestamp if exists
                            await this.db.query(`
                                INSERT INTO users_profile_views (viewer_id, viewed_user_id, viewed_at)
                                VALUES ($1, $2, NOW())
                                ON CONFLICT (viewer_id, viewed_user_id)
                                DO UPDATE SET viewed_at = NOW()
                            `, [viewerId, viewedUserId]);
                            
                            // Also log to user_activity for analytics (with rate limiting)
                            try {
                                await this.rateLimiter.logActivity(
                                    viewerId,
                                    'profile_view',
                                    viewedUserId,
                                    `Viewed profile of user ${viewedUserId}`,
                                    5
                                );
                            } catch (activityError) {
                                // Non-critical, continue
                            }
                            
                            console.log(`📊 Logged profile view: user ${viewerId} viewed user ${viewedUserId}`);
                        } else {
                            console.log(`⏱️  Rate limited: User ${viewerId} viewing user ${viewedUserId} (recent view)`);
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to log profile view:`, error.message);
                }
            }
            // Resolve user_attributes columns defensively (some environments may contain misspelled column names)
            const userAttributesColumnsResult = await this.db.query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'user_attributes'
            `);
            const userAttributesColumns = new Set(
                userAttributesColumnsResult.rows.map((row) => String(row.column_name || '').toLowerCase())
            );

            const pickUserAttributeColumn = (...candidates) => {
                for (const candidate of candidates) {
                    const normalized = String(candidate || '').toLowerCase();
                    if (userAttributesColumns.has(normalized)) {
                        return normalized;
                    }
                }
                return null;
            };

            const uaSelectExpr = (alias, ...candidates) => {
                const column = pickUserAttributeColumn(...candidates);
                return column ? `ua.${column} AS ${alias}` : `NULL AS ${alias}`;
            };

            const uaJoinExpr = (...candidates) => {
                const column = pickUserAttributeColumn(...candidates);
                return column ? `ua.${column}` : 'NULL';
            };

            const [
                hasFeaturedCol,
                hasUploadedAtCol,
                hasThumbPathCol,
                hasThumbSmallCol,
                hasThumbMediumCol
            ] = await Promise.all([
                this.columnExists('user_images', 'featured'),
                this.columnExists('user_images', 'uploaded_at'),
                this.columnExists('user_images', 'thumbnail_path'),
                this.columnExists('user_images', 'thumbnail_small_path'),
                this.columnExists('user_images', 'thumbnail_medium_path')
            ]);

            // Build comprehensive profile query (borrowed from searchController approach)
            const profileQuery = `
                SELECT 
                    u.id,
                    u.real_name,
                    u.email,
                    u.birthdate,
                    u.gender,
                    u.date_joined,
                    u.last_login,
                    c.name as country_name,
                    c.emoji as country_emoji,
                    st.name as state_name,
                    ci.name as city_name,
                    ${uaSelectExpr('height_cm', 'height_cm')},
                    ${uaSelectExpr('weight_kg', 'weight_kg')},
                    ${uaSelectExpr('about_me', 'about_me')},
                    ${uaSelectExpr('attributes_partner_preferences', 'about_partner', 'partner_preferences')},
                    ${uaSelectExpr('smoking_id', 'smoking_id')},
                    ${uaSelectExpr('drinking_id', 'drinking_id')},
                    ${uaSelectExpr('exercise_habits_id', 'exercise_habits_id')},
                    ${uaSelectExpr('ethnicity_id', 'ethnicity_id')},
                    ${uaSelectExpr('income_id', 'income_id')},
                    ${uaSelectExpr('marital_status_id', 'marital_status_id')},
                    ${uaSelectExpr('lifestyle_id', 'lifestyle_id')},
                    ${uaSelectExpr('living_situation_id', 'living_situation_id', 'living_sitiation_id')},
                    ${uaSelectExpr('body_art_id', 'body_art_id')},
                    ${uaSelectExpr('english_ability_id', 'english_ability_id', 'english_abilit_id')},
                    ${uaSelectExpr('relocation_id', 'relocation_id')},
                    ${uaSelectExpr('occupation_category_id', 'occupation_category_id')},
                    ${uaSelectExpr('body_type_id', 'body_type_id')},
                    ${uaSelectExpr('eye_color_id', 'eye_color_id', 'eye_colr_id')},
                    ${uaSelectExpr('religion_id', 'religion_id')},
                    ${uaSelectExpr('have_children_raw', 'have_children')},
                    bt.name as body_type_name, ey.name as eye_color_name, hc.name as hair_color_name,
                    eth.name as ethnicity_name, rel.name as religion_name, edu.name as education_name,
                    occ.name as occupation_name, inc.name as income_name, ls.name as lifestyle_name,
                    lv.name as living_situation_name, ms.name as marital_status_name,
                    sp.name as smoking_preference_name,
                    dp.name as drinking_preference_name,
                    eh.name as exercise_habits_name,
                    hcs.name as have_children_name,
                    urw.name as relocation_name,
                    ui.file_name as profile_image,
                    ui.thumbnail_small_path,
                    ui.thumbnail_medium_path,
                    up.preferred_gender, up.age_min, up.age_max,
                    COALESCE(rtr.display_name, rtr.name) as relationship_type,
                    up.relationship_type_id,
                    EXTRACT(YEAR FROM AGE(u.birthdate)) as age,     
                    CASE
                        WHEN us.is_active = true AND us.last_activity > NOW() - INTERVAL '2 minutes' THEN true
                        ELSE false
                    END as is_online,
                    us.last_activity,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM user_messages m
                            WHERE m.sender_id = u.id 
                            AND m.receiver_id = $2
                            AND COALESCE(m.deleted_by_receiver, false) = false
                        ) THEN true
                        ELSE false
                    END as has_received_messages,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM users_likes l
                            WHERE l.liked_by = $2
                            AND l.liked_user_id = u.id
                        ) THEN true
                        ELSE false
                    END as is_liked,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM users_favorites f
                            WHERE f.favorited_by = $2
                            AND f.favorited_user_id = u.id
                        ) THEN true
                        ELSE false
                    END as is_favorited
                FROM users u
                LEFT JOIN country c ON u.country_id = c.id
                LEFT JOIN state st ON u.state_id = st.id
                LEFT JOIN city ci ON u.city_id = ci.id
                LEFT JOIN user_attributes ua ON u.id = ua.user_id
                LEFT JOIN user_body_types bt ON ${uaJoinExpr('body_type_id')} = bt.id
                LEFT JOIN user_eye_colors ey ON ${uaJoinExpr('eye_color_id', 'eye_colr_id')} = ey.id
                LEFT JOIN user_hair_colors hc ON ${uaJoinExpr('hair_color_id')} = hc.id
                LEFT JOIN user_ethnicities eth ON ${uaJoinExpr('ethnicity_id')} = eth.id
                LEFT JOIN user_religions rel ON ${uaJoinExpr('religion_id')} = rel.id
                LEFT JOIN user_education_levels edu ON ${uaJoinExpr('education_id')} = edu.id
                LEFT JOIN user_occupation_categories occ ON ${uaJoinExpr('occupation_category_id')} = occ.id
                LEFT JOIN user_income_ranges inc ON ${uaJoinExpr('income_id')} = inc.id
                LEFT JOIN user_lifestyle_preferences ls ON ${uaJoinExpr('lifestyle_id')} = ls.id
                LEFT JOIN user_living_situations lv ON ${uaJoinExpr('living_situation_id', 'living_sitiation_id')} = lv.id
                LEFT JOIN user_marital_statuses ms ON ${uaJoinExpr('marital_status_id')} = ms.id
                LEFT JOIN user_smoking_preferences sp ON ${uaJoinExpr('smoking_id')} = sp.id
                LEFT JOIN user_drinking_preferences dp ON ${uaJoinExpr('drinking_id')} = dp.id
                LEFT JOIN user_exercise_habits eh ON ${uaJoinExpr('exercise_habits_id')} = eh.id
                LEFT JOIN user_have_children_statuses hcs ON (
                    ${uaJoinExpr('have_children')} IS NOT NULL
                    AND (${uaJoinExpr('have_children')})::TEXT ~ '^[0-9]+$'
                    AND CAST(${uaJoinExpr('have_children')} AS INTEGER) = hcs.id
                )
                LEFT JOIN user_relocation_willingness urw ON ${uaJoinExpr('relocation_id')} = urw.id
                LEFT JOIN user_preferences up ON u.id = up.user_id
                LEFT JOIN user_relationship_type_reference rtr ON up.relationship_type_id = rtr.id
                LEFT JOIN LATERAL (
                    SELECT
                        ui_choice.file_name,
                        ${hasThumbSmallCol ? 'ui_choice.thumbnail_small_path' : 'NULL::text AS thumbnail_small_path'},
                        ${hasThumbMediumCol ? 'ui_choice.thumbnail_medium_path' : 'NULL::text AS thumbnail_medium_path'}
                    FROM user_images ui_choice
                    WHERE ui_choice.user_id = u.id
                      AND ui_choice.file_name IS NOT NULL
                      AND ui_choice.approval_status = 'approved'
                    ORDER BY
                        CASE
                            WHEN ui_choice.is_profile::text IN ('1', 'true', 't') THEN 0
                            ${hasFeaturedCol ? "WHEN ui_choice.featured::text IN ('1', 'true', 't') THEN 1" : ''}
                            ELSE 2
                        END,
                        ${hasUploadedAtCol ? 'ui_choice.uploaded_at DESC NULLS LAST,' : ''}
                        ui_choice.id DESC
                    LIMIT 1
                ) ui ON true
                LEFT JOIN user_sessions us ON u.id = us.user_id AND us.is_active = true
                WHERE u.id = $1
            `;
            
            console.log(`🔍 Executing profile query with userId: ${userId}, currentUserId: ${currentUserId}`);
            // Pass currentUserId as second parameter for has_received_messages check
            const profileResult = await this.db.query(profileQuery, [userId, currentUserId || userId]);
            console.log(`✅ Profile query result:`, profileResult.rows.length, 'rows found');
            
            if (profileResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'User not found' 
                });
            }
            
            const user = profileResult.rows[0];

            const resolveLookupName = async (id, candidates) => {
                if (!id) return null;
                for (const table of candidates) {
                    try {
                        const lookup = await this.db.query(`SELECT name FROM ${table} WHERE id = $1 LIMIT 1`, [id]);
                        if (lookup.rows && lookup.rows.length > 0) {
                            return lookup.rows[0].name;
                        }
                    } catch (err) {
                        // try next candidate table
                    }
                }
                return null;
            };

            const bodyArtName = await resolveLookupName(user.body_art_id, [
                'user_body_art',
                'user_body_arts',
                'user_body_art_types',
                'body_art',
                'body_art_types'
            ]);

            const englishAbilityName = await resolveLookupName(user.english_ability_id, [
                'user_english_ability',
                'user_english_abilities',
                'english_ability',
                'english_abilities',
                'english_levels',
                'language_ability'
            ]);
            
            // Get user images separately (for photos gallery)
            const imageSelectColumns = [
                'id',
                'file_name',
                'is_profile',
                hasFeaturedCol ? 'featured' : '0 as featured',
                hasUploadedAtCol ? 'uploaded_at' : 'NULL::timestamptz as uploaded_at',
                hasThumbPathCol ? 'thumbnail_path' : 'NULL::text as thumbnail_path',
                hasThumbSmallCol ? 'thumbnail_small_path' : 'NULL::text as thumbnail_small_path',
                hasThumbMediumCol ? 'thumbnail_medium_path' : 'NULL::text as thumbnail_medium_path'
            ];

            const imageOrderBy = ['is_profile DESC'];
            if (hasFeaturedCol) {
                imageOrderBy.push('featured DESC');
            }
            if (hasUploadedAtCol) {
                imageOrderBy.push('uploaded_at DESC');
            }
            imageOrderBy.push('id DESC');

            const imagesQuery = `
                SELECT ${imageSelectColumns.join(', ')}
                FROM user_images
                WHERE user_id = $1
                  AND approval_status = 'approved'
                ORDER BY ${imageOrderBy.join(', ')}
            `;
            
            console.log(`🔍 Executing images query with userId: ${userId}`);
            const imagesResult = await this.db.query(imagesQuery, [userId]);
            console.log(`✅ Images query result:`, imagesResult.rows.length, 'images found');
            
            // Fetch interests from user_interests_multiple
            let interests = [];
            try {
                const interestsQuery = `
                    SELECT uim.interest_id AS id, c.name, c.icon, c.color
                    FROM user_interests_multiple uim
                    JOIN user_interest_categories c ON uim.interest_id = c.id
                    WHERE uim.user_id = $1
                    ORDER BY c.name
                `;
                const interestsResult = await this.db.query(interestsQuery, [userId]);
                interests = interestsResult.rows || [];
                console.log(`✅ Interests query result:`, interests.length, 'interests found');
            } catch (interestsError) {
                console.warn('⚠️ Could not load user interests:', interestsError.message);
            }
            
            // Fetch hobbies from user_hobbies_multiple
            let hobbies = [];
            try {
                const hobbiesQuery = `
                    SELECT uh.hobby_id AS id, hr.name
                    FROM user_hobbies_multiple uh
                    JOIN user_hobbies_reference hr ON uh.hobby_id = hr.id
                    WHERE uh.user_id = $1
                    ORDER BY hr.name
                `;
                const hobbiesResult = await this.db.query(hobbiesQuery, [userId]);
                hobbies = hobbiesResult.rows || [];
                console.log(`✅ Hobbies query result:`, hobbies.length, 'hobbies found');
            } catch (hobbiesError) {
                console.warn('⚠️ Could not load user hobbies:', hobbiesError.message);
            }
            
            // Combine interests and hobbies for display
            const allInterests = [
                ...interests.map(i => ({ name: i.name, type: 'interest' })),
                ...hobbies.map(h => ({ name: h.name, type: 'hobby' }))
            ];
            
            // Build response using searchController approach
            const partnerPreferencesValue = (
                user.attributes_partner_preferences && String(user.attributes_partner_preferences).trim() !== ''
            )
                ? user.attributes_partner_preferences
                : null;

            const profileData = {
                id: user.id,
                real_name: user.real_name,
                age: user.age || 0,
                gender: user.gender,
                location: user.city_name && user.state_name && user.country_name 
                    ? `${user.city_name}, ${user.state_name}, ${user.country_name}`
                    : user.country_name || 'Unknown location',
                country_emoji: user.country_emoji,
                date_joined: user.date_joined,
                is_online: user.is_online,
                last_active: user.last_activity || user.last_login,
                profile_image: user.profile_image,
                thumbnail_small_path: user.thumbnail_small_path || null,
                thumbnail_medium_path: user.thumbnail_medium_path || null,
                has_received_messages: user.has_received_messages || false,
                is_liked: user.is_liked || false,
                is_favorited: user.is_favorited || false,
                photos: imagesResult.rows.map(img => ({
                    id: img.id,
                    file_name: img.file_name,
                    is_profile: img.is_profile === 1,
                    featured: img.featured === 1,
                    uploaded_at: img.uploaded_at,
                    thumbnail_path: img.thumbnail_path || null,
                    thumbnail_small_path: img.thumbnail_small_path || null,
                    thumbnail_medium_path: img.thumbnail_medium_path || null
                })),
                interests: allInterests,
                about_me: user.about_me || null,
                preferred_gender: user.preferred_gender,
                age_min: user.age_min,
                age_max: user.age_max,
                partner_preferences: partnerPreferencesValue,
                relationship_type: user.relationship_type || null,
                attributes: {
                    about_me: user.about_me,
                    partner_preferences: partnerPreferencesValue,
                    relationship_type: user.relationship_type || null,
                    preferred_gender: user.preferred_gender || null,
                    age_min: user.age_min,
                    age_max: user.age_max,
                    height_cm: user.height_cm,
                    weight_kg: user.weight_kg,
                    smoking_id: user.smoking_id,
                    drinking_id: user.drinking_id,
                    exercise_habits_id: user.exercise_habits_id,
                    ethnicity_id: user.ethnicity_id,
                    marital_status_id: user.marital_status_id,
                    lifestyle_id: user.lifestyle_id,
                    living_situation_id: user.living_situation_id,
                    body_art_id: user.body_art_id,
                    english_ability_id: user.english_ability_id,
                    relocation_id: user.relocation_id,
                    body_type_id: user.body_type_id,
                    eye_color_id: user.eye_color_id,
                    religion_id: user.religion_id,
                    have_children: user.have_children_name || user.have_children_raw || null,
                    have_children_raw: user.have_children_raw || null,
                    smoking: user.smoking_preference_name || null,
                    drinking: user.drinking_preference_name || null,
                    exercise_habits: user.exercise_habits_name || null,
                    relocation: user.relocation_name || null,
                    body_type: user.body_type_name,
                    eye_color: user.eye_color_name,
                    hair_color: user.hair_color_name,
                    ethnicity: user.ethnicity_name,
                    religion: user.religion_name,
                    education: user.education_name,
                    occupation: user.occupation_name,
                    income: user.income_name,
                    lifestyle: user.lifestyle_name,
                    living_situation: user.living_situation_name,
                    marital_status: user.marital_status_name,
                    body_art: bodyArtName || null,
                    english_ability: englishAbilityName || null
                }
            };
            
            console.log(`✅ Profile data built successfully for user ${userId}`);
            console.log(`📊 Profile data:`, JSON.stringify(profileData, null, 2));
            
            res.json({
                success: true,
                profile: profileData
            });
            
        } catch (error) {
            console.error('❌ getUserProfile error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to load profile',
                details: error.message 
            });
        }
    }

    // Get user online status
    async getUserStatus(req, res) {
        try {
            const { userId } = req.params;
            
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }
            
            const query = `
                SELECT 
                    u.id,
                    u.real_name,
                    u.last_login,
                    us.is_active as session_active,
                    us.last_activity,
                    CASE
                        WHEN us.is_active = true AND us.last_activity > NOW() - INTERVAL '2 minutes' THEN true
                        ELSE false
                    END as is_online
                FROM users u
                LEFT JOIN user_sessions us ON u.id = us.user_id AND us.is_active = true
                WHERE u.id = $1
            `;
            
            const result = await this.db.query(query, [userId]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }
            
            const user = result.rows[0];
            
            res.json({
                success: true,
                userId: user.id,
                real_name: user.real_name,
                isOnline: user.is_online,
                lastLogin: user.last_login,
                sessionActive: user.session_active,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Get user status error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get user status',
                details: error.message 
            });
        }
    }

    // Get user last seen timestamp
    async getUserLastSeen(req, res) {
        try {
            const { userId } = req.params;
            
            const query = `
                SELECT last_login as last_seen
                FROM users 
                WHERE id = $1
            `;
            
            const result = await this.db.query(query, [userId]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }
            
            res.json({
                success: true,
                lastSeen: result.rows[0].last_seen || null,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Get user last seen error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get user last seen',
                details: error.message 
            });
        }
    }

    // Update user offline status
    async updateUserOffline(req, res) {
        try {
            // Handle both body and query parameters
            const userId = req.body?.userId || req.query?.userId;
            
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }
            
            // Use session tracker if available
            if (this.sessionTracker) {
                await this.sessionTracker.setUserOffline(userId);
                console.log(`🔴 User ${userId} marked as offline via session tracker`);
            } else {
                // Fallback: Set last_login to 10 minutes ago to ensure offline status
                const offlineTime = new Date(Date.now() - (10 * 60 * 1000)); // 10 minutes ago
                
                await this.db.query(
                    'UPDATE users SET last_login = $1 WHERE id = $2',
                    [offlineTime, userId]
                );
                console.log(`🔴 User ${userId} marked as offline via last_login update`);
            }
            
            res.json({ 
                success: true, 
                message: 'User offline status updated',
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Update user offline error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update user offline status',
                details: error.message 
            });
        }
    }

    // Update user online status (heartbeat)
    async updateUserOnline(req, res) {
        try {
            const { userId } = req.body;
            
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }
            
            // Use session tracker if available
            if (this.sessionTracker) {
                await this.sessionTracker.updateUserActivity(userId, req);
                console.log(`🟢 User ${userId} activity updated via session tracker`);
            } else {
                // Fallback: Update last_login
                await this.db.query(
                    'UPDATE users SET last_login = NOW() WHERE id = $1',
                    [userId]
                );
                console.log(`🟢 User ${userId} last_login updated`);
            }
            
            res.json({ 
                success: true, 
                message: 'User online status updated',
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Update user online error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update user online status',
                details: error.message 
            });
        }
    }

    isPresenceServiceReady() {
        return Boolean(
            this.presenceService &&
            typeof this.presenceService.isEnabled === 'function' &&
            this.presenceService.isEnabled()
        );
    }

    async handlePresenceHeartbeat(req, res) {
        try {
            const resolvedUserId =
                req.user?.id ??
                req.userId ??
                req.session?.user?.id ??
                req.headers['x-user-id'];

            if (!resolvedUserId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            const normalizedUserId = parseInt(resolvedUserId, 10);
            if (!Number.isInteger(normalizedUserId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid user ID is required'
                });
            }

            const body = req.body || {};
            const toNumberOrNull = (value) => {
                const parsed = parseInt(value, 10);
                return Number.isNaN(parsed) ? null : parsed;
            };
            const sanitizedMeta = {
                transport: typeof body.transport === 'string' ? body.transport : 'http',
                via: typeof body.via === 'string' ? body.via : null,
                leader: Boolean(body.leader),
                pageHidden: Boolean(body.pageHidden),
                instanceId: typeof body.instanceId === 'string' ? body.instanceId : null,
                trackedUsers: toNumberOrNull(body.trackedUsers),
                waitingCount: toNumberOrNull(body.waitingCount),
                hiddenQueue: toNumberOrNull(body.hiddenQueue)
            };

            let presencePayload = null;
            if (this.isPresenceServiceReady()) {
                try {
                    presencePayload = await this.presenceService.markOnline(normalizedUserId, {
                        source: 'http-heartbeat',
                        origin: sanitizedMeta.instanceId || undefined,
                        meta: sanitizedMeta
                    });
                } catch (presenceError) {
                    console.warn('⚠️ Presence heartbeat Redis error:', presenceError.message);
                }
            }

            if (this.sessionTracker) {
                await this.sessionTracker.updateUserActivity(normalizedUserId, req);
            } else {
                await this.db.query(
                    'UPDATE users SET last_login = NOW() WHERE id = $1',
                    [normalizedUserId]
                );
            }

            const ttlBaseMs = this.presenceService?.onlineThresholdMs
                || (this.presenceService?.options?.heartbeatTTL
                    ? this.presenceService.options.heartbeatTTL + (this.presenceService.options.gracePeriodMs || 0)
                    : null);
            const ttlSeconds = Math.max(1, Math.ceil((ttlBaseMs || 60000) / 1000));

            const normalizeLastSeenValue = (value) => {
                if (!value) {
                    return new Date().toISOString();
                }
                const date = new Date(value);
                return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
            };

            res.json({
                success: true,
                userId: normalizedUserId,
                ttlSeconds,
                redisEnabled: this.isPresenceServiceReady(),
                presence: presencePayload
                    ? {
                        isOnline: true,
                        lastSeen: normalizeLastSeenValue(presencePayload.lastSeen),
                        source: presencePayload.source || 'http-heartbeat',
                        origin: presencePayload.origin || null
                    }
                    : null
            });
        } catch (error) {
            console.error('❌ Presence heartbeat error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to process heartbeat',
                details: error.message
            });
        }
    }

    /**
     * Owning the inbox proves identity enough to open a session after verify-email link (same as login UX expectation).
     */
    async grantSessionAfterEmailVerification(userId, res) {
        try {
            if (!this.auth || typeof this.auth.createSession !== 'function') {
                return { ok: false, error: 'Auth unavailable' };
            }

            await ensureAccountStatusSchema(this.db);

            const userResult = await this.db.query(
                `SELECT id, real_name, email, birthdate, gender,
                        city_id, country_id, state_id, date_joined, last_login,
                        COALESCE(email_verified, false) as email_verified,
                        COALESCE(is_suspended, false) as is_suspended,
                        COALESCE(account_status, 'active') as account_status
                 FROM users WHERE id = $1`,
                [userId]
            );

            if (userResult.rows.length === 0) {
                return { ok: false, error: 'User not found' };
            }

            const user = userResult.rows[0];
            if (user.is_suspended) {
                return { ok: false, error: 'suspended' };
            }

            await this.db.query(
                'UPDATE users SET previous_login = last_login, last_login = NOW() WHERE id = $1',
                [user.id]
            );

            const sessionToken = this.auth.createSession(user);
            const isProduction = process.env.NODE_ENV === 'production';
            res.cookie('sessionToken', sessionToken, {
                httpOnly: true,
                secure: isProduction,
                // Lax so session is applied when user opens the verify link from an email client (top-level navigation).
                sameSite: 'lax',
                maxAge: config.session?.duration || (2 * 60 * 60 * 1000),
                path: '/'
            });

            return { ok: true };
        } catch (err) {
            console.error('❌ grantSessionAfterEmailVerification:', err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Verify email address using token
     */
    async verifyEmail(req, res) {
        try {
            let rawToken = req.query.token;
            if (Array.isArray(rawToken)) {
                rawToken = rawToken[0];
            }
            // Email clients / copy-paste often append commas or punctuation after the token in the URL
            const token =
                rawToken != null
                    ? String(rawToken)
                          .trim()
                          .replace(/^[<("'[{]+/, '')
                          .replace(/[,.;)\]}>'"`\s]+$/g, '')
                          .trim()
                    : '';

            const wantsHtmlResponse = (() => {
                const acceptHeader = req.get('accept') || '';
                const fetchDestination = req.get('sec-fetch-dest') || '';
                return fetchDestination === 'document' || acceptHeader.includes('text/html');
            })();

            /** Browser clicks land on /account (allowed without session when emailVerification is set — see pageRoutes). */
            const redirectVerifyHtml = (state, message) =>
                res.redirect(
                    303,
                    `/account?emailVerification=${encodeURIComponent(state)}&message=${encodeURIComponent(message)}`
                );

            if (!token) {
                if (wantsHtmlResponse) {
                    return redirectVerifyHtml(
                        'missing-token',
                        'Verification link is incomplete. Open the link from your email or paste the full URL.'
                    );
                }

                return res.status(400).json({
                    success: false,
                    error: 'Verification token is required'
                });
            }

            // Find the token in database
            const tokenResult = await this.db.query(`
                SELECT evt.*, u.id as user_id, u.email, u.real_name, u.email_verified
                FROM email_verification_tokens evt
                JOIN users u ON evt.user_id = u.id
                WHERE evt.token = $1
                AND evt.expires_at > NOW()
                AND evt.used_at IS NULL
            `, [token]);

            if (tokenResult.rows.length === 0) {
                if (wantsHtmlResponse) {
                    return redirectVerifyHtml(
                        'invalid-or-expired',
                        'Invalid or expired verification link. Please request a new one from the login or register page.'
                    );
                }

                return res.status(400).json({
                    success: false,
                    error: 'Invalid or expired verification token'
                });
            }

            const tokenData = tokenResult.rows[0];

            // Check if email is already verified (valid unused token still proves inbox — sign them in)
            if (tokenData.email_verified) {
                const granted = await this.grantSessionAfterEmailVerification(tokenData.user_id, res);
                if (!granted.ok && granted.error === 'suspended') {
                    if (wantsHtmlResponse) {
                        return redirectVerifyHtml(
                            'error',
                            'Your account has been suspended.'
                        );
                    }
                    return res.status(403).json({
                        success: false,
                        error: 'Your account has been suspended'
                    });
                }

                if (wantsHtmlResponse) {
                    return redirectVerifyHtml(
                        'already-verified',
                        granted.ok
                            ? 'Your email is already verified. You are signed in.'
                            : 'Your email is already verified. You can log in to continue.'
                    );
                }

                return res.status(400).json({
                    success: false,
                    error: 'Email is already verified'
                });
            }

            // Mark token as used
            await this.db.query(`
                UPDATE email_verification_tokens
                SET used_at = NOW()
                WHERE token = $1
            `, [token]);

            // Update user's email_verified status
            await this.db.query(`
                UPDATE users
                SET email_verified = true
                WHERE id = $1
            `, [tokenData.user_id]);

            // Delete all other unused tokens for this user
            await this.db.query(`
                DELETE FROM email_verification_tokens
                WHERE user_id = $1
                AND used_at IS NULL
                AND token != $2
            `, [tokenData.user_id, token]);

            console.log(`✅ Email verified for user ${tokenData.user_id} (${tokenData.email})`);

            const granted = await this.grantSessionAfterEmailVerification(tokenData.user_id, res);
            if (!granted.ok) {
                console.warn(
                    `⚠️ Email verified but session not issued for user ${tokenData.user_id}:`,
                    granted.error
                );
            }

            if (wantsHtmlResponse) {
                return redirectVerifyHtml(
                    'success',
                    granted.ok
                        ? 'Email verified successfully. You are signed in.'
                        : 'Email verified successfully. Please log in to continue.'
                );
            }

            res.json({
                success: true,
                message: granted.ok
                    ? 'Email verified successfully. You are signed in.'
                    : 'Email verified successfully! You can now log in.',
                sessionIssued: granted.ok,
                user: {
                    id: tokenData.user_id,
                    real_name: tokenData.real_name,
                    email: tokenData.email
                }
            });

        } catch (error) {
            console.error('❌ Email verification error:', error);

            const acceptHeader = req.get('accept') || '';
            const fetchDestination = req.get('sec-fetch-dest') || '';
            if (fetchDestination === 'document' || acceptHeader.includes('text/html')) {
                return res.redirect(
                    303,
                    '/account?emailVerification=error&message=' +
                        encodeURIComponent('Email verification failed. Please try again or request a new verification email.')
                );
            }

            res.status(500).json({
                success: false,
                error: 'Failed to verify email',
                message: error.message
            });
        }
    }

    /**
     * Verify email address using 6-digit code
     */
    async verifyEmailByCode(req, res) {
        try {
            const body = req.body || {};
            const code = body.code != null ? String(body.code).trim() : '';
            const rawUserId = body.userId ?? body.user_id ?? body.id;
            const parsedUserId =
                rawUserId !== undefined && rawUserId !== null && String(rawUserId).trim() !== ''
                    ? parseInt(String(rawUserId).trim(), 10)
                    : NaN;

            if (!code || !Number.isInteger(parsedUserId) || parsedUserId < 1) {
                return res.status(400).json({
                    success: false,
                    error: 'Verification code and user ID are required'
                });
            }

            // Validate code format (6 digits)
            if (!/^\d{6}$/.test(code)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid verification code format. Code must be 6 digits.'
                });
            }

            // Compare verification_code as text so varchar/int columns and leading zeros behave consistently
            const codeResult = await this.db.query(`
                SELECT evt.*, u.id as user_id, u.email, u.real_name, u.email_verified
                FROM email_verification_tokens evt
                JOIN users u ON evt.user_id = u.id
                WHERE evt.verification_code IS NOT NULL
                AND TRIM(evt.verification_code::text) = $1
                AND evt.expires_at > NOW()
                AND evt.used_at IS NULL
            `, [code]);

            if (codeResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid or expired verification code'
                });
            }

            const forUser = codeResult.rows.filter((row) => Number(row.user_id) === parsedUserId);
            if (forUser.length === 0) {
                return res.status(400).json({
                    success: false,
                    error:
                        'This code does not match your account. Use the code from your latest email, or request a new verification email.'
                });
            }

            const codeData = forUser[0];

            // Check if email is already verified
            if (codeData.email_verified) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is already verified'
                });
            }

            // Mark token as used
            await this.db.query(`
                UPDATE email_verification_tokens
                SET used_at = NOW()
                WHERE TRIM(verification_code::text) = $1
                AND user_id = $2
            `, [code, parsedUserId]);

            // Update user's email_verified status
            await this.db.query(`
                UPDATE users
                SET email_verified = true
                WHERE id = $1
            `, [codeData.user_id]);

            // Delete all other unused tokens for this user
            await this.db.query(`
                DELETE FROM email_verification_tokens
                WHERE user_id = $1
                AND used_at IS NULL
                AND TRIM(verification_code::text) != $2
            `, [codeData.user_id, code]);

            console.log(`✅ Email verified by code for user ${codeData.user_id} (${codeData.email})`);

            res.json({
                success: true,
                message: 'Email verified successfully!',
                user: {
                    id: codeData.user_id,
                    real_name: codeData.real_name,
                    email: codeData.email
                }
            });

        } catch (error) {
            console.error('❌ Email verification by code error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify email',
                message: error.message
            });
        }
    }

    /**
     * Resend verification email
     */
    async resendVerificationEmail(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'Email address is required'
                });
            }

            const normalizedEmail = String(email).trim().toLowerCase();
            if (normalizedEmail.length > 50) {
                return res.status(400).json({
                    success: false,
                    error: 'Email must be 50 characters or less'
                });
            }

            if (await this.adminBlacklistGate(req, res, normalizedEmail)) {
                return;
            }

            // Find user by email
            const userResult = await this.db.query(`
                SELECT id, real_name, email, email_verified
                FROM users
                WHERE LOWER(TRIM(email)) = $1
            `, [normalizedEmail]);

            if (userResult.rows.length === 0) {
                // Don't reveal if email exists or not (security best practice)
                return res.json({
                    success: true,
                    message: 'If an account with that email exists and is not verified, a verification email has been sent.'
                });
            }

            const user = userResult.rows[0];

            // Check if already verified
            if (user.email_verified) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is already verified'
                });
            }

            // Generate new verification token and code
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            const supportsVerificationCode = await this.columnExists('email_verification_tokens', 'verification_code');

            // Delete old unused tokens for this user
            await this.db.query(`
                DELETE FROM email_verification_tokens
                WHERE user_id = $1
                AND used_at IS NULL
            `, [user.id]);

            // Store new verification token and code when the schema supports it.
            if (supportsVerificationCode) {
                await this.db.query(`
                    INSERT INTO email_verification_tokens (user_id, token, verification_code, expires_at)
                    VALUES ($1, $2, $3, $4)
                `, [user.id, verificationToken, verificationCode, expiresAt]);
            } else {
                await this.db.query(`
                    INSERT INTO email_verification_tokens (user_id, token, expires_at)
                    VALUES ($1, $2, $3)
                `, [user.id, verificationToken, expiresAt]);
            }

            // Send verification email with a code only when the database supports it.
            const emailResult = await emailService.sendVerificationEmail(
                user.email,
                user.real_name,
                verificationToken,
                supportsVerificationCode ? verificationCode : null
            );

            if (!emailResult.success) {
                console.error('❌ Failed to send verification email:', emailResult.error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to send verification email. Please try again later.'
                });
            }

            console.log(`✅ Verification email resent to ${user.email}`);

            res.json({
                success: true,
                message: 'Verification email has been sent. Please check your inbox.'
            });

        } catch (error) {
            console.error('❌ Resend verification email error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to resend verification email',
                message: error.message
            });
        }
    }

    // Get account information
    async getAccountInfo(req, res) {
        try {
            // Cookie-based auth only (no URL tokens)
            const token = req.cookies?.sessionToken || req.cookies?.session;
            
            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;

            await ensureAccountStatusSchema(this.db);

            const result = await this.db.query(`
                SELECT id, real_name, email, date_joined, last_login, previous_login,
                       COALESCE(email_verified, false) as email_verified,
                       COALESCE(account_status, 'active') as account_status,
                       paused_at
                FROM users 
                WHERE id = $1
            `, [userId]);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const user = result.rows[0];

            // Use previous_login for display (shows previous login time, not current session)
            // last_login is the current session login time, previous_login is the previous one
            res.json({
                success: true,
                userId: user.id,
                email: user.email,
                accountCreated: user.date_joined,
                lastLogin: user.previous_login || null, // Use previous_login, or null if no previous login
                emailVerified: user.email_verified,
                accountStatus: normalizeAccountStatus(user.account_status),
                pausedAt: user.paused_at || null
            });

        } catch (error) {
            console.error('❌ Get account info error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get account information',
                details: error.message
            });
        }
    }

    async pauseAccount(req, res) {
        try {
            const token = req.cookies?.sessionToken || req.cookies?.session;

            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;
            const pauseReason = sanitizeTextInput(req.body?.reason || '', 500);

            await ensureAccountStatusSchema(this.db);

            const result = await this.db.query(
                `UPDATE users
                 SET account_status = $1,
                     paused_at = NOW(),
                     pause_reason = $2
                 WHERE id = $3
                 RETURNING COALESCE(account_status, 'active') as account_status, paused_at`,
                [ACCOUNT_STATUS.PAUSED, pauseReason, userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            return res.json({
                success: true,
                message: 'Account paused successfully',
                accountStatus: normalizeAccountStatus(result.rows[0].account_status),
                pausedAt: result.rows[0].paused_at || null
            });
        } catch (error) {
            console.error('❌ Pause account error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to pause account',
                details: error.message
            });
        }
    }

    async resumeAccount(req, res) {
        try {
            const token = req.cookies?.sessionToken || req.cookies?.session;

            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;

            await ensureAccountStatusSchema(this.db);

            const result = await this.db.query(
                `UPDATE users
                 SET account_status = $1,
                     paused_at = NULL,
                     pause_reason = NULL
                 WHERE id = $2
                 RETURNING COALESCE(account_status, 'active') as account_status`,
                [ACCOUNT_STATUS.ACTIVE, userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            return res.json({
                success: true,
                message: 'Account resumed successfully',
                accountStatus: normalizeAccountStatus(result.rows[0].account_status),
                pausedAt: null
            });
        } catch (error) {
            console.error('❌ Resume account error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to resume account',
                details: error.message
            });
        }
    }

    // Get account statistics
    async getAccountStats(req, res) {
        try {
            // Cookie-based auth only (no URL tokens)
            const token = req.cookies?.sessionToken || req.cookies?.session;
            
            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;

            // Profile views: distinct viewers, excluding hidden (matches Activity totals)
            const profileViewsResult = await this.db.query(`
                SELECT COUNT(DISTINCT pv.viewer_id) AS count
                FROM users_profile_views pv
                WHERE pv.viewed_user_id = $1
                  AND NOT EXISTS (
                      SELECT 1 FROM users_hidden_profile_viewers hv
                      WHERE hv.user_id = $1 AND hv.viewer_id = pv.viewer_id
                  )
            `, [userId]);

            // Likes received: visible incoming only (matches Activity → Who liked me)
            const likesResult = await this.db.query(`
                SELECT COUNT(DISTINCT l.liked_by) AS count
                FROM users_likes l
                JOIN users u ON l.liked_by = u.id
                WHERE l.liked_user_id = $1
                  AND NOT EXISTS (
                      SELECT 1 FROM users_hidden_incoming_likes hl
                      WHERE hl.user_id = $1 AND hl.liked_by = u.id
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM users_blocked_by_users bu
                      WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                         OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                  )
            `, [userId]);

            // Get messages sent
            const messagesSentResult = await this.db.query(`
                SELECT COUNT(*) as count FROM user_messages WHERE sender_id = $1
            `, [userId]);

            // Get messages received
            const messagesReceivedResult = await this.db.query(`
                SELECT COUNT(*) as count FROM user_messages WHERE receiver_id = $1
            `, [userId]);

            // Get matches (mutual likes) as unique users to avoid duplicate row overcounts
            const matchesResult = await this.db.query(`
                SELECT COUNT(DISTINCT l1.liked_user_id) as count
                FROM users_likes l1
                INNER JOIN users_likes l2
                    ON l1.liked_by = l2.liked_user_id
                   AND l1.liked_user_id = l2.liked_by
                WHERE l1.liked_by = $1
            `, [userId]);

            // My Favorites count (matches Activity → My Favorites, excludes blocked)
            const favoritesResult = await this.db.query(`
                SELECT COUNT(DISTINCT f.favorited_user_id) AS count
                FROM users_favorites f
                JOIN users u ON f.favorited_user_id = u.id
                WHERE f.favorited_by = $1
                  AND NOT EXISTS (
                      SELECT 1 FROM users_blocked_by_users bu
                      WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                         OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                  )
            `, [userId]);

            res.json({
                success: true,
                stats: {
                    profileViews: parseInt(profileViewsResult.rows[0]?.count || 0),
                    likesReceived: parseInt(likesResult.rows[0]?.count || 0),
                    favoritesCount: parseInt(favoritesResult.rows[0]?.count || 0),
                    messagesSent: parseInt(messagesSentResult.rows[0]?.count || 0),
                    messagesReceived: parseInt(messagesReceivedResult.rows[0]?.count || 0),
                    matches: parseInt(matchesResult.rows[0]?.count || 0)
                }
            });
        } catch (error) {
            console.error('❌ Get account stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get account statistics',
                details: error.message
            });
        }
    }

    // Get active sessions
    async getActiveSessions(req, res) {
        try {
            // Cookie-based auth only (no URL tokens)
            const token = req.cookies?.sessionToken || req.cookies?.session;
            
            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;

            // Get sessions from database
            const sessionsResult = await this.db.query(`
                SELECT id, session_token, ip_address, user_agent, last_activity, created_at,
                       CASE 
                           WHEN session_token = $2 THEN true 
                           ELSE false 
                       END as is_current
                FROM user_sessions 
                WHERE user_id = $1 
                AND is_active = true 
                AND last_activity > NOW() - INTERVAL '24 hours'
                ORDER BY last_activity DESC
            `, [userId, token]);

            const sessions = sessionsResult.rows.map(s => {
                // Detect device type from user agent
                let deviceType = 'desktop';
                if (s.user_agent) {
                    const ua = s.user_agent.toLowerCase();
                    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
                        deviceType = 'mobile';
                    } else if (ua.includes('tablet') || ua.includes('ipad')) {
                        deviceType = 'tablet';
                    }
                }

                return {
                    id: s.id,
                    device_type: deviceType,
                    user_agent: s.user_agent,
                    ip_address: s.ip_address,
                    last_activity: s.last_activity,
                    created_at: s.created_at,
                    is_current: s.is_current
                };
            });

            res.json({
                success: true,
                sessions: sessions
            });

        } catch (error) {
            console.error('❌ Get active sessions error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get active sessions',
                details: error.message
            });
        }
    }

    // Revoke session
    async revokeSession(req, res) {
        try {
            // Cookie-based auth only (no URL tokens)
            const token = req.cookies?.sessionToken || req.cookies?.session;
            const { sessionId } = req.params;
            
            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;

            // Verify session belongs to user
            const sessionResult = await this.db.query(`
                SELECT id FROM user_sessions 
                WHERE id = $1 AND user_id = $2
            `, [sessionId, userId]);

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
            }

            // Revoke session
            await this.db.query(`
                UPDATE user_sessions 
                SET is_active = false 
                WHERE id = $1
            `, [sessionId]);

            res.json({
                success: true,
                message: 'Session revoked successfully'
            });

        } catch (error) {
            console.error('❌ Revoke session error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to revoke session',
                details: error.message
            });
        }
    }

    // Export account data
    // Get subscription status
    async getSubscription(req, res) {
        try {
            // Cookie-based auth only (no URL tokens)
            const token = req.cookies?.sessionToken || req.cookies?.session;
            
            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;

            // Get subscription from database
            const subscriptionResult = await this.db.query(`
                SELECT subscription_type, payment_status, start_date, end_date
                FROM subscriptions 
                WHERE user_id = $1 
                AND payment_status = 'paid'
                AND (end_date IS NULL OR end_date > NOW())
                ORDER BY start_date DESC
                LIMIT 1
            `, [userId]);

            if (subscriptionResult.rows.length === 0) {
                // No active subscription - return free plan
                return res.json({
                    success: true,
                    subscription: {
                        plan: 'free',
                        status: 'active',
                        expiresAt: null
                    }
                });
            }

            const sub = subscriptionResult.rows[0];
            let plan = 'free';
            
            // Map subscription_type to plan name
            if (sub.subscription_type) {
                const type = sub.subscription_type.toLowerCase();
                if (type.includes('basic')) plan = 'basic';
                else if (type.includes('plus')) plan = 'plus';
                else if (type.includes('vip') || type.includes('elite')) plan = 'vip';
            }

            res.json({
                success: true,
                subscription: {
                    plan: plan,
                    status: sub.payment_status || 'active',
                    expiresAt: sub.end_date || null
                }
            });

        } catch (error) {
            console.error('❌ Get subscription error:', error);
            // Return free plan on error
            res.json({
                success: true,
                subscription: {
                    plan: 'free',
                    status: 'active',
                    expiresAt: null
                }
            });
        }
    }

    // Get billing history
    async getBillingHistory(req, res) {
        try {
            // Cookie-based auth only (no URL tokens)
            const token = req.cookies?.sessionToken || req.cookies?.session;
            const limit = parseInt(req.query.limit) || 10;
            
            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;

            // Get billing history from payments and subscriptions
            const billingResult = await this.db.query(`
                SELECT 
                    p.id,
                    p.amount,
                    p.payment_date as date,
                    p.payment_method,
                    p.payment_status as status,
                    s.subscription_type as description,
                    'payment' as type
                FROM payments p
                LEFT JOIN subscriptions s ON p.id = s.id
                WHERE p.user_id = $1
                UNION ALL
                SELECT 
                    s.id,
                    NULL as amount,
                    s.start_date as date,
                    NULL as payment_method,
                    s.payment_status as status,
                    s.subscription_type as description,
                    'subscription' as type
                FROM subscriptions s
                WHERE s.user_id = $1
                ORDER BY date DESC
                LIMIT $2
            `, [userId, limit]);

            const history = billingResult.rows.map(item => ({
                id: item.id,
                date: item.date,
                description: item.description || 'Subscription',
                amount: item.amount ? `$${parseFloat(item.amount).toFixed(2)}` : 'N/A',
                status: item.status || 'Unknown',
                payment_method: item.payment_method
            }));

            res.json({
                success: true,
                history: history
            });

        } catch (error) {
            console.error('❌ Get billing history error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get billing history',
                details: error.message
            });
        }
    }

    // Get billing plans (user-facing, only active plans)
    async getBillingPlans(req, res) {
        try {
            // Get only active plans, ordered by display_order
            const plansResult = await this.db.query(`
                SELECT 
                    id,
                    name,
                    description,
                    plan_type,
                    price_monthly,
                    price_yearly,
                    currency,
                    duration_days,
                    features,
                    display_order
                FROM billing_plans
                WHERE is_active = true
                ORDER BY display_order ASC, id ASC
            `);

            const plans = plansResult.rows.map(plan => ({
                id: plan.id,
                name: plan.name,
                description: plan.description,
                plan_type: plan.plan_type,
                price_monthly: parseFloat(plan.price_monthly || 0),
                price_yearly: parseFloat(plan.price_yearly || 0),
                currency: plan.currency || 'USD',
                duration_days: plan.duration_days,
                features: plan.features || {},
                display_order: plan.display_order || 0
            }));

            res.json({
                success: true,
                plans: plans
            });
        } catch (error) {
            console.error('❌ Get billing plans error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get billing plans',
                details: error.message
            });
        }
    }

    async updateProfile(req, res) {
        const body = req.body || {};
        const sessionUserId = req.user?.id || req.session?.user?.id || req.userId;
        const targetUserId = parseNullableInt(body.userId) || sessionUserId;

        if (!targetUserId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }

        if (sessionUserId && targetUserId !== sessionUserId) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to update this profile'
            });
        }

        const client = await this.db.connect();
        let updatedName = null;
        let releaseClient = true;

        const ensureArray = (value) => {
            if (Array.isArray(value)) {
                return value;
            }
            if (value === undefined || value === null) {
                return [];
            }
            return [value];
        };

        try {
            await client.query('BEGIN');

            const locationFieldsBeingUpdated = [];
            const newLocationValues = {
                country_id: null,
                state_id: null,
                city_id: null
            };
            let locationChangeData = null;

            const userUpdates = [];
            const userValues = [];
            let userIndex = 1;

            if (Object.prototype.hasOwnProperty.call(body, 'real_name')) {
                const suppliedName = typeof body.real_name === 'string' ? body.real_name.trim() : '';
                if (!suppliedName) {
                    const error = new Error('Name is required');
                    error.statusCode = 400;
                    throw error;
                }
                if (!REAL_NAME_REGEX.test(suppliedName)) {
                    const error = new Error('Name must be 2-100 alphabetic characters');
                    error.statusCode = 400;
                    throw error;
                }
                const normalizedName = suppliedName.charAt(0).toUpperCase() + suppliedName.slice(1);
                userUpdates.push(`real_name = $${userIndex++}`);
                userValues.push(normalizedName);
                updatedName = normalizedName;
            }

            if (Object.prototype.hasOwnProperty.call(body, 'country')) {
                userUpdates.push(`country_id = $${userIndex++}`);
                const parsedCountry = parseNullableInt(body.country);
                userValues.push(parsedCountry);
                locationFieldsBeingUpdated.push('country');
                newLocationValues.country_id = parsedCountry;
            }

            if (Object.prototype.hasOwnProperty.call(body, 'state')) {
                userUpdates.push(`state_id = $${userIndex++}`);
                const parsedState = parseNullableInt(body.state);
                userValues.push(parsedState);
                locationFieldsBeingUpdated.push('state');
                newLocationValues.state_id = parsedState;
            }

            if (Object.prototype.hasOwnProperty.call(body, 'city')) {
                userUpdates.push(`city_id = $${userIndex++}`);
                const parsedCity = parseNullableInt(body.city);
                userValues.push(parsedCity);
                locationFieldsBeingUpdated.push('city');
                newLocationValues.city_id = parsedCity;
            }

            if (locationFieldsBeingUpdated.length > 0) {
                const currentLocationResult = await client.query(
                    'SELECT country_id, state_id, city_id FROM users WHERE id = $1 FOR UPDATE',
                    [targetUserId]
                );
                const oldLocationValues = currentLocationResult.rows[0] || {
                    country_id: null,
                    state_id: null,
                    city_id: null
                };

                const normalizeValue = (val) => {
                    if (val === '' || val === undefined || val === null) return null;
                    return String(val);
                };

                let locationChanged = false;

                if (locationFieldsBeingUpdated.includes('country')) {
                    const oldVal = normalizeValue(oldLocationValues.country_id);
                    const newVal = normalizeValue(newLocationValues.country_id);
                    if ((oldVal === null) !== (newVal === null) || (oldVal !== null && newVal !== null && oldVal !== newVal)) {
                        locationChanged = true;
                    }
                }

                if (locationFieldsBeingUpdated.includes('state')) {
                    const oldVal = normalizeValue(oldLocationValues.state_id);
                    const newVal = normalizeValue(newLocationValues.state_id);
                    if ((oldVal === null) !== (newVal === null) || (oldVal !== null && newVal !== null && oldVal !== newVal)) {
                        locationChanged = true;
                    }
                }

                if (locationFieldsBeingUpdated.includes('city')) {
                    const oldVal = normalizeValue(oldLocationValues.city_id);
                    const newVal = normalizeValue(newLocationValues.city_id);
                    if ((oldVal === null) !== (newVal === null) || (oldVal !== null && newVal !== null && oldVal !== newVal)) {
                        locationChanged = true;
                    }
                }

                if (locationChanged) {
                    const rateLimitCheck = await client.query(`
                        SELECT COUNT(*) as change_count
                        FROM user_location_history
                        WHERE user_id = $1
                        AND changed_at > NOW() - INTERVAL '30 days'
                    `, [targetUserId]);

                    const changeCount = parseInt(rateLimitCheck.rows[0]?.change_count || 0, 10);
                    const maxChangesPerMonth = 1;

                    if (changeCount >= maxChangesPerMonth) {
                        await client.query('ROLLBACK');
                        releaseClient = false;
                        client.release();
                        return res.status(200).json({
                            success: true,
                            locationLimitReached: true,
                            nameLimitReached: false,
                            message: `You have changed your location ${changeCount} time(s) in the last 30 days. Maximum ${maxChangesPerMonth} change(s) allowed per 30 days. Please wait before changing your location again.`
                        });
                    }

                    const finalNewLocation = { ...oldLocationValues };
                    if (locationFieldsBeingUpdated.includes('country') && newLocationValues.country_id !== null && newLocationValues.country_id !== undefined) {
                        finalNewLocation.country_id = newLocationValues.country_id;
                    }
                    if (locationFieldsBeingUpdated.includes('state')) {
                        finalNewLocation.state_id = newLocationValues.state_id;
                    }
                    if (locationFieldsBeingUpdated.includes('city')) {
                        finalNewLocation.city_id = newLocationValues.city_id;
                    }

                    locationChangeData = {
                        old: oldLocationValues,
                        new: finalNewLocation
                    };
                }
            }

            if (userUpdates.length > 0) {
                userValues.push(targetUserId);
                await client.query(
                    `UPDATE users SET ${userUpdates.join(', ')} WHERE id = $${userIndex}`,
                    userValues
                );
            }

            if (locationChangeData) {
                const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null;
                const userAgent = req.headers['user-agent'] || null;
                try {
                    await client.query(`
                        INSERT INTO user_location_history 
                        (user_id, old_country_id, old_state_id, old_city_id,
                         new_country_id, new_state_id, new_city_id,
                         ip_address, user_agent, changed_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                    `, [
                        targetUserId,
                        locationChangeData.old.country_id,
                        locationChangeData.old.state_id,
                        locationChangeData.old.city_id,
                        locationChangeData.new.country_id,
                        locationChangeData.new.state_id,
                        locationChangeData.new.city_id,
                        ipAddress,
                        userAgent
                    ]);
                } catch (historyError) {
                    console.error('Error logging location change history:', historyError.message);
                }
            }

            await client.query(
                `INSERT INTO user_attributes (user_id)
                 SELECT $1
                 WHERE NOT EXISTS (
                     SELECT 1 FROM user_attributes WHERE user_id = $1
                 )`,
                [targetUserId]
            );
            await client.query(
                `INSERT INTO user_preferences (user_id)
                 SELECT $1
                 WHERE NOT EXISTS (
                     SELECT 1 FROM user_preferences WHERE user_id = $1
                 )`,
                [targetUserId]
            );

            const attributeUpdates = [];
            const attributeValues = [];
            let attributeIndex = 1;

            if (Object.prototype.hasOwnProperty.call(body, 'aboutMe')) {
                const aboutValue = sanitizeTextInput(body.aboutMe, 2000);
                attributeUpdates.push(`about_me = $${attributeIndex++}`);
                attributeValues.push(aboutValue ?? '');
            }

            if (Object.prototype.hasOwnProperty.call(body, 'height_reference_id')) {
                let heightCm = null;
                if (isNotImportantSelection(body.height_reference_id)) {
                    heightCm = 0;
                } else {
                    heightCm = await resolveHeightCmByReference(client, body.height_reference_id);
                }
                attributeUpdates.push(`height_cm = $${attributeIndex++}`);
                attributeValues.push(heightCm);
            }

            if (Object.prototype.hasOwnProperty.call(body, 'weight_reference_id')) {
                let weightKg = null;
                if (isNotImportantSelection(body.weight_reference_id)) {
                    weightKg = 0;
                } else {
                    weightKg = await resolveWeightKgByReference(client, body.weight_reference_id);
                }
                attributeUpdates.push(`weight_kg = $${attributeIndex++}`);
                attributeValues.push(weightKg);
            }

            const attributeIdFields = {
                body_type: 'body_type_id',
                eye_color: 'eye_color_id',
                hair_color: 'hair_color_id',
                ethnicity: 'ethnicity_id',
                religion: 'religion_id',
                education: 'education_id',
                occupation: 'occupation_category_id',
                income: 'income_id',
                lifestyle: 'lifestyle_id',
                living_situation: 'living_situation_id',
                marital_status: 'marital_status_id',
                    smoking: 'smoking_id',
                drinking: 'drinking_id',
                exercise: 'exercise_habits_id',
                number_of_children: 'number_of_children_id',
                body_art: 'body_art_id',
                english_ability: 'english_ability_id',
                relocation: 'relocation_id'
            };

            for (const [payloadKey, columnName] of Object.entries(attributeIdFields)) {
                if (Object.prototype.hasOwnProperty.call(body, payloadKey)) {
                    attributeUpdates.push(`${columnName} = $${attributeIndex++}`);
                    attributeValues.push(parseNullableInt(body[payloadKey]));
                }
            }

            if (Object.prototype.hasOwnProperty.call(body, 'have_children')) {
                attributeUpdates.push(`have_children = $${attributeIndex++}`);
                attributeValues.push(normalizeNullableValue(body.have_children));
            }

            if (Object.prototype.hasOwnProperty.call(body, 'partner_preferences')) {
                const attributesHasPartnerPreferences = await this.columnExists('user_attributes', 'about_partner', client);
                if (attributesHasPartnerPreferences) {
                    const partnerValue = sanitizeTextInput(body.partner_preferences, 2000);
                    attributeUpdates.push(`about_partner = $${attributeIndex++}`);
                    attributeValues.push(partnerValue ?? '');
                }
            }

            if (attributeUpdates.length > 0) {
                attributeValues.push(targetUserId);
                await client.query(
                    `UPDATE user_attributes SET ${attributeUpdates.join(', ')} WHERE user_id = $${attributeIndex}`,
                    attributeValues
                );
            }

            const preferenceUpdates = [];
            const preferenceValues = [];
            let preferenceIndex = 1;

            if (Object.prototype.hasOwnProperty.call(body, 'preferred_age_min')) {
                preferenceUpdates.push(`age_min = $${preferenceIndex++}`);
                preferenceValues.push(parseNullableInt(body.preferred_age_min));
            }

            if (Object.prototype.hasOwnProperty.call(body, 'preferred_age_max')) {
                preferenceUpdates.push(`age_max = $${preferenceIndex++}`);
                preferenceValues.push(parseNullableInt(body.preferred_age_max));
            }

            if (Object.prototype.hasOwnProperty.call(body, 'preferred_gender')) {
                preferenceUpdates.push(`preferred_gender = $${preferenceIndex++}`);
                preferenceValues.push(normalizeNullableValue(body.preferred_gender));
            }

            if (Object.prototype.hasOwnProperty.call(body, 'preferred_distance')) {
                preferenceUpdates.push(`location_radius = $${preferenceIndex++}`);
                preferenceValues.push(parseNullableInt(body.preferred_distance));
            }

            if (Object.prototype.hasOwnProperty.call(body, 'preferred_height_reference_id')) {
                const refValue = normalizeNullableValue(body.preferred_height_reference_id);
                let preferredHeight = null;
                if (isNotImportantSelection(refValue)) {
                    preferredHeight = '0';
                } else if (refValue) {
                    const resolvedHeight = await resolveHeightCmByReference(client, refValue);
                    preferredHeight = resolvedHeight != null ? String(resolvedHeight) : null;
                }
                preferenceUpdates.push(`preferred_height = $${preferenceIndex++}`);
                preferenceValues.push(preferredHeight);
            }

            if (Object.prototype.hasOwnProperty.call(body, 'preferred_weight_reference_id')) {
                const weightRefValue = normalizeNullableValue(body.preferred_weight_reference_id);
                let preferredWeight = null;
                if (isNotImportantSelection(weightRefValue)) {
                    preferredWeight = '0';
                } else if (weightRefValue) {
                    const resolvedWeight = await resolveWeightKgByReference(client, weightRefValue);
                    preferredWeight = resolvedWeight != null ? String(resolvedWeight) : null;
                }
                preferenceUpdates.push(`preferred_weight = $${preferenceIndex++}`);
                preferenceValues.push(preferredWeight);
            }

            const preferenceIdFields = {
                preferred_body_type: 'preferred_body_type',
                preferred_education: 'preferred_education',
                preferred_religion: 'preferred_religion',
                preferred_smoking: 'preferred_smoking',
                preferred_drinking: 'preferred_drinking',
                preferred_exercise: 'preferred_exercise',
                preferred_number_of_children: 'preferred_number_of_children',
                preferred_eye_color: 'preferred_eye_color',
                preferred_hair_color: 'preferred_hair_color',
                preferred_ethnicity: 'preferred_ethnicity',
                preferred_occupation: 'preferred_occupation',
                preferred_income: 'preferred_income',
                preferred_marital_status: 'preferred_marital_status',
                preferred_lifestyle: 'preferred_lifestyle',
                preferred_body_art: 'preferred_body_art',
                preferred_english_ability: 'preferred_english_ability'
            };

            for (const [payloadKey, columnName] of Object.entries(preferenceIdFields)) {
                if (Object.prototype.hasOwnProperty.call(body, payloadKey)) {
                    preferenceUpdates.push(`${columnName} = $${preferenceIndex++}`);
                    preferenceValues.push(parseNullableInt(body[payloadKey]));
                }
            }

            if (Object.prototype.hasOwnProperty.call(body, 'preferred_children')) {
                preferenceUpdates.push(`preferred_children = $${preferenceIndex++}`);
                preferenceValues.push(normalizeNullableValue(body.preferred_children));
            }

            if (Object.prototype.hasOwnProperty.call(body, 'relationship_type')) {
                preferenceUpdates.push(`relationship_type_id = $${preferenceIndex++}`);
                preferenceValues.push(parseNullableInt(body.relationship_type));
            }

            if (preferenceUpdates.length > 0) {
                preferenceValues.push(targetUserId);
                await client.query(
                    `UPDATE user_preferences SET ${preferenceUpdates.join(', ')} WHERE user_id = $${preferenceIndex}`,
                    preferenceValues
                );
            }

            if (Object.prototype.hasOwnProperty.call(body, 'interest_categories')) {
                const supportsInterestMulti = await this.tableExists('user_interests_multiple', client);
                if (supportsInterestMulti) {
                    const interestIds = ensureArray(body.interest_categories)
                        .map(item => parseNullableInt(item?.id ?? item))
                        .filter(id => id !== null);
                    await client.query('DELETE FROM user_interests_multiple WHERE user_id = $1', [targetUserId]);
                    if (interestIds.length > 0) {
                        const uniqueInterestIds = Array.from(new Set(interestIds));
                        const params = [targetUserId];
                        const valuesSql = uniqueInterestIds.map((id, idx) => {
                            params.push(id);
                            return `($1, $${idx + 2})`;
                        }).join(', ');
                        await client.query(
                            `INSERT INTO user_interests_multiple (user_id, interest_id) VALUES ${valuesSql} ON CONFLICT DO NOTHING`,
                            params
                        );
                    }
                } else {
                    console.warn('⚠️ Skipping interest multi-select sync: user_interests_multiple table not available');
                }
            }

            if (Object.prototype.hasOwnProperty.call(body, 'hobbies')) {
                const supportsHobbyMulti = await this.tableExists('user_hobbies_multiple', client);
                if (supportsHobbyMulti) {
                    const hobbyIds = ensureArray(body.hobbies)
                        .map(item => parseNullableInt(item?.id ?? item))
                        .filter(id => id !== null);
                    await client.query('DELETE FROM user_hobbies_multiple WHERE user_id = $1', [targetUserId]);
                    if (hobbyIds.length > 0) {
                        const uniqueHobbyIds = Array.from(new Set(hobbyIds));
                        const params = [targetUserId];
                        const valuesSql = uniqueHobbyIds.map((id, idx) => {
                            params.push(id);
                            return `($1, $${idx + 2})`;
                        }).join(', ');
                        await client.query(
                            `INSERT INTO user_hobbies_multiple (user_id, hobby_id) VALUES ${valuesSql} ON CONFLICT DO NOTHING`,
                            params
                        );
                    }
                } else {
                    console.warn('⚠️ Skipping hobbies multi-select sync: user_hobbies_multiple table not available');
                }
            }

            if (Object.prototype.hasOwnProperty.call(body, 'preferred_countries')) {
                const supportsPreferredCountries = await this.tableExists('user_preferred_countries', client);
                if (supportsPreferredCountries) {
                    const countryIds = ensureArray(body.preferred_countries)
                        .map(country => parseNullableInt(country?.id ?? country?.country_id ?? country))
                        .filter(id => id !== null);
                    await client.query('DELETE FROM user_preferred_countries WHERE user_id = $1', [targetUserId]);
                    if (countryIds.length > 0) {
                        const uniqueCountryIds = Array.from(new Set(countryIds));
                        const params = [targetUserId];
                        const valuesSql = uniqueCountryIds.map((id, idx) => {
                            params.push(id);
                            return `($1, $${idx + 2})`;
                        }).join(', ');
                        await client.query(
                            `INSERT INTO user_preferred_countries (user_id, country_id) VALUES ${valuesSql} ON CONFLICT DO NOTHING`,
                            params
                        );
                    }
                } else {
                    console.warn('⚠️ Skipping preferred countries sync: user_preferred_countries table not available');
                }
            }

            await client.query('COMMIT');

            if (updatedName && req.session?.user) {
                req.session.user.real_name = updatedName;
            }

            return res.json({
                success: true,
                message: 'Profile updated successfully',
                real_name: updatedName,
                locationLimitReached: false,
                nameLimitReached: false
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Profile update error:', error);
            const statusCode = error.statusCode || 500;
            return res.status(statusCode).json({
                success: false,
                error: statusCode === 500 ? 'Failed to update profile' : error.message
            });
        } finally {
            if (releaseClient) {
                client.release();
            }
        }
    }

    async exportAccountData(req, res) {
        try {
            // Cookie-based auth only (no URL tokens)
            const token = req.cookies?.sessionToken || req.cookies?.session;
            
            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;

            // Get all user data
            const userResult = await this.db.query(`
                SELECT id, real_name, email, birthdate, gender, date_joined, last_login, 
                       email_verified, is_verified, is_suspended, status
                FROM users WHERE id = $1
            `, [userId]);

            const attributesResult = await this.db.query(`
                SELECT * FROM user_attributes WHERE user_id = $1
            `, [userId]);

            const preferencesResult = await this.db.query(`
                SELECT * FROM user_preferences WHERE user_id = $1
            `, [userId]);

            const imagesResult = await this.db.query(`
                SELECT id, file_name, is_profile, uploaded_at FROM user_images WHERE user_id = $1
            `, [userId]);

            const messagesResult = await this.db.query(`
                SELECT id, sender_id, receiver_id, message, timestamp, status, is_read 
                FROM user_messages 
                WHERE sender_id = $1 OR receiver_id = $1
                ORDER BY timestamp DESC
                LIMIT 1000
            `, [userId]);

            const likesResult = await this.db.query(`
                SELECT id, liked_by, liked_user_id, created_at FROM users_likes WHERE liked_by = $1 OR liked_user_id = $1
            `, [userId]);

            const accountData = {
                exportDate: new Date().toISOString(),
                user: userResult.rows[0] || null,
                attributes: attributesResult.rows[0] || null,
                preferences: preferencesResult.rows[0] || null,
                images: imagesResult.rows,
                messages: messagesResult.rows,
                likes: likesResult.rows
            };

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="account-data-${userId}-${Date.now()}.json"`);
            res.json(accountData);

        } catch (error) {
            console.error('❌ Export account data error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to export account data',
                details: error.message
            });
        }
    }

    // Delete user account (self-deletion)
    async deleteAccount(req, res) {
        try {
            // Cookie-based auth only (no URL tokens)
            const token = req.cookies?.sessionToken || req.cookies?.session;
            
            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;

            // Import userManagementService
            const UserManagementService = require('../../services/userManagementService');
            const redisManager = require('../../config/redis');
            
            // Pass the pool instead of DatabaseManager since UserManagementService expects a pool with connect() method
            let dbPool;
            try {
                if (this.db && typeof this.db.getPool === 'function') {
                    dbPool = this.db.getPool();
                } else if (this.db && typeof this.db.connect === 'function') {
                    // If db is already a pool, use it directly
                    dbPool = this.db;
                } else {
                    throw new Error(`Database connection not available. db type: ${typeof this.db}, has getPool: ${typeof this.db?.getPool}, has connect: ${typeof this.db?.connect}`);
                }
            } catch (poolError) {
                console.error('❌ Error getting database pool:', poolError);
                throw new Error(`Database pool error: ${poolError.message}`);
            }
            
            if (!dbPool) {
                throw new Error('Database pool is null or undefined');
            }
            
            console.log(`🔗 Database pool obtained. Type: ${typeof dbPool}, has connect: ${typeof dbPool.connect === 'function'}`);
            const userManagementService = new UserManagementService(dbPool, redisManager);

            // Delete user account (anonymizes instead of hard delete)
            console.log(`🗑️  Attempting to delete user ID: ${userId}`);
            const result = await userManagementService.deleteUser(userId);
            
            if (result && result.success) {
                // Remove from active sessions (user_sessions already deleted in deleteUser)
                try {
                    if (this.auth && this.auth.sessions) {
                        for (const [sessionToken, sessionData] of this.auth.sessions.entries()) {
                            if (sessionData.user && sessionData.user.id === userId) {
                                this.auth.sessions.delete(sessionToken);
                            }
                        }
                    }
                } catch (sessionError) {
                    // Ignore session cleanup errors - user is already deleted
                }
                
                if (!res.headersSent) {
                    return res.json({
                        success: true,
                        message: 'Account deleted successfully'
                    });
                }
            } else {
                if (!res.headersSent) {
                    return res.status(400).json(result || { success: false, error: 'Unknown error' });
                }
            }
        } catch (error) {
            console.error('❌ Delete account error:', error);
            console.error('❌ Error message:', error.message);
            console.error('❌ Error stack:', error.stack);
            if (!res.headersSent) {
                // Always show error details in development, or if NODE_ENV is not production
                const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
                res.status(500).json({
                    success: false,
                    error: 'Failed to delete account',
                    details: isDevelopment ? error.message : 'Internal server error',
                    // Include more details in development
                    ...(isDevelopment && { 
                        stack: error.stack,
                        type: error.constructor.name 
                    })
                });
            }
        }
    }

    // Change account password
    async changePassword(req, res) {
        try {
            const token = req.cookies?.sessionToken || req.cookies?.session;

            if (!token || !this.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            const session = this.auth.sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const userId = session.user.id;
            const { currentPassword, newPassword, confirmPassword } = req.body;

            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Current password, new password, and confirmation are required'
                });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'New password and confirmation do not match'
                });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'New password must be at least 8 characters'
                });
            }

            const result = await this.db.query(
                'SELECT password FROM users WHERE id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password);
            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    error: 'Current password is incorrect'
                });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);

            await this.db.query(
                'UPDATE users SET password = $1 WHERE id = $2',
                [hashedPassword, userId]
            );

            console.log(`✅ Password changed for user ${userId}`);

            res.json({
                success: true,
                message: 'Password changed successfully'
            });

        } catch (error) {
            console.error('❌ Change password error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to change password',
                details: error.message
            });
        }
    }
}

module.exports = AuthController; 

const CompatibilityEngine = require('./matchCompatibilityEngine');
const { hydratePresenceStatuses, normalizeLastSeen } = require('../../utils/presenceStatusHelper');
const { ACCOUNT_STATUS, ensureAccountStatusSchema } = require('../../utils/accountStatus');

class MatchesController {
    constructor(db, redis = null, config = {}, presenceService = null) {
        this.db = db;
        this.redis = redis;
        this.compatibilityEngine = new CompatibilityEngine(db, redis);
        this.presenceService = presenceService;
        this.optionalTables = {
            userContactCountries: null,
            userSessions: null
        };
        this.optionalColumns = {
            usersLastSeenAt: null
        };
        
        // Configuration with defaults
        this.config = {
            pagination: {
                defaultLimit: config.pagination?.defaultLimit || 50,
                maxLimit: config.pagination?.maxLimit || 100,
                minLimit: config.pagination?.minLimit || 1
            },
            onlineStatus: {
                intervalMinutes: config.onlineStatus?.intervalMinutes || 5
            },
            coordinates: {
                defaultLatitude: config.coordinates?.defaultLatitude || 0,
                defaultLongitude: config.coordinates?.defaultLongitude || 0
            },
            compatibility: {
                fallbackScore: config.compatibility?.fallbackScore || 25,
                maxScore: config.compatibility?.maxScore || 95,
                mutualLikeBonus: config.compatibility?.mutualLikeBonus || 6,
                oneWayLikeBonus: config.compatibility?.oneWayLikeBonus || 2
            }
        };
    }

    // Helper method to format profile image path
    formatProfileImage(filename) {
        // Handle null, undefined, or empty string
        if (!filename || (typeof filename === 'string' && filename.trim() === '')) {
            // Return null - let frontend handle gender-specific defaults
            return null;
        }
        
        // Convert to string if not already
        const fileStr = String(filename).trim();
        
        // Return null if already a default path - let frontend handle gender-specific defaults
        if (fileStr.includes('default_profile') || fileStr.startsWith('/assets/images/')) {
            return null;
        }
        
        // If already a full path starting with /uploads/, return as is
        if (fileStr.startsWith('/uploads/') || fileStr.startsWith('uploads/')) {
            return fileStr.startsWith('/') ? fileStr : `/${fileStr}`;
        }
        
        // Otherwise, prepend the uploads path (only for actual filenames)
        return `/uploads/profile_images/${fileStr}`;
    }

    /**
     * Get all matches for a user with filtering
     * Implements the 10-stage matches system flow as documented in MATCHES_SYSTEM_FLOW.md
     */
    async getMatches(req, res) {
        let userId;
        try {
            userId = parseInt(req.params.userId);
            const sessionToken = req.query.token || req.headers['x-session-token'] || 
                                req.headers.authorization?.replace('Bearer ', '');
            
            // Pagination support (Stage 9 preparation)
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || this.config.pagination.defaultLimit;
            const safeLimit = Math.min(
                Math.max(limit, this.config.pagination.minLimit), 
                this.config.pagination.maxLimit
            );
            const offset = (page - 1) * safeLimit;

            // Client-requested server-side filters
            const filterOnlineOnly = req.query.online_only === 'true';
            const filterWithPhotos = req.query.with_photos === 'true';

            if (!userId || isNaN(userId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            await ensureAccountStatusSchema(this.db);

            // Verify user is authenticated and can access their own matches

            // ============================================================
            // STAGE 1: Load User A (current user) data from DB
            // ============================================================
            // Get current user's preferences and info
            const userPrefsResult = await this.db.query(`
                SELECT age_min, age_max, preferred_gender, preferred_smoking, preferred_drinking
                FROM user_preferences
                WHERE user_id = $1
            `, [userId]);
            
            const userPrefs = userPrefsResult.rows[0] || {};
            let preferredAgeMin = userPrefs.age_min;
            let preferredAgeMax = userPrefs.age_max;
            const preferredGender = userPrefs.preferred_gender;
            const normalizePreferenceId = (value) => {
                if (value === null || value === undefined) return null;
                const normalized = String(value).trim().toLowerCase();
                if (!normalized || normalized === '0' || normalized === 'any' || normalized === 'not specified' || normalized === 'null') {
                    return null;
                }
                const parsed = parseInt(normalized, 10);
                return Number.isFinite(parsed) ? parsed : null;
            };
            const preferredSmokingId = normalizePreferenceId(userPrefs.preferred_smoking);
            const preferredDrinkingId = normalizePreferenceId(userPrefs.preferred_drinking);
            
            // Get saved match score preference from user_profile_settings
            const userSettingsResult = await this.db.query(`
                SELECT match_score, require_photos
                FROM user_profile_settings
                WHERE user_id = $1
            `, [userId]);
            // Get match_score (1-100, default to 1 if null/undefined)
            const savedMinCompatibilityScore = userSettingsResult.rows[0]?.match_score ?? 1;
            const currentUserRequirePhotos = Boolean(userSettingsResult.rows[0]?.require_photos);
            const requestedMinCompatibilityScore = parseInt(req.query.minCompatibilityScore, 10);
            const effectiveMinCompatibilityScore = Number.isFinite(requestedMinCompatibilityScore)
                ? Math.max(1, Math.min(100, requestedMinCompatibilityScore))
                : Math.max(1, Math.min(100, parseInt(savedMinCompatibilityScore, 10) || 1));
            
            // Validate age preferences - fix invalid ranges
            if (preferredAgeMin !== null && preferredAgeMax !== null) {
                if (preferredAgeMin > preferredAgeMax) {
                    // Invalid range - swap them or ignore
                    console.warn(`User ${userId} has invalid age range: min=${preferredAgeMin}, max=${preferredAgeMax}. Ignoring age filter.`);
                    preferredAgeMin = null;
                    preferredAgeMax = null;
                }
            }

            // Get current user's preferred countries
            const prefCountriesResult = await this.db.query(`
                SELECT country_id
                FROM user_preferred_countries
                WHERE user_id = $1
            `, [userId]);
            const preferredCountryIds = prefCountriesResult.rows.map(r => r.country_id);

            // Get current user's info
            const currentUserResult = await this.db.query(`
                SELECT u.birthdate, u.gender, u.country_id,
                    ua.smoking_id as current_smoking_id,
                    ua.drinking_id as current_drinking_id,
                    EXTRACT(YEAR FROM AGE(birthdate))::INTEGER as age
                FROM users u
                LEFT JOIN user_attributes ua ON ua.user_id = u.id
                WHERE u.id = $1
            `, [userId]);
            const currentUser = currentUserResult.rows[0];
            const currentSmokingPreferenceId = normalizePreferenceId(currentUser?.current_smoking_id);
            const currentDrinkingPreferenceId = normalizePreferenceId(currentUser?.current_drinking_id);
            if (!currentUser) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Check if compatibility cache table exists
            let compatibilityCacheExists = false;
            try {
                const tableCheck = await this.db.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'user_compatibility_cache'
                    )
                `);
                compatibilityCacheExists = tableCheck.rows[0]?.exists || false;
            } catch (error) {
                compatibilityCacheExists = false;
            }

            if (this.optionalTables.userContactCountries === null) {
                try {
                    const tableCheck = await this.db.query(`
                        SELECT to_regclass('public.user_contact_countries') as table_name
                    `);
                    this.optionalTables.userContactCountries = Boolean(tableCheck.rows[0]?.table_name);
                } catch (error) {
                    this.optionalTables.userContactCountries = false;
                }
                if (this.optionalTables.userContactCountries === false && !this.optionalTables._contactCountriesWarned) {
                    console.warn('user_contact_countries table missing - skipping contact country filter');
                    this.optionalTables._contactCountriesWarned = true;
                }
            }
            const hasUserContactCountries = Boolean(this.optionalTables.userContactCountries);

            if (this.optionalColumns.usersLastSeenAt === null) {
                try {
                    const columnCheck = await this.db.query(`
                        SELECT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'users'
                              AND column_name = 'last_seen_at'
                        ) as exists
                    `);
                    this.optionalColumns.usersLastSeenAt = Boolean(columnCheck.rows[0]?.exists);
                } catch (error) {
                    this.optionalColumns.usersLastSeenAt = false;
                }
                if (!this.optionalColumns.usersLastSeenAt && !this.optionalColumns._lastSeenWarned) {
                    console.warn('users.last_seen_at column missing - using session-based fallback when available');
                    this.optionalColumns._lastSeenWarned = true;
                }
            }
            const hasUsersLastSeenAt = Boolean(this.optionalColumns.usersLastSeenAt);

            if (this.optionalTables.userSessions === null) {
                try {
                    const tableCheck = await this.db.query(`
                        SELECT to_regclass('public.user_sessions') as table_name
                    `);
                    this.optionalTables.userSessions = Boolean(tableCheck.rows[0]?.table_name);
                } catch (error) {
                    this.optionalTables.userSessions = false;
                }
                if (!this.optionalTables.userSessions && !this.optionalTables._userSessionsWarned) {
                    console.warn('user_sessions table missing - session-based last_seen_at fallback disabled');
                    this.optionalTables._userSessionsWarned = true;
                }
            }
            const hasUserSessions = Boolean(this.optionalTables.userSessions);

            const lastSeenSelect = hasUsersLastSeenAt
                ? 'u.last_seen_at'
                : (hasUserSessions ? 'us.last_activity' : 'NULL::timestamptz');
            const lastSeenJoin = hasUsersLastSeenAt || !hasUserSessions
                ? ''
                : `LEFT JOIN LATERAL (
                    SELECT MAX(s.last_activity) as last_activity
                    FROM user_sessions s
                    WHERE s.user_id = u.id
                ) us ON true`;

            // Check if current user has a profile image (for FILTER 6)
            let currentUserHasPhoto = false;
            try {
                const photoCheck = await this.db.query(`
                    SELECT 1 FROM user_images 
                    WHERE user_id = $1
                      AND is_profile = 1
                      AND file_name IS NOT NULL
                      AND approval_status = 'approved'
                    LIMIT 1
                `, [userId]);
                currentUserHasPhoto = photoCheck.rows.length > 0;
            } catch (error) {
                currentUserHasPhoto = false;
            }

            // ============================================================
            // STAGE 2: Eligibility Filtering (SQL query)
            // ============================================================
            // Build the matches query with filtering
            // Show ALL potential matches who meet preferences (not just those who liked)
            // Note: Using subquery wrapper to allow ordering by alias, so DISTINCT is moved to outer query
            // Filters applied:
            // - Exclude self, banned users, blocked users
            // - Gender preference (User A → B)
            // - Country preference (User A → B)
            // - Matched user's contact age range (User B → A)
            // - Matched user's contact countries (User B → A)
            // - Matched user's photo requirement
            // - Matched user's no same-gender contact setting
            // Note: Age preferences are NOT hard filters (users outside range still appear with lower scores)
            let matchesQuery = `
                SELECT
                    u.id,
                    u.real_name,
                    u.birthdate,
                    u.gender,
                    u.country_id,
                    EXTRACT(YEAR FROM AGE(u.birthdate))::INTEGER as age,
                    COALESCE(c.name || ', ' || co.name, c.name, co.name, 'Unknown') as location,
                    -- Get coordinates: prefer city coordinates, fallback to country coordinates
                    COALESCE(c.latitude, co.latitude) as latitude,
                    COALESCE(c.longitude, co.longitude) as longitude,
                    ui.file_name as profile_image,
                    -- Match date: prefer mutual match date, then like date, then user creation date
                    COALESCE(
                        um.match_date,
                        l2.created_at,
                        l1.created_at,
                        u.date_joined
                    ) as match_date,
                    -- is_new_match: true if current user has not yet viewed this match
                    CASE
                        WHEN um.user1_id = $1 THEN (um.user1_seen_at IS NULL)
                        WHEN um.user2_id = $1 THEN (um.user2_seen_at IS NULL)
                        ELSE NULL
                    END as is_new_match,
                    ${lastSeenSelect} as last_seen_at,
                    -- Flag to indicate if this person liked the user
                    CASE WHEN l2.liked_by IS NOT NULL THEN true ELSE false END as liked_by_user,
                    -- Flag to indicate if the user liked this person
                    CASE WHEN l1.liked_by IS NOT NULL THEN true ELSE false END as user_liked_them,
                    -- Check if mutual like exists (both liked each other)
                    CASE 
                        WHEN l1.liked_by IS NOT NULL AND l2.liked_by IS NOT NULL THEN true
                        ELSE false
                    END as is_mutual_like,
                    -- Compatibility score from cache (if available)
                    ${compatibilityCacheExists ? 'comp_cache.score as cached_compatibility_score' : 'NULL::INTEGER as cached_compatibility_score'},
                    upref.preferred_gender,
                    upref.age_min as preferred_age_min,
                    upref.age_max as preferred_age_max
                FROM users u
                LEFT JOIN city c ON u.city_id = c.id
                LEFT JOIN country co ON u.country_id = co.id
                LEFT JOIN LATERAL (
                    SELECT ui_choice.file_name
                    FROM user_images ui_choice
                    WHERE ui_choice.user_id = u.id
                      AND ui_choice.file_name IS NOT NULL
                      AND ui_choice.approval_status = 'approved'
                    ORDER BY
                        CASE
                            WHEN ui_choice.is_profile = 1 THEN 0
                            ELSE 1
                        END,
                        ui_choice.id DESC
                    LIMIT 1
                ) ui ON true
                LEFT JOIN user_matches um ON (
                    (um.user1_id = $1 AND um.user2_id = u.id) OR
                    (um.user1_id = u.id AND um.user2_id = $1)
                ) AND (um.status IS NULL OR um.status = 'active')
                LEFT JOIN users_likes l1 ON l1.liked_by = $1 AND l1.liked_user_id = u.id
                LEFT JOIN users_likes l2 ON l2.liked_by = u.id AND l2.liked_user_id = $1
                LEFT JOIN user_profile_settings ups ON ups.user_id = u.id
                LEFT JOIN user_preferences upref ON upref.user_id = u.id
                LEFT JOIN user_attributes ua_match ON ua_match.user_id = u.id
                ${lastSeenJoin}
                ${compatibilityCacheExists ? `LEFT JOIN user_compatibility_cache comp_cache ON 
                    comp_cache.user_id = $1 
                    AND comp_cache.target_user_id = u.id` : ''}
                WHERE 
                    -- CRITICAL: Exclude blocked users (BOTH DIRECTIONS)
                    NOT EXISTS (
                        SELECT 1 FROM users_blocked_by_users bu
                        WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                           OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                    )
                    
                    -- Only active, non-suspended/banned users
                    AND COALESCE(u.is_suspended, false) = false
                    AND COALESCE(u.account_status, 'active') = 'active'
                    
                    -- Exclude self
                    AND u.id != $1
                    
                    -- Must have a name
                    AND u.real_name IS NOT NULL
            `;

            const queryParams = [userId];
            let paramIndex = 2;

            // FILTER 1: Current user's age preference (What I'm Looking For)
            // NOTE: We no longer filter by age - users outside preferred range will still appear
            // but with lower compatibility scores (handled by calculateAgeScore function)
            // This allows users to see more matches, with age preferences affecting score rather than visibility

            // FILTER 2: Current user's gender preference (What I'm Looking For)
            // Show all users who meet gender preferences
            // Note: Gender values are normalized to lowercase "male" and "female"
            if (preferredGender && preferredGender !== '' && preferredGender !== 'any') {
                // Normalize preferred gender to lowercase (handle legacy "m"/"M" and "f"/"F" variations)
                const normalizedPref = preferredGender.toLowerCase().trim();
                let dbGender = normalizedPref;
                
                // Map legacy values to normalized values
                if (normalizedPref === 'm') {
                    dbGender = 'male';
                } else if (normalizedPref === 'f') {
                    dbGender = 'female';
                }
                
                matchesQuery += ` AND LOWER(TRIM(u.gender)) = $${paramIndex}`;
                queryParams.push(dbGender);
                paramIndex++;
            }

            // FILTER 3: Current user's preferred countries (What I'm Looking For)
            if (preferredCountryIds.length > 0) {
                matchesQuery += ` AND u.country_id = ANY($${paramIndex}::int[])`;
                queryParams.push(preferredCountryIds);
                paramIndex++;
            }

            // FILTER 3A: Current user's smoking/drinking preferences (What I'm Looking For)
            // Apply only when a specific preference is selected (not Any/0/null)
            if (preferredSmokingId !== null) {
                matchesQuery += ` AND TRIM(COALESCE(ua_match.smoking_id::text, '')) = $${paramIndex}`;
                queryParams.push(String(preferredSmokingId));
                paramIndex++;
            }

            if (preferredDrinkingId !== null) {
                matchesQuery += ` AND TRIM(COALESCE(ua_match.drinking_id::text, '')) = $${paramIndex}`;
                queryParams.push(String(preferredDrinkingId));
                paramIndex++;
            }

            // FILTER 3AA: Matched user's smoking/drinking preferences (Who can contact them)
            // Always enforce the matched user's preference.
            // If current user hasn't set smoking/drinking, they only match users with no preference.
            if (currentSmokingPreferenceId !== null) {
                matchesQuery += `
                    AND (
                        upref.preferred_smoking IS NULL
                        OR TRIM(upref.preferred_smoking::text) = ''
                        OR TRIM(upref.preferred_smoking::text) = '0'
                        OR TRIM(upref.preferred_smoking::text) = $${paramIndex}
                    )
                `;
                queryParams.push(String(currentSmokingPreferenceId));
                paramIndex++;
            } else {
                matchesQuery += `
                    AND (
                        upref.preferred_smoking IS NULL
                        OR TRIM(upref.preferred_smoking::text) = ''
                        OR TRIM(upref.preferred_smoking::text) = '0'
                    )
                `;
            }

            if (currentDrinkingPreferenceId !== null) {
                matchesQuery += `
                    AND (
                        upref.preferred_drinking IS NULL
                        OR TRIM(upref.preferred_drinking::text) = ''
                        OR TRIM(upref.preferred_drinking::text) = '0'
                        OR TRIM(upref.preferred_drinking::text) = $${paramIndex}
                    )
                `;
                queryParams.push(String(currentDrinkingPreferenceId));
                paramIndex++;
            } else {
                matchesQuery += `
                    AND (
                        upref.preferred_drinking IS NULL
                        OR TRIM(upref.preferred_drinking::text) = ''
                        OR TRIM(upref.preferred_drinking::text) = '0'
                    )
                `;
            }

            // FILTER 3B: Current user's "only users with photos can contact me"
            // If enabled, only show users who actually have uploaded photos.
            if (currentUserRequirePhotos) {
                matchesQuery += `
                    AND EXISTS (
                        SELECT 1
                        FROM user_images ui_required
                        WHERE ui_required.user_id = u.id
                          AND ui_required.file_name IS NOT NULL
                          AND ui_required.approval_status = 'approved'
                    )
                `;
            }

            // FILTER 4-7: Matched user's settings (Account Settings - who can contact them)
            // Optimized: Using pre-joined user_profile_settings instead of subqueries
            if (currentUser.birthdate) {
                const currentUserAge = currentUser.age;
                matchesQuery += `
                    -- FILTER 4: Matched user's age settings
                    AND (ups.contact_age_min IS NULL OR $${paramIndex} >= ups.contact_age_min)
                    AND (ups.contact_age_max IS NULL OR $${paramIndex} <= ups.contact_age_max)
                `;
                queryParams.push(currentUserAge);
                paramIndex++;
            }

            // FILTER 5: Matched user's country restrictions (skip if table missing)
            if (hasUserContactCountries) {
                matchesQuery += `
                    AND (
                        NOT EXISTS (SELECT 1 FROM user_contact_countries WHERE user_id = u.id)
                        OR EXISTS (
                            SELECT 1 FROM user_contact_countries ucc
                            WHERE ucc.user_id = u.id AND ucc.is_all_countries = true
                        )
                        OR EXISTS (
                            SELECT 1 FROM user_contact_countries ucc
                            WHERE ucc.user_id = u.id AND ucc.country_id = $${paramIndex}
                        )
                    )
                `;
                queryParams.push(currentUser.country_id ?? null);
                paramIndex++;
            }

            // FILTER 6: Matched user's photo requirement
            matchesQuery += `
                AND (ups.require_photos = false OR ups.require_photos IS NULL OR $${paramIndex} = true)
            `;
            queryParams.push(currentUserHasPhoto);
            paramIndex++;

            // FILTER 7: Matched user's same gender contact setting
            // Note: Gender values are normalized to lowercase "male" and "female"
            if (currentUser.gender) {
                // Normalize current user's gender for comparison
                const currentUserGenderNorm = (currentUser.gender || '').toLowerCase().trim();
                let dbGender = currentUserGenderNorm;
                
                // Map legacy values to normalized values
                if (currentUserGenderNorm === 'm') {
                    dbGender = 'male';
                } else if (currentUserGenderNorm === 'f') {
                    dbGender = 'female';
                }
                
                matchesQuery += `
                    AND (ups.no_same_gender_contact = false OR ups.no_same_gender_contact IS NULL OR 
                    LOWER(TRIM(u.gender)) != $${paramIndex})
                `;
                queryParams.push(dbGender);
                paramIndex++;
            }

            // FILTER 8: Exclude users already in contact (existing messages)
            // If there is any message exchanged, consider them "in contact"
            matchesQuery += `
                AND NOT EXISTS (
                    SELECT 1 FROM user_messages m
                    WHERE (m.sender_id = $1 AND m.receiver_id = u.id)
                       OR (m.sender_id = u.id AND m.receiver_id = $1)
                    AND COALESCE(m.deleted_by_receiver, false) = false
                    AND COALESCE(m.deleted_by_sender, false) = false
                    AND COALESCE(m.recall_type, 'none') = 'none'
                    AND COALESCE(m.message_type, 'text') != 'like'
                )
            `;

            // FILTER 9: Online only (server-side)
            if (filterOnlineOnly) {
                matchesQuery += ` AND u.last_login > NOW() - INTERVAL '5 minutes'`;
            }

            // FILTER 10: With photos only (server-side)
            // Uses LATERAL join result - ui.file_name IS NOT NULL means approved photos exist
            if (filterWithPhotos) {
                matchesQuery += ` AND ui.file_name IS NOT NULL`;
            }

            // Wrap in subquery to allow ordering by alias and add pagination
            matchesQuery = `SELECT DISTINCT * FROM (${matchesQuery}) as matches_subquery ORDER BY 
                -- Sort by: mutual likes first, then people who liked user, then people user liked, then online, then compatibility, then recent
                is_mutual_like DESC,
                liked_by_user DESC,
                user_liked_them DESC,
                cached_compatibility_score DESC NULLS LAST,
                match_date DESC NULLS LAST
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            queryParams.push(safeLimit, offset);

            let result;
            try {
                result = await this.db.query(matchesQuery, queryParams);
            } catch (queryError) {
                throw queryError;
            }

            // Check if result is valid
            if (!result || !result.rows) {
                return res.status(500).json({
                    success: false,
                    error: 'Invalid query result'
                });
            }

            // ============================================================
            // STAGE 3: Gather compatibility data
            // ============================================================
            // Fetch current user's full attributes (getUserCompatibilityData)
            // Includes: interests, hobbies, lifestyle, values, personality
            let currentUserData;
            try {
                currentUserData = await this.getUserCompatibilityData(userId);
            } catch (error) {
                // Fill missing data with defaults if any field is null
                currentUserData = { interests: [], hobbies: [], values: {}, lifestyle: {}, personality: [] };
            }
            
            // Add additional data: Age, birthdate, country, coordinates, age preferences
            // Fill missing data with defaults if any field is null (no penalties)
            if (currentUser.birthdate) {
                currentUserData.birthdate = currentUser.birthdate;
            }
            if (currentUser.age !== null && currentUser.age !== undefined) {
                currentUserData.age = currentUser.age;
            }
            if (currentUser.country_id) {
                currentUserData.country_id = currentUser.country_id;
            }
            // Add age preferences for calculateAgeScore function
            if (preferredAgeMin !== null && preferredAgeMin !== undefined) {
                currentUserData.age_pref_min = preferredAgeMin;
            }
            if (preferredAgeMax !== null && preferredAgeMax !== undefined) {
                currentUserData.age_pref_max = preferredAgeMax;
            }
            // Get current user's coordinates (from city or country)
            try {
                const currentUserCoords = await this.db.query(`
                    SELECT 
                        COALESCE(c.latitude, co.latitude) as latitude,
                        COALESCE(c.longitude, co.longitude) as longitude
                    FROM users u
                    LEFT JOIN city c ON u.city_id = c.id
                    LEFT JOIN country co ON u.country_id = co.id
                    WHERE u.id = $1
                `, [userId]);
                if (currentUserCoords.rows.length > 0 && 
                    currentUserCoords.rows[0].latitude !== null && 
                    currentUserCoords.rows[0].latitude !== undefined &&
                    currentUserCoords.rows[0].longitude !== null && 
                    currentUserCoords.rows[0].longitude !== undefined) {
                    currentUserData.latitude = parseFloat(currentUserCoords.rows[0].latitude);
                    currentUserData.longitude = parseFloat(currentUserCoords.rows[0].longitude);
                }
                // If coordinates are missing, leave undefined (distance modifier will be 0)
            } catch (error) {
                // If coordinates can't be fetched, leave undefined (distance modifier will be 0)
                // Don't set to 0/0 as that would incorrectly calculate distance
            }
            
            // ============================================================
            // STAGE 4-7: Process each match and calculate compatibility
            // ============================================================
            // Process matches and calculate compatibility scores
            const computedMatches = await Promise.all(result.rows.map(async (match) => {
                // STAGE 4: Check compatibility cache (optional)
                // If user_compatibility_cache exists, try to fetch cached_compatibility_score
                // If exists, use it; else calculate
                let compatibilityScore = match.cached_compatibility_score;
                
                // STAGE 5: Calculate base compatibility score (if not cached)
                // Compare User A ↔ User B:
                // - Shared interests & hobbies
                // - Lifestyle match
                // - Values & personality alignment
                // - Age difference scoring (0-2 years → max, 3-5 → slightly lower, 6-10 → moderate, 10+ → minimal)
                // - Country preference (match → full points, no match → 0)
                // - If profile data missing → use defaults (no penalties)
                if (compatibilityScore === null || compatibilityScore === undefined) {
                    try {
                        // Fetch matched user's attributes (getUserCompatibilityData)
                        const matchedUserData = await this.getUserCompatibilityData(match.id);
                        // Add matched user's birthdate/age/country/coordinates to compatibility data
                        // Fill missing data with defaults if any field is null
                        if (match.birthdate) {
                            matchedUserData.birthdate = match.birthdate;
                        }
                        if (match.age) {
                            matchedUserData.age = match.age;
                        }
                        if (match.country_id) {
                            matchedUserData.country_id = match.country_id;
                        }
                        // Only set coordinates if they exist (not null/undefined)
                        // If missing, leave undefined so distance modifier is ignored (returns 0)
                        // Setting to 0/0 would incorrectly calculate distance and apply wrong modifier
                        if (match.latitude !== null && match.latitude !== undefined &&
                            match.longitude !== null && match.longitude !== undefined) {
                            matchedUserData.latitude = parseFloat(match.latitude);
                            matchedUserData.longitude = parseFloat(match.longitude);
                        }
                        // If coordinates are missing, leave undefined (distance modifier will be 0)
                        compatibilityScore = await this.compatibilityEngine.getCompatibility(
                            userId,
                            match.id,
                            currentUserData,
                            matchedUserData
                        );
                    } catch (error) {
                        // Fallback: if calculation fails completely, use configured fallback score
                        console.error(`Error calculating compatibility for user ${match.id}:`, error);
                        compatibilityScore = this.config.compatibility.fallbackScore;
                    }
                }
                
                // Ensure score is a valid number
                if (compatibilityScore === null || compatibilityScore === undefined || isNaN(compatibilityScore)) {
                    compatibilityScore = this.config.compatibility.fallbackScore;
                }
                
                // STAGE 6: Add bonus points for likes
                // Apply like bonus based on like status
                // Anti-gaming: Bonus applies only once, does not stack, does not push above max score
                if (match.is_mutual_like) {
                    // Both users liked each other - stronger chemistry signal
                    compatibilityScore = Math.min(
                        this.config.compatibility.maxScore, 
                        compatibilityScore + this.config.compatibility.mutualLikeBonus
                    );
                } else if (match.liked_by_user || match.user_liked_them) {
                    // One-way like - smaller chemistry signal
                    compatibilityScore = Math.min(
                        this.config.compatibility.maxScore, 
                        compatibilityScore + this.config.compatibility.oneWayLikeBonus
                    );
                }
                
                // STAGE 7: Assign compatibility badge
                const badge = this.compatibilityEngine.getCompatibilityBadge(compatibilityScore);
                
                // STAGE 8: Format match result
                return {
                    id: match.id,
                    user_id: match.id,
                    real_name: match.real_name,
                    name: match.real_name,
                    age: match.age,
                    birthdate: match.birthdate,
                    gender: match.gender,
                    location: match.location,
                    profile_image: this.formatProfileImage(match.profile_image),
                    avatar: this.formatProfileImage(match.profile_image),
                    preferred_gender: match.preferred_gender || null,
                    seeking_gender: match.preferred_gender || match.seeking_gender || null,
                    preferred_age_min: match.preferred_age_min ?? null,
                    preferred_age_max: match.preferred_age_max ?? null,
                    seeking_age_min: match.preferred_age_min ?? match.seeking_age_min ?? null,
                    seeking_age_max: match.preferred_age_max ?? match.seeking_age_max ?? null,
                    match_date: match.match_date,
                    is_new_match: match.is_new_match ?? null,
                    is_online: false,
                    last_seen_at: normalizeLastSeen(match.last_seen_at),
                    liked_by_user: match.liked_by_user || false,
                    user_liked_them: match.user_liked_them || false,
                    is_mutual_like: match.is_mutual_like || false,
                    compatibility_score: compatibilityScore,
                    compatibility_badge: badge
                };
            }));

            // Enforce minimum compatibility on backend (not frontend-only)
            const matches = computedMatches.filter((match) => {
                const score = Number(match.compatibility_score || 0);
                return score >= effectiveMinCompatibilityScore;
            });

            await hydratePresenceStatuses(this.presenceService, matches, {
                idSelector: (row) => row.user_id,
                assign: (record, status) => {
                    const isOnline = Boolean(status?.isOnline);
                    record.is_online = isOnline;
                    if (status?.lastSeen) {
                        record.last_seen_at = normalizeLastSeen(status.lastSeen);
                    } else if (record.last_seen_at) {
                        record.last_seen_at = normalizeLastSeen(record.last_seen_at);
                    } else {
                        record.last_seen_at = null;
                    }
                }
            });

            // ============================================================
            // STAGE 9: Pagination & Sorting (already applied in SQL query)
            // ============================================================
            // Get total count for pagination (optional - can be expensive, so make it optional)
            let totalCount = null;
            if (req.query.include_total === 'true') {
                try {
                    const countParams = [userId];
                    let countParamIndex = 2;
                    const countConditions = [
                        `NOT EXISTS (
                            SELECT 1 FROM users_blocked_by_users bu
                            WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                               OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                        )`,
                        `COALESCE(u.is_suspended, false) = false`,
                        `COALESCE(u.account_status, 'active') = 'active'`,
                        `u.id != $1`,
                        `u.real_name IS NOT NULL`
                    ];

                    // FILTER 2: Current user's gender preference (mirror from matches query)
                    if (preferredGender && preferredGender !== '' && preferredGender !== 'any') {
                        const normalizedPref = preferredGender.toLowerCase().trim();
                        let dbGender = normalizedPref;
                        if (normalizedPref === 'm') {
                            dbGender = 'male';
                        } else if (normalizedPref === 'f') {
                            dbGender = 'female';
                        }
                        countConditions.push(`LOWER(TRIM(u.gender)) = $${countParamIndex}`);
                        countParams.push(dbGender);
                        countParamIndex++;
                    }

                    // FILTER 3: Current user's preferred countries (mirror from matches query)
                    if (preferredCountryIds.length > 0) {
                        countConditions.push(`u.country_id = ANY($${countParamIndex}::int[])`);
                        countParams.push(preferredCountryIds);
                        countParamIndex++;
                    }

                    // FILTER 3A: Current user's smoking/drinking preferences (mirror from matches query)
                    if (preferredSmokingId !== null) {
                        countConditions.push(`TRIM(COALESCE(ua_match.smoking_id::text, '')) = $${countParamIndex}`);
                        countParams.push(String(preferredSmokingId));
                        countParamIndex++;
                    }

                    if (preferredDrinkingId !== null) {
                        countConditions.push(`TRIM(COALESCE(ua_match.drinking_id::text, '')) = $${countParamIndex}`);
                        countParams.push(String(preferredDrinkingId));
                        countParamIndex++;
                    }

                    // FILTER 3AA: Matched user's smoking/drinking preferences (mirror from matches query)
                    if (currentSmokingPreferenceId !== null) {
                        countConditions.push(`(
                            upref.preferred_smoking IS NULL
                            OR TRIM(upref.preferred_smoking::text) = ''
                            OR TRIM(upref.preferred_smoking::text) = '0'
                            OR TRIM(upref.preferred_smoking::text) = $${countParamIndex}
                        )`);
                        countParams.push(String(currentSmokingPreferenceId));
                        countParamIndex++;
                    } else {
                        countConditions.push(`(
                            upref.preferred_smoking IS NULL
                            OR TRIM(upref.preferred_smoking::text) = ''
                            OR TRIM(upref.preferred_smoking::text) = '0'
                        )`);
                    }

                    if (currentDrinkingPreferenceId !== null) {
                        countConditions.push(`(
                            upref.preferred_drinking IS NULL
                            OR TRIM(upref.preferred_drinking::text) = ''
                            OR TRIM(upref.preferred_drinking::text) = '0'
                            OR TRIM(upref.preferred_drinking::text) = $${countParamIndex}
                        )`);
                        countParams.push(String(currentDrinkingPreferenceId));
                        countParamIndex++;
                    } else {
                        countConditions.push(`(
                            upref.preferred_drinking IS NULL
                            OR TRIM(upref.preferred_drinking::text) = ''
                            OR TRIM(upref.preferred_drinking::text) = '0'
                        )`);
                    }

                    // FILTER 3B: Current user's "only users with photos can contact me"
                    if (currentUserRequirePhotos) {
                        countConditions.push(`EXISTS (
                            SELECT 1
                            FROM user_images ui_required
                            WHERE ui_required.user_id = u.id
                              AND ui_required.file_name IS NOT NULL
                              AND ui_required.approval_status = 'approved'
                        )`);
                    }

                    // FILTER 4-7: Matched user's settings (mirror from matches query)
                    if (currentUser.birthdate) {
                        const currentUserAge = currentUser.age;
                        countConditions.push(`(ups.contact_age_min IS NULL OR $${countParamIndex} >= ups.contact_age_min)`);
                        countConditions.push(`(ups.contact_age_max IS NULL OR $${countParamIndex} <= ups.contact_age_max)`);
                        countParams.push(currentUserAge);
                        countParamIndex++;
                    }

                    // FILTER 5: Matched user's country restrictions (mirror from matches query)
                    if (hasUserContactCountries) {
                        countConditions.push(`(
                            NOT EXISTS (SELECT 1 FROM user_contact_countries WHERE user_id = u.id)
                            OR EXISTS (
                                SELECT 1 FROM user_contact_countries ucc
                                WHERE ucc.user_id = u.id AND ucc.is_all_countries = true
                            )
                            OR EXISTS (
                                SELECT 1 FROM user_contact_countries ucc
                                WHERE ucc.user_id = u.id AND ucc.country_id = $${countParamIndex}
                            )
                        )`);
                        countParams.push(currentUser.country_id ?? null);
                        countParamIndex++;
                    }

                    // FILTER 6: Matched user's photo requirement (mirror from matches query)
                    countConditions.push(`(ups.require_photos = false OR ups.require_photos IS NULL OR $${countParamIndex} = true)`);
                    countParams.push(currentUserHasPhoto);
                    countParamIndex++;

                    // FILTER 7: Matched user's same gender contact setting (mirror from matches query)
                    if (currentUser.gender) {
                        const currentUserGenderNorm = (currentUser.gender || '').toLowerCase().trim();
                        let dbGender = currentUserGenderNorm;
                        if (currentUserGenderNorm === 'm') {
                            dbGender = 'male';
                        } else if (currentUserGenderNorm === 'f') {
                            dbGender = 'female';
                        }
                        countConditions.push(`(ups.no_same_gender_contact = false OR ups.no_same_gender_contact IS NULL OR LOWER(TRIM(u.gender)) != $${countParamIndex})`);
                        countParams.push(dbGender);
                        countParamIndex++;
                    }

                    // FILTER 8: Exclude users already in contact (mirror from matches query)
                    countConditions.push(`NOT EXISTS (
                        SELECT 1 FROM user_messages m
                        WHERE (m.sender_id = $1 AND m.receiver_id = u.id)
                           OR (m.sender_id = u.id AND m.receiver_id = $1)
                        AND COALESCE(m.deleted_by_receiver, false) = false
                        AND COALESCE(m.deleted_by_sender, false) = false
                        AND COALESCE(m.recall_type, 'none') = 'none'
                        AND COALESCE(m.message_type, 'text') != 'like'
                    )`);

                    // FILTER 9: Online only (mirror from matches query)
                    if (filterOnlineOnly) {
                        countConditions.push(`u.last_login > NOW() - INTERVAL '5 minutes'`);
                    }

                    // FILTER 10: With photos only (mirror from matches query)
                    if (filterWithPhotos) {
                        countConditions.push(`EXISTS (
                            SELECT 1 FROM user_images ui_photo
                            WHERE ui_photo.user_id = u.id
                              AND ui_photo.file_name IS NOT NULL
                              AND ui_photo.approval_status = 'approved'
                        )`);
                    }

                    // NOTE: Do NOT apply min compatibility score filter to count query.
                    // The cache is incomplete (only users already matched/viewed are cached),
                    // so filtering by cached score would exclude all uncached users and
                    // severely undercount the total. The total represents the full eligible pool.

                    const countResult = await this.db.query(`
                        SELECT COUNT(DISTINCT u.id) as count
                        FROM users u
                        LEFT JOIN user_profile_settings ups ON ups.user_id = u.id
                        LEFT JOIN user_preferences upref ON upref.user_id = u.id
                        LEFT JOIN user_attributes ua_match ON ua_match.user_id = u.id
                        WHERE ${countConditions.join('\n                            AND ')}
                    `, countParams);
                    totalCount = parseInt(countResult.rows[0]?.count || 0);
                } catch (error) {
                    // If count query fails, just omit total
                }
            }

            // Mark matches as seen for the current user (non-blocking)
            try {
                await Promise.all([
                    this.db.query(
                        'UPDATE user_matches SET user1_seen_at = NOW() WHERE user1_id = $1 AND user1_seen_at IS NULL',
                        [userId]
                    ),
                    this.db.query(
                        'UPDATE user_matches SET user2_seen_at = NOW() WHERE user2_id = $1 AND user2_seen_at IS NULL',
                        [userId]
                    )
                ]);
            } catch (seenError) {
                console.warn('Failed to update match seen_at:', seenError.message);
            }

            // ============================================================
            // STAGE 10: Return JSON response
            // ============================================================
            const responsePayload = {
                success: true,
                matches: matches,
                minCompatibilityScore: effectiveMinCompatibilityScore,
                pagination: {
                    page: page,
                    limit: safeLimit,
                    count: matches.length,
                    ...(totalCount !== null && { total: totalCount, total_pages: Math.ceil(totalCount / safeLimit) })
                }
            };

            res.json(responsePayload);

        } catch (error) {
            console.error('MatchesController.getMatches error', {
                userId: userId || req?.params?.userId,
                message: error?.message,
                detail: error?.detail,
                code: error?.code,
                stack: error?.stack
            });
            res.status(500).json({
                success: false,
                error: 'Failed to get matches',
                details: error.message
            });
        }
    }

    // Get total active users count
    async getTotalUsers(req, res) {
        try {
            await ensureAccountStatusSchema(this.db);

            const result = await this.db.query(`
                SELECT COUNT(*) as count
                FROM users
                WHERE COALESCE(is_suspended, false) = false
                    AND COALESCE(account_status, 'active') = $1
                    AND real_name IS NOT NULL
            `, [ACCOUNT_STATUS.ACTIVE]);

            res.json({
                success: true,
                count: parseInt(result.rows[0]?.count || 0)
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to get total users',
                details: error.message
            });
        }
    }

    // Get matches created today
    async getMatchesToday(req, res) {
        try {
            const result = await this.db.query(`
                SELECT COUNT(*) as count
                FROM user_matches
                WHERE match_date >= CURRENT_DATE 
                    AND match_date < CURRENT_DATE + INTERVAL '1 day'
                    AND (status IS NULL OR status = 'active')
            `);

            res.json({
                success: true,
                count: parseInt(result.rows[0]?.count || 0)
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to get matches today',
                details: error.message
            });
        }
    }

    // Get currently online users count
    async getOnlineUsers(req, res) {
        try {
            await ensureAccountStatusSchema(this.db);

            const result = await this.db.query(`
                SELECT COUNT(DISTINCT user_sessions.user_id) as count
                FROM user_sessions
                INNER JOIN users ON users.id = user_sessions.user_id
                WHERE user_sessions.is_active = true
                    AND user_sessions.last_activity > NOW() - INTERVAL $1
                    AND COALESCE(users.account_status, 'active') = $2
            `, [`${this.config.onlineStatus.intervalMinutes} minutes`, ACCOUNT_STATUS.ACTIVE]);

            res.json({
                success: true,
                count: parseInt(result.rows[0]?.count || 0)
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to get online users',
                details: error.message
            });
        }
    }

    /**
     * Get user data needed for compatibility calculation
     * Fetches interests, lifestyle, values, and personality data
     * 
     * @param {number} userId - User ID
     * @returns {Promise<Object>} User compatibility data
     */
    async getUserCompatibilityData(userId) {
        try {
            // Get user attributes
            const userAttrsResult = await this.db.query(`
                SELECT 
                    ua.religion_id,
                    ua.have_children,
                    ua.marital_status_id,
                        ua.smoking_id,
                    ua.drinking_id,
                    ua.exercise_habits_id,
                    ua.living_situation_id,
                    ua.lifestyle_id,
                    ua.education_id,
                    ua.occupation_category_id,
                    ua.height_cm,
                    ua.weight_kg,
                    ua.body_type_id,
                    ua.ethnicity_id,
                    ua.eye_color_id,
                    ua.hair_color_id,
                    ua.body_art_id,
                    ua.english_ability_id,
                    ua.number_of_children_id,
                    ua.income_id
                FROM user_attributes ua
                WHERE ua.user_id = $1
            `, [userId]);

            const userAttrs = userAttrsResult.rows[0] || {};

            // Get all preferences
            const prefsResult = await this.db.query(`
                SELECT 
                    relationship_type_id::text AS relationship_type,
                    preferred_height,
                    preferred_weight,
                    preferred_exercise,
                    preferred_body_type,
                    preferred_lifestyle,
                    preferred_body_art,
                    preferred_education,
                    preferred_occupation,
                    preferred_income,
                    preferred_religion,
                    preferred_smoking,
                    preferred_drinking,
                    preferred_children,
                    preferred_number_of_children,
                    preferred_marital_status,
                    preferred_ethnicity,
                    preferred_eye_color,
                    preferred_hair_color,
                    preferred_english_ability
                FROM user_preferences
                WHERE user_id = $1
            `, [userId]);
            const prefs = prefsResult.rows[0] || {};
            const relationshipType = prefs.relationship_type || null;

            // Get interests
            let interests = [];
            try {
                // Try with interest_id first (if using interests table)
                const interestsResult = await this.db.query(`
                    SELECT 
                        ui.interest_id as id,
                        i.id as interest_id,
                        i.name
                    FROM user_interests ui
                    JOIN interests i ON ui.interest_id = i.id
                    WHERE ui.user_id = $1
                `, [userId]);
                interests = interestsResult.rows || [];
            } catch (error) {
                // If that fails, try with interest_category_id (if using interest_categories table)
                try {
                    const interestsResult = await this.db.query(`
                        SELECT 
                            ui.interest_category_id as id,
                            ic.id as interest_id,
                            ic.name
                        FROM user_interests ui
                        JOIN interest_categories ic ON ui.interest_category_id = ic.id
                        WHERE ui.user_id = $1
                    `, [userId]);
                    interests = interestsResult.rows || [];
                } catch (error2) {
                    // If both fail, just return empty array
                    interests = [];
                }
            }

            // Get hobbies (if available)
            let hobbies = [];
            try {
                const hobbiesResult = await this.db.query(`
                    SELECT 
                        uh.hobby_id as id,
                        h.id as hobby_id,
                        h.name
                    FROM user_hobbies uh
                    JOIN hobbies h ON uh.hobby_id = h.id
                    WHERE uh.user_id = $1
                `, [userId]);
                hobbies = hobbiesResult.rows || [];
            } catch (error) {
                // Hobbies table might not exist
            }

            return {
                interests: interests,
                hobbies: hobbies,
                religion_id: userAttrs.religion_id,
                have_children: userAttrs.have_children,
                marital_status_id: userAttrs.marital_status_id,
                relationship_type: relationshipType,
                    smoking_id: userAttrs.smoking_id,
                drinking_id: userAttrs.drinking_id,
                exercise_habits_id: userAttrs.exercise_habits_id,
                living_situation_id: userAttrs.living_situation_id,
                lifestyle_id: userAttrs.lifestyle_id,
                education_id: userAttrs.education_id,
                occupation_category_id: userAttrs.occupation_category_id,
                // Additional attributes for preference matching
                height_cm: userAttrs.height_cm,
                weight_kg: userAttrs.weight_kg,
                body_type_id: userAttrs.body_type_id,
                ethnicity_id: userAttrs.ethnicity_id,
                eye_color_id: userAttrs.eye_color_id,
                hair_color_id: userAttrs.hair_color_id,
                body_art_id: userAttrs.body_art_id,
                english_ability_id: userAttrs.english_ability_id,
                number_of_children_id: userAttrs.number_of_children_id,
                income_id: userAttrs.income_id,
                // Preferences (what user is looking for)
                preferred_height: prefs.preferred_height || null,
                preferred_weight: prefs.preferred_weight || null,
                preferred_exercise: prefs.preferred_exercise || null,
                preferred_body_type: prefs.preferred_body_type || null,
                preferred_lifestyle: prefs.preferred_lifestyle || null,
                preferred_body_art: prefs.preferred_body_art || null,
                preferred_education: prefs.preferred_education || null,
                preferred_occupation: prefs.preferred_occupation || null,
                preferred_income: prefs.preferred_income || null,
                preferred_religion: prefs.preferred_religion || null,
                preferred_smoking: prefs.preferred_smoking || null,
                preferred_drinking: prefs.preferred_drinking || null,
                preferred_children: prefs.preferred_children || null,
                preferred_number_of_children: prefs.preferred_number_of_children || null,
                preferred_marital_status: prefs.preferred_marital_status || null,
                preferred_ethnicity: prefs.preferred_ethnicity || null,
                preferred_eye_color: prefs.preferred_eye_color || null,
                preferred_hair_color: prefs.preferred_hair_color || null,
                preferred_english_ability: prefs.preferred_english_ability || null
            };
        } catch (error) {
            // Return empty object if error
            return {
                interests: [],
                hobbies: []
            };
        }
    }

    /**
     * Unmatch a user - Remove match from user_matches table
     */
    async unmatchUser(req, res) {
        try {
            const currentUserId = parseInt(req.params.userId);
            const unmatchUserId = parseInt(req.query.userId || req.body.userId);

            if (!unmatchUserId || isNaN(unmatchUserId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID to unmatch'
                });
            }

            if (currentUserId === unmatchUserId) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot unmatch yourself'
                });
            }

            // Delete match from user_matches table (check both directions)
            const result = await this.db.query(`
                DELETE FROM user_matches
                WHERE (user1_id = $1 AND user2_id = $2)
                   OR (user1_id = $2 AND user2_id = $1)
            `, [currentUserId, unmatchUserId]);

            // Also remove likes between these users
            await this.db.query(`
                DELETE FROM users_likes
                WHERE (liked_by = $1 AND liked_user_id = $2)
                   OR (liked_by = $2 AND liked_user_id = $1)
            `, [currentUserId, unmatchUserId]);

            res.json({
                success: true,
                message: 'User unmatched successfully'
            });
        } catch (error) {
            console.error('Error unmatching user:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to unmatch user'
            });
        }
    }

    /**
     * Save user's minimum compatibility score preference
     * Uses UPDATE/INSERT approach for more reliable NULL handling
     */
    async saveMinCompatibilityScorePreference(req, res) {
        try {
            const userId = parseInt(req.params.userId || req.body.userId);
            // Parse minScore (1-100, default to 1 for "all matches")
            let minScore = 1;
            if (req.body.minCompatibilityScore !== undefined && req.body.minCompatibilityScore !== null && req.body.minCompatibilityScore !== '') {
                const parsed = parseInt(req.body.minCompatibilityScore);
                if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
                    minScore = parsed;
                }
            }

            if (!userId || isNaN(userId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            // Use UPDATE first, then INSERT if no rows were updated
            // This approach is more reliable for NULL values
            const updateResult = await this.db.query(`
                UPDATE user_profile_settings
                SET match_score = $1
                WHERE user_id = $2
            `, [minScore, userId]);

            // If no rows were updated, insert a new row
            if (updateResult.rowCount === 0) {
                await this.db.query(`
                    INSERT INTO user_profile_settings (user_id, match_score)
                    VALUES ($1, $2)
                `, [userId, minScore]);
            }

            res.json({
                success: true,
                message: 'Match score preference saved successfully',
                minCompatibilityScore: minScore
            });

        } catch (error) {
            console.error('Error saving match score preference:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to save match score preference',
                details: error.message
            });
        }
    }
}

module.exports = MatchesController;


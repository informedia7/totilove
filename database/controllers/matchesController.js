const CompatibilityEngine = require('./matchCompatibilityEngine');

class MatchesController {
    constructor(db, redis = null, config = {}) {
        this.db = db;
        this.redis = redis;
        this.compatibilityEngine = new CompatibilityEngine(db, redis);
        
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
        try {
            const userId = parseInt(req.params.userId);
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

            if (!userId || isNaN(userId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            // Verify user is authenticated and can access their own matches

            // ============================================================
            // STAGE 1: Load User A (current user) data from DB
            // ============================================================
            // Get current user's preferences and info
            const userPrefsResult = await this.db.query(`
                SELECT age_min, age_max, preferred_gender
                FROM user_preferences
                WHERE user_id = $1
            `, [userId]);
            
            const userPrefs = userPrefsResult.rows[0] || {};
            let preferredAgeMin = userPrefs.age_min;
            let preferredAgeMax = userPrefs.age_max;
            const preferredGender = userPrefs.preferred_gender;
            
            // Get saved match score preference from user_profile_settings
            const userSettingsResult = await this.db.query(`
                SELECT match_score
                FROM user_profile_settings
                WHERE user_id = $1
            `, [userId]);
            // Get match_score (1-100, default to 1 if null/undefined)
            const savedMinCompatibilityScore = userSettingsResult.rows[0]?.match_score ?? 1;
            
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
                SELECT birthdate, gender, country_id,
                    EXTRACT(YEAR FROM AGE(birthdate))::INTEGER as age
                FROM users
                WHERE id = $1
            `, [userId]);
            const currentUser = currentUserResult.rows[0];
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

            // Check if current user has a profile image (for FILTER 6)
            let currentUserHasPhoto = false;
            try {
                const photoCheck = await this.db.query(`
                    SELECT 1 FROM user_images 
                    WHERE user_id = $1 AND is_profile = 1 LIMIT 1
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
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM user_sessions 
                            WHERE user_id = u.id 
                                AND is_active = true 
                                AND last_activity > NOW() - INTERVAL '${this.config.onlineStatus.intervalMinutes} minutes'
                        ) THEN true
                        ELSE false
                    END as is_online,
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
                    ${compatibilityCacheExists ? 'comp_cache.score as cached_compatibility_score' : 'NULL::INTEGER as cached_compatibility_score'}
                FROM users u
                LEFT JOIN city c ON u.city_id = c.id
                LEFT JOIN country co ON u.country_id = co.id
                LEFT JOIN user_images ui ON u.id = ui.user_id AND ui.is_profile = 1
                LEFT JOIN user_matches um ON (
                    (um.user1_id = $1 AND um.user2_id = u.id) OR
                    (um.user1_id = u.id AND um.user2_id = $1)
                ) AND (um.status IS NULL OR um.status = 'active')
                LEFT JOIN users_likes l1 ON l1.liked_by = $1 AND l1.liked_user_id = u.id
                LEFT JOIN users_likes l2 ON l2.liked_by = u.id AND l2.liked_user_id = $1
                LEFT JOIN user_profile_settings ups ON ups.user_id = u.id
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
                    
                    -- Only active, non-banned users
                    AND (u.is_banned = false OR u.is_banned IS NULL)
                    
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

            // FILTER 5: Matched user's country restrictions
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
            queryParams.push(currentUser.country_id);
            paramIndex++;

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

            // FILTER 9: Exclude users with existing matches (mutual matches)
            // Only exclude if there's an active match (status = 'active' or NULL)
            matchesQuery += `
                AND NOT EXISTS (
                    SELECT 1 FROM user_matches um
                    WHERE ((um.user1_id = $1 AND um.user2_id = u.id)
                       OR (um.user1_id = u.id AND um.user2_id = $1))
                    AND (um.status IS NULL OR um.status = 'active')
                )
            `;

            // Wrap in subquery to allow ordering by alias and add pagination
            matchesQuery = `SELECT DISTINCT * FROM (${matchesQuery}) as matches_subquery ORDER BY 
                -- Sort by: mutual likes first, then people who liked user, then people user liked, then online, then compatibility, then recent
                is_mutual_like DESC,
                liked_by_user DESC,
                user_liked_them DESC,
                is_online DESC,
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
            const matches = await Promise.all(result.rows.map(async (match) => {
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
                    match_date: match.match_date,
                    is_online: match.is_online || false,
                    liked_by_user: match.liked_by_user || false,
                    user_liked_them: match.user_liked_them || false,
                    is_mutual_like: match.is_mutual_like || false,
                    compatibility_score: compatibilityScore,
                    compatibility_badge: badge
                };
            }));

            // ============================================================
            // STAGE 9: Pagination & Sorting (already applied in SQL query)
            // ============================================================
            // Get total count for pagination (optional - can be expensive, so make it optional)
            let totalCount = null;
            if (req.query.include_total === 'true') {
                try {
                    const countResult = await this.db.query(`
                        SELECT COUNT(DISTINCT u.id) as count
                        FROM users u
                        LEFT JOIN user_profile_settings ups ON ups.user_id = u.id
                        WHERE 
                            NOT EXISTS (
                                SELECT 1 FROM users_blocked_by_users bu
                                WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                                   OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                            )
                            AND (u.is_banned = false OR u.is_banned IS NULL)
                            AND u.id != $1
                            AND u.real_name IS NOT NULL
                    `, [userId]);
                    totalCount = parseInt(countResult.rows[0]?.count || 0);
                } catch (error) {
                    // If count query fails, just omit total
                }
            }

            // ============================================================
            // STAGE 10: Return JSON response
            // ============================================================
            res.json({
                success: true,
                matches: matches,
                minCompatibilityScore: savedMinCompatibilityScore ?? 1,
                pagination: {
                    page: page,
                    limit: safeLimit,
                    count: matches.length,
                    ...(totalCount !== null && { total: totalCount, total_pages: Math.ceil(totalCount / safeLimit) })
                }
            });

        } catch (error) {
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
            const result = await this.db.query(`
                SELECT COUNT(*) as count
                FROM users
                WHERE (is_banned = false OR is_banned IS NULL)
                    AND real_name IS NOT NULL
            `);

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
            const result = await this.db.query(`
                SELECT COUNT(DISTINCT user_id) as count
                FROM user_sessions
                WHERE is_active = true
                    AND last_activity > NOW() - INTERVAL $1
            `, [`${this.config.onlineStatus.intervalMinutes} minutes`]);

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
                    ua.smoking_preference_id,
                    ua.drinking_preference_id,
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
                    relationship_type,
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
                smoking_preference_id: userAttrs.smoking_preference_id,
                drinking_preference_id: userAttrs.drinking_preference_id,
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


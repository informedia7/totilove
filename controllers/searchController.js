const { Pool } = require('pg');
const path = require('path');

class SearchController {
    constructor() {
        // Database connection
        this.db = new Pool({
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'totilove',
            password: process.env.DB_PASSWORD || 'password',
            port: process.env.DB_PORT || 5432,
        });
    }

    async searchUsers(req, res) {
        try {
            const {
                ageMin, ageMax, gender, location, country,
                onlineStatus, withImages, withPhotos, page = 1, limit = 20,
                sortBy = 'relevance', distance, verified, recentlyActive, onlineNow,
                education, occupation, income, smoking, drinking, children,
                heightMin, heightMax, bodyType, ethnicity, interests, hobbies, exercise,
                maritalStatus, lifestyle, bodyArt, englishAbility, usePreferredCountries,
                relationshipType
            } = req.query;
            
            const currentUserId = req.query.userId || req.query.currentUser || req.headers['x-user-id'];
            
            if (!currentUserId) {
                return res.status(401).json({ error: 'User ID required' });
            }
            
            // Get user preferences for default values
            let userPreferences = null;
            try {
                const prefsResult = await this.db.query(`
                    SELECT preferred_gender, age_min, age_max
                    FROM user_preferences
                    WHERE user_id = $1
                `, [currentUserId]);
                if (prefsResult.rows.length > 0) {
                    userPreferences = prefsResult.rows[0];
                }
            } catch (prefsError) {
                // If table doesn't exist or error, continue without preferences
            }
            
            // Map unused parameters to used ones
            const effectiveOnlineNow = onlineNow || onlineStatus;
            const effectiveWithImages = withImages || withPhotos;
            
            // Validate age inputs
            let effectiveAgeMin = ageMin ? parseInt(ageMin) : null;
            let effectiveAgeMax = ageMax ? parseInt(ageMax) : null;
            
            // Use user preferences as defaults if not provided
            if (!effectiveAgeMin && userPreferences && userPreferences.age_min) {
                effectiveAgeMin = parseInt(userPreferences.age_min);
            }
            if (!effectiveAgeMax && userPreferences && userPreferences.age_max) {
                effectiveAgeMax = parseInt(userPreferences.age_max);
            }
            
            // Validate age range
            if (effectiveAgeMin !== null && isNaN(effectiveAgeMin)) {
                effectiveAgeMin = null;
            }
            if (effectiveAgeMax !== null && isNaN(effectiveAgeMax)) {
                effectiveAgeMax = null;
            }
            if (effectiveAgeMin !== null && effectiveAgeMax !== null && effectiveAgeMin > effectiveAgeMax) {
                // Swap if min > max
                [effectiveAgeMin, effectiveAgeMax] = [effectiveAgeMax, effectiveAgeMin];
            }
            
            // Determine effective gender (use explicit parameter or user preference)
            let effectiveGender = gender;
            if ((!effectiveGender || effectiveGender === 'any') && userPreferences && userPreferences.preferred_gender) {
                effectiveGender = userPreferences.preferred_gender;
            }
            
            // Build the main search query
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
                    CASE 
                        WHEN ci.name IS NOT NULL AND st.name IS NOT NULL AND c.name IS NOT NULL 
                            THEN ci.name || ', ' || st.name || ', ' || c.name
                        WHEN ci.name IS NOT NULL AND c.name IS NOT NULL 
                            THEN ci.name || ', ' || c.name
                        WHEN st.name IS NOT NULL AND c.name IS NOT NULL 
                            THEN st.name || ', ' || c.name
                        WHEN ci.name IS NOT NULL 
                            THEN ci.name
                        WHEN st.name IS NOT NULL 
                            THEN st.name
                        WHEN c.name IS NOT NULL 
                            THEN c.name
                        ELSE NULL
                    END as location,
                    ua.height_cm, ua.weight_kg,
                    ua.smoking_preference_id, ua.drinking_preference_id, ua.exercise_habits_id,
                    ua.ethnicity_id, ua.income_id, ua.marital_status_id, ua.lifestyle_id,
                    ua.living_situation_id, ua.body_art_id, ua.english_ability_id,
                    ua.relocation_id, ua.occupation_category_id,
                    bt.name as body_type_name, ey.name as eye_color_name, hc.name as hair_color_name,
                    eth.name as ethnicity_name, rel.name as religion_name, edu.name as education_name,
                    occ.name as occupation_name, inc.name as income_name, ls.name as lifestyle_name,
                    lv.name as living_situation_name, ms.name as marital_status_name,
                    ui.file_name as profile_image,
                    ua.about_me,
                    COALESCE((SELECT COUNT(*) FROM user_images ui2 WHERE ui2.user_id = u.id), 0) as photo_count,
                    EXTRACT(YEAR FROM AGE(u.birthdate)) as age,
                    COALESCE(u.profile_verified, false) as is_verified,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM user_sessions us
                            WHERE us.user_id = u.id 
                            AND us.is_active = true 
                            AND us.last_activity > NOW() - INTERVAL '2 minutes'
                        ) THEN true
                        ELSE false
                    END as is_online,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM user_messages m
                            WHERE m.sender_id = u.id 
                            AND m.receiver_id = $1
                            AND COALESCE(m.deleted_by_receiver, false) = false
                        ) THEN true
                        ELSE false
                    END as has_received_messages,
                    up.age_min,
                    up.age_max,
                    up.preferred_gender
                FROM users u
                LEFT JOIN country c ON u.country_id = c.id
                LEFT JOIN state st ON u.state_id = st.id
                LEFT JOIN city ci ON u.city_id = ci.id
                LEFT JOIN user_attributes ua ON u.id = ua.user_id
                LEFT JOIN user_body_types bt ON ua.body_type_id = bt.id
                LEFT JOIN user_eye_colors ey ON ua.eye_color_id = ey.id
                LEFT JOIN user_hair_colors hc ON ua.hair_color_id = hc.id
                LEFT JOIN user_ethnicities eth ON ua.ethnicity_id = eth.id
                LEFT JOIN user_religions rel ON ua.religion_id = rel.id
                LEFT JOIN user_education_levels edu ON ua.education_id = edu.id
                LEFT JOIN user_occupation_categories occ ON ua.occupation_category_id = occ.id
                LEFT JOIN user_income_ranges inc ON ua.income_id = inc.id
                LEFT JOIN user_lifestyle_preferences ls ON ua.lifestyle_id = ls.id
                LEFT JOIN user_living_situations lv ON ua.living_situation_id = lv.id
                LEFT JOIN user_marital_statuses ms ON ua.marital_status_id = ms.id
                LEFT JOIN user_preferences up ON u.id = up.user_id
                LEFT JOIN user_images ui ON u.id = ui.user_id AND ui.is_profile = 1
                LEFT JOIN user_profile_settings ups ON u.id = ups.user_id
                WHERE u.id != $1 AND u.real_name IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM users_blocked_by_users bu
                    WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                       OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                )
                AND (
                    -- Show public profiles (or NULL which defaults to public)
                    ups.profile_visibility IS NULL 
                    OR ups.profile_visibility = 'public'
                    -- Show friends profiles only if there's a mutual like/connection
                    OR (
                        ups.profile_visibility = 'friends' 
                        AND EXISTS (
                            SELECT 1 FROM users_likes l1
                            WHERE l1.liked_by = $1 AND l1.liked_user_id = u.id
                        )
                        AND EXISTS (
                            SELECT 1 FROM users_likes l2
                            WHERE l2.liked_by = u.id AND l2.liked_user_id = $1
                        )
                    )
                )
                -- Always hide private profiles
                AND (ups.profile_visibility IS NULL OR ups.profile_visibility != 'private')
            `;
            
            const queryParams = [currentUserId];
            let paramIndex = 2;
            
            // Apply age filters (using validated values)
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
            
            // Apply gender filter (using effective gender from preferences or explicit parameter)
            if (effectiveGender && effectiveGender !== 'any') {
                // Map gender values from form to database values (normalized to lowercase)
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
            let userNoSameGenderContact = false;
            let currentUserGenderResult = null;
            let currentUserGender = null;
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
            }
            
            if (userNoSameGenderContact) {
                // Get current user's gender to exclude same gender users
                currentUserGenderResult = await this.db.query(`
                    SELECT gender FROM users WHERE id = $1
                `, [currentUserId]);
                
                if (currentUserGenderResult.rows.length > 0) {
                    currentUserGender = currentUserGenderResult.rows[0].gender;
                    query += ` AND u.gender != $${paramIndex}`;
                    queryParams.push(currentUserGender);
                    paramIndex++;
                }
            }
            
            // Handle preferred countries filter (from profile-edit preferences)
            let preferredCountriesResult = null;
            let userAcceptsAllCountries = false;
            if (usePreferredCountries === 'true' || usePreferredCountries === true) {
                // Get user's preferred countries from user_preferred_countries table
                preferredCountriesResult = await this.db.query(`
                    SELECT country_id, is_all_countries
                    FROM user_preferred_countries
                    WHERE user_id = $1
                `, [currentUserId]);
                
                userAcceptsAllCountries = preferredCountriesResult.rows.some(row => row.is_all_countries);
                
                if (!userAcceptsAllCountries && preferredCountriesResult.rows.length > 0) {
                    const preferredCountryIds = preferredCountriesResult.rows
                        .map(row => row.country_id)
                        .filter(id => id !== null);
                    
                    if (preferredCountryIds.length > 0) {
                        if (preferredCountryIds.length === 1) {
                            query += ` AND u.country_id = $${paramIndex}`;
                            queryParams.push(preferredCountryIds[0]);
                            paramIndex++;
                        } else {
                            query += ` AND u.country_id = ANY($${paramIndex}::int[])`;
                            queryParams.push(preferredCountryIds);
                            paramIndex++;
                        }
                    }
                } else if (userAcceptsAllCountries) {
                    // User accepts all countries, so no country filter needed
                } else {
                    // User has no preferred countries set, show all
                }
            }
            // Handle explicit country filter - can be single value, comma-separated string, or array
            else if (country) {
                let countryIds = [];
                
                if (Array.isArray(country)) {
                    // Already an array
                    countryIds = country.map(c => parseInt(c)).filter(c => !isNaN(c));
                } else if (typeof country === 'string' && country !== '') {
                    // Comma-separated string or single value
                    const countryArray = country.split(',').map(c => c.trim()).filter(c => c !== '');
                    countryIds = countryArray.map(c => parseInt(c)).filter(c => !isNaN(c));
                }
                
                if (countryIds.length > 0) {
                    if (countryIds.length === 1) {
                        // Single country - use simple equality for better performance
                        query += ` AND u.country_id = $${paramIndex}`;
                        queryParams.push(countryIds[0]);
                        paramIndex++;
                    } else {
                        // Multiple countries - use ANY array
                        query += ` AND u.country_id = ANY($${paramIndex}::int[])`;
                        queryParams.push(countryIds);
                        paramIndex++;
                    }
                }
            }
            
            // Apply interests filter
            if (interests) {
                let interestIds = [];
                if (Array.isArray(interests)) {
                    interestIds = interests.map(i => parseInt(i)).filter(i => !isNaN(i));
                } else if (typeof interests === 'string' && interests !== '') {
                    const interestArray = interests.split(',').map(i => i.trim()).filter(i => i !== '');
                    interestIds = interestArray.map(i => parseInt(i)).filter(i => !isNaN(i));
                }
                
                if (interestIds.length > 0) {
                    // Use user_interests_multiple table with user_interest_categories
                    query += ` AND EXISTS (
                        SELECT 1 FROM user_interests_multiple uim
                        JOIN user_interest_categories ic ON uim.interest_id = ic.id
                        WHERE uim.user_id = u.id
                        AND uim.interest_id = ANY($${paramIndex}::int[])
                    )`;
                    queryParams.push(interestIds);
                    paramIndex++;
                }
            }
            
            // Apply hobbies filter
            if (hobbies) {
                let hobbyIds = [];
                if (Array.isArray(hobbies)) {
                    hobbyIds = hobbies.map(h => parseInt(h)).filter(h => !isNaN(h));
                } else if (typeof hobbies === 'string' && hobbies !== '') {
                    const hobbyArray = hobbies.split(',').map(h => h.trim()).filter(h => h !== '');
                    hobbyIds = hobbyArray.map(h => parseInt(h)).filter(h => !isNaN(h));
                }
                
                if (hobbyIds.length > 0) {
                    query += ` AND EXISTS (
                        SELECT 1 FROM user_hobbies_multiple uhm
                        JOIN user_hobbies_reference hr ON uhm.hobby_id = hr.id
                        WHERE uhm.user_id = u.id
                        AND uhm.hobby_id = ANY($${paramIndex}::int[])
                    )`;
                    queryParams.push(hobbyIds);
                    paramIndex++;
                }
            }
            
            if (effectiveWithImages === 'true' || effectiveWithImages === true) {
                query += ` AND ui.file_name IS NOT NULL`;
            }
            
            if (effectiveOnlineNow === 'true' || effectiveOnlineNow === true) {
                query += ` AND EXISTS (
                    SELECT 1 FROM user_sessions us
                    WHERE us.user_id = u.id 
                    AND us.is_active = true 
                    AND us.last_activity > NOW() - INTERVAL '2 minutes'
                )`;
            }
            
            if (recentlyActive === 'true' || recentlyActive === true) {
                query += ` AND u.last_login > NOW() - INTERVAL '7 days'`;
            }
            
            if (verified === 'true' || verified === true) {
                query += ` AND u.profile_verified = true`;
            }
            
            // Lifestyle filters
            if (smoking && smoking !== 'any' && smoking !== '') {
                query += ` AND ua.smoking_preference_id = $${paramIndex}`;
                queryParams.push(smoking);
                paramIndex++;
            }
            
            if (drinking && drinking !== 'any' && drinking !== '') {
                query += ` AND ua.drinking_preference_id = $${paramIndex}`;
                queryParams.push(drinking);
                paramIndex++;
            }
            
            if (exercise && exercise !== 'any') {
                query += ` AND ua.exercise_habits_id = $${paramIndex}`;
                queryParams.push(exercise);
                paramIndex++;
            }
            
            if (maritalStatus && maritalStatus !== 'any') {
                query += ` AND ua.marital_status_id = $${paramIndex}`;
                queryParams.push(maritalStatus);
                paramIndex++;
            }
            
            if (lifestyle && lifestyle !== 'any' && lifestyle !== '') {
                query += ` AND ua.lifestyle_id = $${paramIndex}`;
                queryParams.push(lifestyle);
                paramIndex++;
            }
            
            if (bodyArt && bodyArt !== 'any') {
                query += ` AND ua.body_art_id = $${paramIndex}`;
                queryParams.push(bodyArt);
                paramIndex++;
            }
            
            // Relationship type filter (from user_preferences)
            // Treat "Not important" and "Other" as "any" (no filter)
            const relationshipTypeLower = relationshipType ? relationshipType.toLowerCase() : '';
            if (relationshipType && 
                relationshipType !== '' && 
                relationshipType !== 'any' &&
                relationshipTypeLower !== 'not important' &&
                relationshipTypeLower !== 'other') {
                query += ` AND up.relationship_type = $${paramIndex}`;
                queryParams.push(relationshipType);
                paramIndex++;
            }
            
            if (englishAbility && englishAbility !== 'any') {
                query += ` AND ua.english_ability_id = $${paramIndex}`;
                queryParams.push(englishAbility);
                paramIndex++;
            }
            
            // Physical attributes
            if (heightMin) {
                query += ` AND ua.height_cm >= $${paramIndex}`;
                queryParams.push(parseInt(heightMin));
                paramIndex++;
            }
            
            if (heightMax) {
                query += ` AND ua.height_cm <= $${paramIndex}`;
                queryParams.push(parseInt(heightMax));
                paramIndex++;
            }
            
            if (bodyType && bodyType !== 'any') {
                query += ` AND ua.body_type_id = $${paramIndex}`;
                queryParams.push(bodyType);
                paramIndex++;
            }
            
            if (ethnicity && ethnicity !== 'any') {
                query += ` AND ua.ethnicity_id = $${paramIndex}`;
                queryParams.push(ethnicity);
                paramIndex++;
            }
            
            // Education and career
            if (education && education !== 'any' && education !== '') {
                query += ` AND ua.education_id = $${paramIndex}`;
                queryParams.push(education);
                paramIndex++;
            }
            
            if (occupation && occupation !== 'any' && occupation !== '') {
                query += ` AND ua.occupation_category_id = $${paramIndex}`;
                queryParams.push(occupation);
                paramIndex++;
            }
            
            if (income && income !== 'any' && income !== '') {
                query += ` AND ua.income_id = $${paramIndex}`;
                queryParams.push(income);
                paramIndex++;
            }
            
            // Children filter - match by joining with user_have_children_statuses and matching name
            // Database values: "I don't have children", "I have children (at home)", "I have children (grown up)", 
            //                  "I want children", "I don't want children", "Unsure about children", etc.
            if (children && children !== 'any' && children !== '') {
                if (children === 'has_children') {
                    // Match only: "I have children (at home)", "I have children (grown up)" 
                    // Exclude: "I want children" (should match "any"), "I don't have children", etc.
                    query += ` AND EXISTS (
                        SELECT 1 FROM user_have_children_statuses hcs
                        WHERE ua.have_children IS NOT NULL 
                        AND ua.have_children::TEXT ~ '^[0-9]+$' 
                        AND CAST(ua.have_children AS INTEGER) = hcs.id
                        AND LOWER(hcs.name) LIKE '%have%child%'
                        AND LOWER(hcs.name) NOT LIKE '%don%t%have%'
                        AND LOWER(hcs.name) NOT LIKE '%want%child%'
                        AND LOWER(hcs.name) NOT LIKE '%prefer not to say%'
                        AND LOWER(hcs.name) NOT LIKE '%not important%'
                        AND LOWER(hcs.name) != 'other'
                    )`;
                } else if (children === 'no_children') {
                    // Match: "I don't have children", "I don't want children" (people who don't have or don't want children)
                    query += ` AND EXISTS (
                        SELECT 1 FROM user_have_children_statuses hcs
                        WHERE ua.have_children IS NOT NULL 
                        AND ua.have_children::TEXT ~ '^[0-9]+$' 
                        AND CAST(ua.have_children AS INTEGER) = hcs.id
                        AND (
                            LOWER(hcs.name) LIKE '%don%t%have%child%'
                            OR LOWER(hcs.name) LIKE '%don%t%want%child%'
                        )
                        AND LOWER(hcs.name) NOT LIKE '%prefer not to say%'
                        AND LOWER(hcs.name) NOT LIKE '%not important%'
                        AND LOWER(hcs.name) != 'other'
                    )`;
                }
            }
            
            // Add sorting
            switch (sortBy) {
                case 'age':
                    query += ` ORDER BY age ASC`;
                    break;
                case 'distance':
                    query += ` ORDER BY c.name ASC`; // Simplified distance sorting
                    break;
                case 'last_active':
                case 'activity': // Handle both 'last_active' and 'activity' for compatibility
                    query += ` ORDER BY u.last_login DESC`;
                    break;
                case 'newest':
                    query += ` ORDER BY u.date_joined DESC`;
                    break;
                default: // relevance
                    query += ` ORDER BY u.last_login DESC, u.date_joined DESC`;
            }
            
            // Add pagination
            const offset = (parseInt(page) - 1) * parseInt(limit);
            query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            queryParams.push(parseInt(limit), offset);
            
            
            const result = await this.db.query(query, queryParams);
            
            // Get total count for pagination - MUST include ALL filters from main query
            let countQuery = `
                SELECT COUNT(*) as total
                FROM users u
                LEFT JOIN country c ON u.country_id = c.id
                LEFT JOIN state st ON u.state_id = st.id
                LEFT JOIN city ci ON u.city_id = ci.id
                LEFT JOIN user_attributes ua ON u.id = ua.user_id
                LEFT JOIN user_preferences up ON u.id = up.user_id
                LEFT JOIN user_images ui ON u.id = ui.user_id AND ui.is_profile = 1
                LEFT JOIN user_profile_settings ups ON u.id = ups.user_id
                WHERE u.id != $1 AND u.real_name IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM users_blocked_by_users bu
                    WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
                       OR (bu.blocker_id = u.id AND bu.blocked_id = $1)
                )
                AND (
                    -- Show public profiles (or NULL which defaults to public)
                    ups.profile_visibility IS NULL 
                    OR ups.profile_visibility = 'public'
                    -- Show friends profiles only if there's a mutual like/connection
                    OR (
                        ups.profile_visibility = 'friends' 
                        AND EXISTS (
                            SELECT 1 FROM users_likes l1
                            WHERE l1.liked_by = $1 AND l1.liked_user_id = u.id
                        )
                        AND EXISTS (
                            SELECT 1 FROM users_likes l2
                            WHERE l2.liked_by = u.id AND l2.liked_user_id = $1
                        )
                    )
                )
                -- Always hide private profiles
                AND (ups.profile_visibility IS NULL OR ups.profile_visibility != 'private')
            `;
            
            const countParams = [currentUserId];
            let countParamIndex = 2;
            
            // Apply ALL same filters to count query (must match main query exactly)
            if (effectiveAgeMin !== null) {
                countQuery += ` AND EXTRACT(YEAR FROM AGE(u.birthdate)) >= $${countParamIndex}`;
                countParams.push(effectiveAgeMin);
                countParamIndex++;
            }
            
            if (effectiveAgeMax !== null) {
                countQuery += ` AND EXTRACT(YEAR FROM AGE(u.birthdate)) <= $${countParamIndex}`;
                countParams.push(effectiveAgeMax);
                countParamIndex++;
            }
            
            if (effectiveGender && effectiveGender !== 'any') {
                let dbGender = effectiveGender;
                const genderLower = (effectiveGender || '').toLowerCase().trim();
                if (genderLower === 'male' || genderLower === 'm') {
                    dbGender = 'male';
                } else if (genderLower === 'female' || genderLower === 'f') {
                    dbGender = 'female';
                }
                
                countQuery += ` AND LOWER(TRIM(u.gender)) = $${countParamIndex}`;
                countParams.push(dbGender.toLowerCase());
                countParamIndex++;
            }
            
            // Same-gender contact restriction for count query
            if (userNoSameGenderContact && currentUserGender) {
                countQuery += ` AND u.gender != $${countParamIndex}`;
                countParams.push(currentUserGender);
                countParamIndex++;
            }
            
            // Preferred countries filter for count query
            if (usePreferredCountries === 'true' || usePreferredCountries === true) {
                if (!userAcceptsAllCountries && preferredCountriesResult && preferredCountriesResult.rows.length > 0) {
                    const preferredCountryIds = preferredCountriesResult.rows
                        .map(row => row.country_id)
                        .filter(id => id !== null);
                    
                    if (preferredCountryIds.length > 0) {
                        if (preferredCountryIds.length === 1) {
                            countQuery += ` AND u.country_id = $${countParamIndex}`;
                            countParams.push(preferredCountryIds[0]);
                            countParamIndex++;
                        } else {
                            countQuery += ` AND u.country_id = ANY($${countParamIndex}::int[])`;
                            countParams.push(preferredCountryIds);
                            countParamIndex++;
                        }
                    }
                }
            } else if (country) {
                let countryIds = [];
                if (Array.isArray(country)) {
                    countryIds = country.map(c => parseInt(c)).filter(c => !isNaN(c));
                } else if (typeof country === 'string' && country !== '') {
                    const countryArray = country.split(',').map(c => c.trim()).filter(c => c !== '');
                    countryIds = countryArray.map(c => parseInt(c)).filter(c => !isNaN(c));
                }
                
                if (countryIds.length > 0) {
                    if (countryIds.length === 1) {
                        countQuery += ` AND u.country_id = $${countParamIndex}`;
                        countParams.push(countryIds[0]);
                        countParamIndex++;
                    } else {
                        countQuery += ` AND u.country_id = ANY($${countParamIndex}::int[])`;
                        countParams.push(countryIds);
                        countParamIndex++;
                    }
                }
            }
            
            // Interests filter for count query
            if (interests) {
                let interestIds = [];
                if (Array.isArray(interests)) {
                    interestIds = interests.map(i => parseInt(i)).filter(i => !isNaN(i));
                } else if (typeof interests === 'string' && interests !== '') {
                    const interestArray = interests.split(',').map(i => i.trim()).filter(i => i !== '');
                    interestIds = interestArray.map(i => parseInt(i)).filter(i => !isNaN(i));
                }
                
                if (interestIds.length > 0) {
                    // Use user_interests_multiple table with user_interest_categories
                    countQuery += ` AND EXISTS (
                        SELECT 1 FROM user_interests_multiple uim
                        JOIN user_interest_categories ic ON uim.interest_id = ic.id
                        WHERE uim.user_id = u.id
                        AND uim.interest_id = ANY($${countParamIndex}::int[])
                    )`;
                    countParams.push(interestIds);
                    countParamIndex++;
                }
            }
            
            // Hobbies filter for count query
            if (hobbies) {
                let hobbyIds = [];
                if (Array.isArray(hobbies)) {
                    hobbyIds = hobbies.map(h => parseInt(h)).filter(h => !isNaN(h));
                } else if (typeof hobbies === 'string' && hobbies !== '') {
                    const hobbyArray = hobbies.split(',').map(h => h.trim()).filter(h => h !== '');
                    hobbyIds = hobbyArray.map(h => parseInt(h)).filter(h => !isNaN(h));
                }
                
                if (hobbyIds.length > 0) {
                    countQuery += ` AND EXISTS (
                        SELECT 1 FROM user_hobbies_multiple uhm
                        JOIN user_hobbies_reference hr ON uhm.hobby_id = hr.id
                        WHERE uhm.user_id = u.id
                        AND uhm.hobby_id = ANY($${countParamIndex}::int[])
                    )`;
                    countParams.push(hobbyIds);
                    countParamIndex++;
                }
            }
            
            if (effectiveWithImages === 'true' || effectiveWithImages === true) {
                countQuery += ` AND ui.file_name IS NOT NULL`;
            }
            
            if (effectiveOnlineNow === 'true' || effectiveOnlineNow === true) {
                countQuery += ` AND EXISTS (
                    SELECT 1 FROM user_sessions us
                    WHERE us.user_id = u.id 
                    AND us.is_active = true 
                    AND us.last_activity > NOW() - INTERVAL '2 minutes'
                )`;
            }
            
            if (recentlyActive === 'true' || recentlyActive === true) {
                countQuery += ` AND u.last_login > NOW() - INTERVAL '7 days'`;
            }
            
            if (verified === 'true' || verified === true) {
                countQuery += ` AND u.profile_verified = true`;
            }
            
            // Lifestyle filters for count query
            if (smoking && smoking !== 'any' && smoking !== '') {
                countQuery += ` AND ua.smoking_preference_id = $${countParamIndex}`;
                countParams.push(smoking);
                countParamIndex++;
            }
            
            if (drinking && drinking !== 'any' && drinking !== '') {
                countQuery += ` AND ua.drinking_preference_id = $${countParamIndex}`;
                countParams.push(drinking);
                countParamIndex++;
            }
            
            if (exercise && exercise !== 'any') {
                countQuery += ` AND ua.exercise_habits_id = $${countParamIndex}`;
                countParams.push(exercise);
                countParamIndex++;
            }
            
            if (maritalStatus && maritalStatus !== 'any') {
                countQuery += ` AND ua.marital_status_id = $${countParamIndex}`;
                countParams.push(maritalStatus);
                countParamIndex++;
            }
            
            if (lifestyle && lifestyle !== 'any' && lifestyle !== '') {
                countQuery += ` AND ua.lifestyle_id = $${countParamIndex}`;
                countParams.push(lifestyle);
                countParamIndex++;
            }
            
            if (bodyArt && bodyArt !== 'any') {
                countQuery += ` AND ua.body_art_id = $${countParamIndex}`;
                countParams.push(bodyArt);
                countParamIndex++;
            }
            
            // Relationship type filter for count query
            const relationshipTypeLowerForCount = relationshipType ? relationshipType.toLowerCase() : '';
            if (relationshipType && 
                relationshipType !== '' && 
                relationshipType !== 'any' &&
                relationshipTypeLowerForCount !== 'not important' &&
                relationshipTypeLowerForCount !== 'other') {
                countQuery += ` AND up.relationship_type = $${countParamIndex}`;
                countParams.push(relationshipType);
                countParamIndex++;
            }
            
            if (englishAbility && englishAbility !== 'any') {
                countQuery += ` AND ua.english_ability_id = $${countParamIndex}`;
                countParams.push(englishAbility);
                countParamIndex++;
            }
            
            // Physical attributes for count query
            if (heightMin) {
                countQuery += ` AND ua.height_cm >= $${countParamIndex}`;
                countParams.push(parseInt(heightMin));
                countParamIndex++;
            }
            
            if (heightMax) {
                countQuery += ` AND ua.height_cm <= $${countParamIndex}`;
                countParams.push(parseInt(heightMax));
                countParamIndex++;
            }
            
            if (bodyType && bodyType !== 'any') {
                countQuery += ` AND ua.body_type_id = $${countParamIndex}`;
                countParams.push(bodyType);
                countParamIndex++;
            }
            
            if (ethnicity && ethnicity !== 'any') {
                countQuery += ` AND ua.ethnicity_id = $${countParamIndex}`;
                countParams.push(ethnicity);
                countParamIndex++;
            }
            
            // Education and career for count query
            if (education && education !== 'any' && education !== '') {
                countQuery += ` AND ua.education_id = $${countParamIndex}`;
                countParams.push(education);
                countParamIndex++;
            }
            
            if (occupation && occupation !== 'any' && occupation !== '') {
                countQuery += ` AND ua.occupation_category_id = $${countParamIndex}`;
                countParams.push(occupation);
                countParamIndex++;
            }
            
            if (income && income !== 'any' && income !== '') {
                countQuery += ` AND ua.income_id = $${countParamIndex}`;
                countParams.push(income);
                countParamIndex++;
            }
            
            // Children filter for count query
            if (children && children !== 'any' && children !== '') {
                if (children === 'has_children') {
                    countQuery += ` AND EXISTS (
                        SELECT 1 FROM user_have_children_statuses hcs
                        WHERE ua.have_children IS NOT NULL 
                        AND ua.have_children::TEXT ~ '^[0-9]+$' 
                        AND CAST(ua.have_children AS INTEGER) = hcs.id
                        AND LOWER(hcs.name) LIKE '%have%child%'
                        AND LOWER(hcs.name) NOT LIKE '%don%t%have%'
                        AND LOWER(hcs.name) NOT LIKE '%want%child%'
                        AND LOWER(hcs.name) NOT LIKE '%prefer not to say%'
                        AND LOWER(hcs.name) NOT LIKE '%not important%'
                        AND LOWER(hcs.name) != 'other'
                    )`;
                } else if (children === 'no_children') {
                    countQuery += ` AND EXISTS (
                        SELECT 1 FROM user_have_children_statuses hcs
                        WHERE ua.have_children IS NOT NULL 
                        AND ua.have_children::TEXT ~ '^[0-9]+$' 
                        AND CAST(ua.have_children AS INTEGER) = hcs.id
                        AND (
                            LOWER(hcs.name) LIKE '%don%t%have%child%'
                            OR LOWER(hcs.name) LIKE '%don%t%want%child%'
                        )
                        AND LOWER(hcs.name) NOT LIKE '%prefer not to say%'
                        AND LOWER(hcs.name) NOT LIKE '%not important%'
                        AND LOWER(hcs.name) != 'other'
                    )`;
                }
            }
            
            const countResult = await this.db.query(countQuery, countParams);
            const totalCount = parseInt(countResult.rows[0].total);
            
            // Format response
            const response = {
                success: true,
                results: result.rows,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalCount / parseInt(limit)),
                    totalResults: totalCount,
                    resultsPerPage: parseInt(limit)
                },
                filters: {
                    ageMin, ageMax, gender, withImages, onlineNow, recentlyActive, verified,
                    smoking, drinking, exercise, maritalStatus, lifestyle, bodyType, ethnicity,
                    education, occupation, income, heightMin, heightMax
                }
            };
            
            res.json(response);
            
        } catch (error) {
            console.error('❌ SearchController: Search error:', error);
            console.error('❌ SearchController: Error stack:', error.stack);
            console.error('❌ SearchController: Query params:', req.query);
            res.status(500).json({ 
                success: false, 
                error: 'Search failed',
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    async getSearchFilters(req, res) {
        try {
            
            // Get all available filter options
            const [
                bodyTypes,
                eyeColors,
                hairColors,
                ethnicities,
                religions,
                educationLevels,
                occupationCategories,
                incomeRanges,
                lifestylePreferences,
                livingSituations,
                maritalStatuses,
                smokingPreferences,
                drinkingPreferences,
                exerciseHabits,
                childrenStatuses,
                heights,
                interests,
                hobbies,
                relationshipTypes
            ] = await Promise.all([
                this.db.query('SELECT id, name FROM user_body_types WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_eye_colors WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_hair_colors WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_ethnicities WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_religions WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_education_levels WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_occupation_categories WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_income_ranges WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_lifestyle_preferences WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_living_situations WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_marital_statuses WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_smoking_preferences WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_drinking_preferences WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_exercise_habits WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, name FROM user_have_children_statuses WHERE is_active = true ORDER BY display_order, name'),
                this.db.query('SELECT id, height_cm, display_text FROM user_height_reference ORDER BY height_cm ASC'),
                this.db.query(`
                    SELECT id, name, description, icon, color 
                    FROM user_interest_categories 
                    ORDER BY name ASC
                `).catch(err => {
                    console.error('❌ Error fetching interests from user_interest_categories:', err.message);
                    // Return empty result if table doesn't exist or query fails
                    return { rows: [] };
                }),
                this.db.query(`
                    SELECT id, name, icon, icon AS emoji 
                    FROM user_hobbies_reference 
                    WHERE is_active = true 
                    ORDER BY display_order ASC, name ASC
                `).catch(err => {
                    console.error('❌ Error fetching hobbies from user_hobbies_reference:', err.message);
                    // Return empty result if table doesn't exist or query fails
                    return { rows: [] };
                }),
                this.db.query('SELECT id, display_name as name, description FROM user_relationship_type_reference WHERE is_active = true ORDER BY display_order ASC, display_name ASC').catch(err => {
                    console.error('❌ Error fetching relationship types from user_relationship_type_reference:', err.message);
                    // Return empty result if table doesn't exist or query fails
                    return { rows: [] };
                })
            ]);

            const filters = {
                bodyTypes: bodyTypes.rows,
                eyeColors: eyeColors.rows,
                hairColors: hairColors.rows,
                ethnicities: ethnicities.rows,
                religions: religions.rows,
                educationLevels: educationLevels.rows,
                occupationCategories: occupationCategories.rows,
                incomeRanges: incomeRanges.rows,
                lifestylePreferences: lifestylePreferences.rows,
                livingSituations: livingSituations.rows,
                maritalStatuses: maritalStatuses.rows,
                smokingPreferences: smokingPreferences.rows,
                drinkingPreferences: drinkingPreferences.rows,
                exerciseHabits: exerciseHabits.rows,
                childrenStatuses: childrenStatuses.rows,
                heights: heights.rows,
                interests: interests.rows,
                hobbies: hobbies.rows,
                relationshipTypes: relationshipTypes.rows,
                genders: [
                    { id: 'male', name: 'Male' },
                    { id: 'female', name: 'Female' }
                ]
            };

            res.json({
                success: true,
                filters: filters
            });

        } catch (error) {
            console.error('❌ SearchController: Get filters error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get search filters',
                details: error.message 
            });
        }
    }
}

module.exports = SearchController;



const fs = require('fs');
const path = require('path');
const TemplateUtils = require('../utils/templateUtils');
const featureFlags = require('../config/featureFlags');

class TemplateController {
    constructor(db, templateUtils = new TemplateUtils()) {
        this.db = db;
        this.templateUtils = templateUtils;
    }

    async renderTemplate(req, res, templateName, userId = null, user = null, sessionToken = null) {
        try {
            const layoutPath = path.join(__dirname, '..', 'app', 'components', 'layouts', 'layout.html');
            if (!fs.existsSync(layoutPath)) {
                return res.status(404).send('<h1>Layout template not found</h1>');
            }
            let layoutContent = fs.readFileSync(layoutPath, 'utf8');

            let templatePath = path.join(__dirname, '..', 'app', 'pages', `${templateName}.html`);
            if (!fs.existsSync(templatePath)) {
                return res.status(404).send('<h1>Template not found</h1>');
            }
            let pageContent = fs.readFileSync(templatePath, 'utf8');

            let userData = {};
            if (userId) {
                userData = await this.loadUserData(userId, templateName, req.query.tab || 'basic', sessionToken);
            }

            pageContent = await this.templateUtils.processTemplateIncludes(pageContent, userData);
            pageContent = this.templateUtils.processTemplateVariables(pageContent, userData);

            layoutContent = layoutContent.replace('{{content}}', pageContent);
            
            // Inject feature flags into template
            const featureFlagsData = {
                useNewCSS: featureFlags.useNewCSS || featureFlags.enableAll,
                useNewJS: featureFlags.useNewJS || featureFlags.enableAll,
                useNewComponents: featureFlags.useNewComponents || featureFlags.enableAll,
                enableAll: featureFlags.enableAll,
                newArchitecturePages: featureFlags.newArchitecturePages || []
            };
            
            // Add feature flags to userData for template processing
            const htmlContent = this.templateUtils.processTemplateVariables(layoutContent, {
                ...userData,
                ...featureFlagsData,
                FEATURE_FLAGS_JSON: JSON.stringify(featureFlagsData)
            });

            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(htmlContent);
        } catch (error) {
            res.status(500).send(`
                <html>
                    <body style="font-family: Arial, sans-serif; padding: 2rem; text-align: center;">
                        <h1 style="color: #dc3545;">Error Rendering Template</h1>
                        <p>${error.message}</p>
                        <a href="/" style="color: #007bff; text-decoration: none;">← Go Back Home</a>
                    </body>
                </html>
            `);
        }
    }

    async loadUserData(userId, templateName, activeTab, sessionToken) {
        const result = await this.db.query(
            `
                    SELECT u.id, u.real_name, u.email, u.birthdate, u.gender,
                           u.city_id, u.country_id, u.state_id, u.date_joined, u.last_login,
                   ua.user_id as ua_user_id, ua.about_me, ua.height_cm, ua.weight_kg,
                           ua.smoking_preference_id, ua.drinking_preference_id, ua.exercise_habits_id,
                           ua.ethnicity_id, ua.income_id, ua.marital_status_id, ua.lifestyle_id,
                   ua.living_situation_id, ua.have_children, ua.number_of_children_id, ua.body_art_id, ua.english_ability_id,
                   ua.relocation_id, ua.occupation_category_id,
                   ua.body_type_id, ua.interest_category_id,
                   ua.eye_color_id, ua.hair_color_id, ua.religion_id, ua.education_id,
                   bt.name as body_type_name, ic.name as interest_category_name, 
                   ey.name as eye_color_name, hc.name as hair_color_name,
                           eth.name as ethnicity_name, rel.name as religion_name, edu.name as education_name,
                           occ.name as occupation_name, inc.name as income_name, ls.name as lifestyle_name,
                           lv.name as living_situation_name, ms.name as marital_status_name,
                   sp.name as smoking_preference_name, dp.name as drinking_preference_name,
                   eh.name as exercise_habits_name, hcs.name as have_children_name,
                   noc.name as number_of_children_name,
                   urw.name as relocation_name,
                   ci.name as city_name, s.name as state_name, co.name as country_name,
                   uhr.id as height_reference_id, uwr.id as weight_reference_id,
                   up.user_id as up_user_id, up.age_min as preferred_age_min, up.age_max as preferred_age_max,
                   up.location_radius as preferred_distance, up.preferred_gender,
                   up.preferred_height, uphr.id as preferred_height_reference_id,
                   up.preferred_weight, upwr.id as preferred_weight_reference_id,
                   up.preferred_exercise,
                   up.preferred_body_type, up.preferred_education,
                   up.preferred_religion, up.preferred_smoking, up.preferred_drinking,
                   up.preferred_children, up.preferred_number_of_children,
                   up.preferred_eye_color, up.preferred_hair_color,
                   up.preferred_ethnicity, up.preferred_occupation, up.preferred_income,
                   up.preferred_marital_status, up.preferred_lifestyle, up.preferred_body_art,
                   up.preferred_english_ability, up.partner_preferences, up.relationship_type
                    FROM users u
                    LEFT JOIN user_attributes ua ON u.id = ua.user_id
                    LEFT JOIN user_body_types bt ON ua.body_type_id = bt.id
            LEFT JOIN user_interest_categories ic ON ua.interest_category_id = ic.id
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
            LEFT JOIN user_smoking_preferences sp ON ua.smoking_preference_id = sp.id
            LEFT JOIN user_drinking_preferences dp ON ua.drinking_preference_id = dp.id
            LEFT JOIN user_exercise_habits eh ON ua.exercise_habits_id = eh.id
            LEFT JOIN user_have_children_statuses hcs ON (
                ua.have_children IS NOT NULL 
                AND ua.have_children::TEXT ~ '^[0-9]+$' 
                AND CAST(ua.have_children AS INTEGER) = hcs.id
            )
            LEFT JOIN user_number_of_children noc ON ua.number_of_children_id = noc.id
            LEFT JOIN user_relocation_willingness urw ON ua.relocation_id = urw.id
                    LEFT JOIN city ci ON u.city_id = ci.id
                    LEFT JOIN state s ON u.state_id = s.id
                    LEFT JOIN country co ON u.country_id = co.id
            LEFT JOIN user_height_reference uhr ON ua.height_cm = uhr.height_cm
            LEFT JOIN user_weight_reference uwr ON ua.weight_kg = uwr.weight_kg
            LEFT JOIN user_preferences up ON u.id = up.user_id
            LEFT JOIN user_height_reference uphr ON 
                up.preferred_height IS NOT NULL 
                AND up.preferred_height != '' 
                AND up.preferred_height != '0'
                AND up.preferred_height ~ '^[0-9]+$'
                AND CAST(up.preferred_height AS INTEGER) = uphr.height_cm
            LEFT JOIN user_weight_reference upwr ON 
                up.preferred_weight IS NOT NULL 
                AND up.preferred_weight != '' 
                AND up.preferred_weight != '0'
                AND up.preferred_weight ~ '^[0-9]+$'
                AND CAST(up.preferred_weight AS INTEGER) = upwr.weight_kg
                    WHERE u.id = $1
            `,
            [userId]
        );
        

        if (result.rows.length === 0) {
            return {};
        }

        const user = result.rows[0];

        // Prefer names, fall back to IDs, otherwise "Not specified"
        const pickDisplay = (name, id) => name || (id != null ? String(id) : 'Not specified');

        // Load multi-select interests from user_interests_multiple (if present)
        let userInterests = [];
        try {
            const interestsResult = await this.db.query(
                `
                    SELECT uim.interest_id AS id, c.name, c.icon, c.color
                    FROM user_interests_multiple uim
                    JOIN user_interest_categories c ON uim.interest_id = c.id
                    WHERE uim.user_id = $1
                    ORDER BY c.name
                `,
                [userId]
            );
            userInterests = interestsResult.rows || [];
        } catch (interestsError) {
            console.warn('⚠️ Could not load user interests:', interestsError.message);
        }

        const interestsDisplay = userInterests.length > 0
            ? userInterests.map(i => i.name).join(', ')
            : pickDisplay(user.interest_category_name, user.interest_category_id);

        // Load multi-select hobbies from user_hobbies_multiple (if present)
        let userHobbies = [];
        try {
            const hobbiesResult = await this.db.query(
                `
                    SELECT uh.hobby_id AS id, hr.name
                    FROM user_hobbies_multiple uh
                    JOIN user_hobbies_reference hr ON uh.hobby_id = hr.id
                    WHERE uh.user_id = $1
                    ORDER BY hr.name
                `,
                [userId]
            );
            userHobbies = hobbiesResult.rows || [];
        } catch (hobbiesError) {
            console.warn('⚠️ Could not load user hobbies:', hobbiesError.message);
        }

        const hobbiesDisplay = userHobbies.length > 0
            ? userHobbies.map(h => h.name).join(', ')
            : 'Not specified';

        // Helper to resolve lookup names from flexible tables
        const resolveLookupName = async (id, candidates) => {
            if (!id) return null;
            for (const table of candidates) {
                try {
                    const lookup = await this.db.query(`SELECT name FROM ${table} WHERE id = $1 LIMIT 1`, [id]);
                    if (lookup.rows && lookup.rows.length > 0) {
                        return lookup.rows[0].name;
                    }
                } catch (err) {
                    // try next table
                }
            }
            return null;
        };

        // Resolve body art and english ability names when tables may vary
        if (!user.body_art_name && user.body_art_id) {
            user.body_art_name = await resolveLookupName(user.body_art_id, [
                'user_body_art',
                'user_body_arts',
                'user_body_art_types',
                'body_art',
                'body_art_types'
            ]);
        }

        if (!user.english_ability_name && user.english_ability_id) {
            user.english_ability_name = await resolveLookupName(user.english_ability_id, [
                'user_english_ability',
                'user_english_abilities',
                'english_ability',
                'english_abilities',
                'english_levels',
                'language_ability'
            ]);
        }

        // Load preferred countries from user_preferred_countries table
        let preferredCountries = [];
        try {
            // Try to get emoji column, but handle if it doesn't exist
            let preferredCountriesResult;
            try {
                preferredCountriesResult = await this.db.query(`
                    SELECT upc.country_id, c.name, c.emoji
                    FROM user_preferred_countries upc
                    JOIN country c ON upc.country_id = c.id
                    WHERE upc.user_id = $1
                    ORDER BY c.name ASC
                `, [userId]);
            } catch (emojiErr) {
                // If emoji column doesn't exist, try without it
                preferredCountriesResult = await this.db.query(`
                    SELECT upc.country_id, c.name
                    FROM user_preferred_countries upc
                    JOIN country c ON upc.country_id = c.id
                    WHERE upc.user_id = $1
                    ORDER BY c.name ASC
                `, [userId]);
            }
            
            preferredCountries = preferredCountriesResult.rows.map(row => ({
                id: row.country_id,
                name: row.name || '',
                emoji: row.emoji || ''
            }));
        } catch (err) {
            // Table might not exist yet, silently continue
        }

        // Compute age safely
                    user.age = this.templateUtils.calculateAge(user.birthdate);

        // Height displays
                    const heightDisplay = this.templateUtils.formatHeight(user.height_cm);
        const heightMeters = user.height_cm ? (user.height_cm / 100).toFixed(2) : '';
        const totalInches = user.height_cm ? user.height_cm / 2.54 : null;
        const heightFeet = totalInches != null ? Math.floor(totalInches / 12).toString() : '';
        const heightInches = totalInches != null ? Math.round(totalInches - Math.floor(totalInches / 12) * 12).toString() : '';
        // Combined height display: "160 cm (1.60 m / 5'3")"
        const heightFullDisplay = user.height_cm 
            ? `${user.height_cm} cm (${heightMeters} m / ${heightFeet}'${heightInches}")`
            : 'Not specified';

        // Preferred height displays (person I'm looking for)
        // Check if preferred_height is '0' (meaning "Not important")
        const isPreferredHeightNotImportant = user.preferred_height === '0' || user.preferred_height === 0;
        const preferredHeightCm = user.preferred_height != null && user.preferred_height !== '' && !Number.isNaN(Number(user.preferred_height)) && !isPreferredHeightNotImportant
            ? Number(user.preferred_height)
            : null;
        const preferredHeightMeters = preferredHeightCm ? (preferredHeightCm / 100).toFixed(2) : '';
        const preferredTotalInches = preferredHeightCm ? preferredHeightCm / 2.54 : null;
        const preferredHeightFeet = preferredTotalInches != null ? Math.floor(preferredTotalInches / 12).toString() : '';
        const preferredHeightInches = preferredTotalInches != null ? Math.round(preferredTotalInches - Math.floor(preferredTotalInches / 12) * 12).toString() : '';
        const preferredHeightFullDisplay = isPreferredHeightNotImportant
            ? 'Not important'
            : (preferredHeightCm
                ? `${preferredHeightCm} cm (${preferredHeightMeters} m / ${preferredHeightFeet}'${preferredHeightInches}")`
                : 'Not specified');

                    const navStates = {
                        homeActive: templateName === 'home' ? 'active' : '',
                        loginActive: templateName === 'login' ? 'active' : '',
                        registerActive: templateName === 'register' ? 'active' : '',
                        profileActive: templateName.includes('profile') ? 'active' : '',
                        matchesActive: templateName === 'matches' ? 'active' : '',
                        searchActive: (templateName === 'search' || templateName === 'results') ? 'active' : '',
                        messagesActive: templateName === 'messages' ? 'active' : '',
                        talkActive: templateName === 'talk' ? 'active' : '',
                        activityActive: templateName === 'activity' ? 'active' : '',
                        billingActive: templateName === 'billing' ? 'active' : '',
                        settingsActive: templateName === 'settings' ? 'active' : '',
                        accountActive: templateName === 'account' ? 'active' : ''
                    };

        const pageTitle = (() => {
            if (templateName === 'matches') return 'Matches';
            if (templateName === 'search') return 'Search';
            if (templateName === 'results') return 'Search Results';
            if (templateName === 'messages') return 'Messages';
            if (templateName === 'talk') return 'Talk';
            if (templateName === 'activity') return 'Activity';
            if (templateName === 'billing') return 'Billing & Subscription';
            if (templateName === 'settings') return 'Settings';
            if (templateName === 'account') return 'My Account';
            return 'Profile';
        })();

        const userData = {
                        userId: user.id,
                        real_name: user.real_name,
                        realName: user.real_name || '', // For template use (camelCase)
                        real_name: user.real_name, // Keep for backward compatibility
                        userEmail: user.email,
                        userAge: user.age,
                        userGender: this.templateUtils.formatGenderIcon(user.gender),
            userGenderRaw: user.gender,
            userLocation: [user.city_name, user.state_name, user.country_name].filter(Boolean).join(', '),
            countryId: user.country_id || '',
            stateId: user.state_id || '',
            cityId: user.city_id || '',
                        userHeight: heightDisplay,
            userBodyType: pickDisplay(user.body_type_name, user.body_type_id),
            userEyeColor: pickDisplay(user.eye_color_name, user.eye_color_id),
            userHairColor: pickDisplay(user.hair_color_name, user.hair_color_id),
            userEthnicity: pickDisplay(user.ethnicity_name, user.ethnicity_id),
            userReligion: pickDisplay(user.religion_name, user.religion_id),
            userEducation: pickDisplay(user.education_name, user.education_id),
            userOccupation: pickDisplay(user.occupation_name, user.occupation_category_id),
            userBirthdate: user.birthdate ? new Date(user.birthdate).toISOString() : '',
                        userIncome: user.income_name || 'Not specified',
            incomeId: user.income_id != null ? String(user.income_id) : '',
            income: pickDisplay(user.income_name, user.income_id),
            incomeName: pickDisplay(user.income_name, user.income_id),
            userLivingSituation: pickDisplay(user.living_situation_name, user.living_situation_id),
            livingSituationId: user.living_situation_id != null ? String(user.living_situation_id) : '',
            livingSituation: pickDisplay(user.living_situation_name, user.living_situation_id),
            livingSituationName: pickDisplay(user.living_situation_name, user.living_situation_id),
            userMaritalStatus: pickDisplay(user.marital_status_name, user.marital_status_id),
            maritalStatusId: user.marital_status_id != null ? String(user.marital_status_id) : '',
            maritalStatus: pickDisplay(user.marital_status_name, user.marital_status_id),
            maritalStatusName: pickDisplay(user.marital_status_name, user.marital_status_id),
            userHaveChildren: pickDisplay(user.have_children_name, user.have_children),
            haveChildrenId: user.have_children != null ? String(user.have_children) : '',
            haveChildren: pickDisplay(user.have_children_name, user.have_children),
            haveChildrenName: pickDisplay(user.have_children_name, user.have_children),
            numberOfChildrenId: user.number_of_children_id != null ? String(user.number_of_children_id) : '',
            numberOfChildren: pickDisplay(user.number_of_children_name, user.number_of_children_id),
            numberOfChildrenName: pickDisplay(user.number_of_children_name, user.number_of_children_id),
            userLifestyle: pickDisplay(user.lifestyle_name, user.lifestyle_id),
            lifestyleId: user.lifestyle_id != null ? String(user.lifestyle_id) : '',
            lifestyle: pickDisplay(user.lifestyle_name, user.lifestyle_id),
            lifestyleName: pickDisplay(user.lifestyle_name, user.lifestyle_id),
            bodyArtId: user.body_art_id != null ? String(user.body_art_id) : '',
            bodyArt: pickDisplay(user.body_art_name, user.body_art_id),
            bodyArtName: pickDisplay(user.body_art_name, user.body_art_id),
            englishAbilityId: user.english_ability_id != null ? String(user.english_ability_id) : '',
            englishAbility: pickDisplay(user.english_ability_name, user.english_ability_id),
            englishAbilityName: pickDisplay(user.english_ability_name, user.english_ability_id),
            relocationId: user.relocation_id != null ? String(user.relocation_id) : '',
            relocation: pickDisplay(user.relocation_name, user.relocation_id),
            relocationName: pickDisplay(user.relocation_name, user.relocation_id),
            aboutMe: user.about_me || '',
            partnerPreferences: user.partner_preferences || '',
            // Base64 encode the JSON string for safe use in HTML attributes (avoids quote issues)
            preferredCountries: Buffer.from(JSON.stringify(preferredCountries)).toString('base64'),
                        memberSince: this.templateUtils.getRelativeTime(user.date_joined),
                        lastLogin: this.templateUtils.getRelativeTime(user.last_login),
                        isOnline: user.last_login && new Date() - new Date(user.last_login) < 5 * 60 * 1000,
                        lastSeen: user.last_login ? this.templateUtils.getRelativeTime(user.last_login) : 'long ago',
                        lastActive: user.last_login && new Date() - new Date(user.last_login) < 5 * 60 * 1000 ? 'Online now' : 'Recently active',
                        userAvatar: '/assets/images/default_profile_male.svg',
                        likeCount: 0,
                        viewCount: 0,
                        messageCount: 0,
                        isOwnProfile: true,
            pageTitle,
                        currentPage: 'profile',
            activeTab,
            sessionToken,
            accountIconColor: '#28a745',
      height: heightDisplay,
            heightFullDisplay: heightFullDisplay,
            height_cm: user.height_cm || '',
            height_m: heightMeters,
            height_ft: heightFeet,
            height_in: heightInches,
            height_reference_id: user.height_reference_id || '',
            current_height_reference_id: user.height_reference_id || '',
            current_height_cm: user.height_cm || '',
            weight_kg: user.weight_kg || '',
            weight_reference_id: user.weight_reference_id || '',
            current_weight_reference_id: user.weight_reference_id || '',
            current_weight_kg: user.weight_kg || '',
            weightDisplay: (user.weight_kg || user.weight_reference_id)
                ? `${user.weight_kg || ''}${user.weight_kg ? ' kg' : ''}`.trim() || 'Not specified'
                : 'Not specified',
            bodyTypeId: user.body_type_id != null ? String(user.body_type_id) : '',
            bodyType: pickDisplay(user.body_type_name, user.body_type_id),
            bodyTypeName: pickDisplay(user.body_type_name, user.body_type_id),
            eyeColorId: user.eye_color_id != null ? String(user.eye_color_id) : '',
            eyeColor: pickDisplay(user.eye_color_name, user.eye_color_id),
            eyeColorName: pickDisplay(user.eye_color_name, user.eye_color_id),
            hairColorId: user.hair_color_id != null ? String(user.hair_color_id) : '',
            hairColor: pickDisplay(user.hair_color_name, user.hair_color_id),
            hairColorName: pickDisplay(user.hair_color_name, user.hair_color_id),
            ethnicityId: user.ethnicity_id != null ? String(user.ethnicity_id) : '',
            ethnicity: pickDisplay(user.ethnicity_name, user.ethnicity_id),
            ethnicityName: pickDisplay(user.ethnicity_name, user.ethnicity_id),
            religionId: user.religion_id != null ? String(user.religion_id) : '',
            religion: pickDisplay(user.religion_name, user.religion_id),
            religionName: pickDisplay(user.religion_name, user.religion_id),
            educationId: user.education_id != null ? String(user.education_id) : '',
            education: pickDisplay(user.education_name, user.education_id),
            educationName: pickDisplay(user.education_name, user.education_id),
            occupationId: user.occupation_category_id != null ? String(user.occupation_category_id) : '',
            occupation: pickDisplay(user.occupation_name, user.occupation_category_id),
            occupationName: pickDisplay(user.occupation_name, user.occupation_category_id),
      company: user.company || 'Not specified',
            smokingId: user.smoking_preference_id != null ? String(user.smoking_preference_id) : '',
            smoking: pickDisplay(user.smoking_preference_name, user.smoking_preference_id),
            smokingName: pickDisplay(user.smoking_preference_name, user.smoking_preference_id),
            drinkingId: user.drinking_preference_id != null ? String(user.drinking_preference_id) : '',
            drinking: pickDisplay(user.drinking_preference_name, user.drinking_preference_id),
            drinkingName: pickDisplay(user.drinking_preference_name, user.drinking_preference_id),
            exerciseId: user.exercise_habits_id != null ? String(user.exercise_habits_id) : '',
            exercise: pickDisplay(user.exercise_habits_name, user.exercise_habits_id),
            exerciseName: pickDisplay(user.exercise_habits_name, user.exercise_habits_id),
            childrenId: user.living_situation_id != null ? String(user.living_situation_id) : '',
            children: pickDisplay(user.living_situation_name, user.living_situation_id),
            childrenName: pickDisplay(user.living_situation_name, user.living_situation_id),
            interests: interestsDisplay,
            hobbies: hobbiesDisplay,
            preferredAgeMin: user.preferred_age_min != null ? String(user.preferred_age_min) : '',
            preferredAgeMax: user.preferred_age_max != null ? String(user.preferred_age_max) : '',
            preferredAgeDisplay: (user.preferred_age_min != null && user.preferred_age_max != null) 
                ? `${user.preferred_age_min} - ${user.preferred_age_max} years` 
                : 'Not specified',
            preferredGender: this.templateUtils.formatGenderIcon(user.preferred_gender),
            preferredGenderRaw: (() => {
                const prefGender = (user.preferred_gender || '').toLowerCase().trim();
                if (prefGender === 'male' || prefGender === 'm') return 'Male';
                if (prefGender === 'female' || prefGender === 'f') return 'Female';
                return user.preferred_gender || 'Not specified';
            })(),
            preferredDistance: user.preferred_distance != null ? user.preferred_distance : 'Not specified',
            preferredDistanceDisplay: user.preferred_distance != null 
                ? `Within ${user.preferred_distance} miles` 
                : 'Not specified',
            preferredHeight: user.preferred_height != null ? String(user.preferred_height) : '',
            preferredHeightFullDisplay,
            // Handle "Not important" (0) and normal values
            preferredHeightReferenceId: (user.preferred_height === '0' || user.preferred_height === 0) ? '0' : (user.preferred_height_reference_id || ''),
            current_preferred_height_reference_id: (user.preferred_height === '0' || user.preferred_height === 0) ? '0' : (user.preferred_height_reference_id || ''),
            current_preferred_height_cm: user.preferred_height || '',
            preferredWeight: user.preferred_weight != null ? String(user.preferred_weight) : '',
            preferredWeightReferenceId: (user.preferred_weight === '0' || user.preferred_weight === 0) ? '0' : (user.preferred_weight_reference_id || ''),
            current_preferred_weight_reference_id: (user.preferred_weight === '0' || user.preferred_weight === 0) ? '0' : (user.preferred_weight_reference_id || ''),
            current_preferred_weight_kg: user.preferred_weight || '',
            // Preferred weight display (similar to preferred height)
            preferredWeightDisplay: (user.preferred_weight === '0' || user.preferred_weight === 0)
                ? 'Not important'
                : (user.preferred_weight && user.preferred_weight.trim() !== '')
                    ? `${user.preferred_weight} kg`
                    : 'Not specified',
            // Preferred weight display (similar to preferred height)
            preferredWeightDisplay: (user.preferred_weight === '0' || user.preferred_weight === 0)
                ? 'Not important'
                : (user.preferred_weight && user.preferred_weight.trim() !== '')
                    ? `${user.preferred_weight} kg`
                    : 'Not specified',
            preferredExercise: (user.preferred_exercise && user.preferred_exercise.trim() !== '') ? String(user.preferred_exercise) : 'Not specified',
            preferredBodyTypeId: user.preferred_body_type != null ? String(user.preferred_body_type) : '',
            preferredBodyType: (user.preferred_body_type && user.preferred_body_type.trim() !== '') ? String(user.preferred_body_type) : 'Not specified',
            preferredEducation: (user.preferred_education && user.preferred_education.trim() !== '') ? String(user.preferred_education) : 'Not specified',
            preferredEducationId: user.preferred_education != null ? String(user.preferred_education) : '',
            preferredReligion: (user.preferred_religion && user.preferred_religion.trim() !== '') ? String(user.preferred_religion) : 'Not specified',
            preferredReligionId: user.preferred_religion != null ? String(user.preferred_religion) : '',
            preferredSmoking: (user.preferred_smoking && user.preferred_smoking.trim() !== '') ? String(user.preferred_smoking) : 'Not specified',
            preferredSmokingId: user.preferred_smoking != null ? String(user.preferred_smoking) : '',
            preferredDrinking: (user.preferred_drinking && user.preferred_drinking.trim() !== '') ? String(user.preferred_drinking) : 'Not specified',
            preferredDrinkingId: user.preferred_drinking != null ? String(user.preferred_drinking) : '',
            preferredChildren: (user.preferred_children && user.preferred_children.trim() !== '') ? String(user.preferred_children) : 'Not specified',
            preferredChildrenId: user.preferred_children != null ? String(user.preferred_children) : '',
            preferredNumberOfChildren: (user.preferred_number_of_children && user.preferred_number_of_children.trim() !== '') ? String(user.preferred_number_of_children) : '',
            preferredNumberOfChildrenId: user.preferred_number_of_children != null ? String(user.preferred_number_of_children) : '',
            preferredEyeColor: (user.preferred_eye_color && user.preferred_eye_color.trim() !== '') ? String(user.preferred_eye_color) : 'Not specified',
            preferredHairColor: (user.preferred_hair_color && user.preferred_hair_color.trim() !== '') ? String(user.preferred_hair_color) : 'Not specified',
            preferredEthnicity: (user.preferred_ethnicity && user.preferred_ethnicity.trim() !== '') ? String(user.preferred_ethnicity) : 'Not specified',
            preferredOccupation: (user.preferred_occupation && user.preferred_occupation.trim() !== '') ? String(user.preferred_occupation) : 'Not specified',
            preferredIncome: (user.preferred_income && user.preferred_income.trim() !== '') ? String(user.preferred_income) : 'Not specified',
            preferredMaritalStatus: (user.preferred_marital_status && user.preferred_marital_status.trim() !== '') ? String(user.preferred_marital_status) : 'Not specified',
            relationshipType: (user.relationship_type && user.relationship_type.trim() !== '') ? String(user.relationship_type) : 'Not specified',
            preferredLifestyle: (user.preferred_lifestyle && user.preferred_lifestyle.trim() !== '') ? String(user.preferred_lifestyle) : 'Not specified',
            preferredBodyArt: (user.preferred_body_art && user.preferred_body_art.trim() !== '') ? String(user.preferred_body_art) : 'Not specified',
            preferredEnglishAbility: (user.preferred_english_ability && user.preferred_english_ability.trim() !== '') ? String(user.preferred_english_ability) : 'Not specified',
            partnerPreferences: user.partner_preferences || '',
            interest_category_id: user.interest_category_id != null ? String(user.interest_category_id) : '',
            current_interest_category_id: user.interest_category_id != null ? String(user.interest_category_id) : '',
            interest_category: interestsDisplay,
            current_interest_category_name: interestsDisplay,
            interestCategories: userInterests,
            interest_category_list: userInterests.map(i => i.name).join(', '),
            interest_category_ids: userInterests.map(i => String(i.id)),
            hobbies_list: userHobbies.map(i => i.name).join(', '),
            hobbies_ids: userHobbies.map(i => String(i.id)),
            hobbiesItems: userHobbies,
                        ...navStates
                    };

        const imagesResult = await this.db.query(
            `
                        SELECT id, file_name, is_profile, uploaded_at
                        FROM user_images 
                        WHERE user_id = $1 
                        ORDER BY is_profile DESC, uploaded_at DESC
            `,
            [userId]
        );

                    userData.photos = imagesResult.rows.map(photo => ({
                        id: photo.id,
                        file_name: photo.file_name,
                        is_profile: photo.is_profile,
                        uploaded_at: new Date(photo.uploaded_at).toLocaleDateString(),
                        views: 0,
                        likes: 0
                    }));
                    userData.photoCount = imagesResult.rows.length;

                    const profilePhoto = imagesResult.rows.find(photo => photo.is_profile);
                    if (profilePhoto) {
                        userData.userAvatar = `/uploads/profile_images/${profilePhoto.file_name}`;
                    }

        // Calculate profile completion percentage based on database columns
        userData.profileCompletionPercentage = await this.calculateProfileCompletion(userId);

        // Fetch real like count
        try {
            const likeCountResult = await this.db.query(`
                SELECT COUNT(*) as like_count
                FROM users_likes 
                WHERE liked_user_id = $1
            `, [userId]);
            userData.likeCount = parseInt(likeCountResult.rows[0]?.like_count || 0);
        } catch (error) {
            console.error('Error fetching like count:', error);
            userData.likeCount = 0;
        }

        // Fetch real view count
        try {
            const viewCountResult = await this.db.query(`
                SELECT COUNT(*) as view_count
                FROM user_activity 
                WHERE target_user_id = $1
                AND activity_type = 'profile_view'
            `, [userId]);
            userData.viewCount = parseInt(viewCountResult.rows[0]?.view_count || 0);
        } catch (error) {
            console.error('Error fetching view count:', error);
            userData.viewCount = 0;
        }

        return userData;
    }

    /**
     * Calculate profile completion percentage based on empty columns in user_attributes and user_preferences
     * Returns percentage (0-100) based on how many columns are filled
     */
    async calculateProfileCompletion(userId) {
        try {
            // Get all columns from user_attributes
            // NOTE: number_of_children_id is EXCLUDED - selecting "have_children" is enough, no need for number_of_children_id
            const uaColumns = [
                'about_me', 'height_cm', 'weight_kg', 'smoking_preference_id', 
                'drinking_preference_id', 'exercise_habits_id', 'ethnicity_id', 
                'income_id', 'marital_status_id', 'lifestyle_id', 'living_situation_id', 
                'have_children', 'body_art_id', 
                'english_ability_id', 'relocation_id', 'occupation_category_id', 
                'body_type_id', 'interest_category_id', 'eye_color_id', 
                'hair_color_id', 'religion_id', 'education_id'
            ];
            
            // Get all columns from user_preferences
            // NOTE: preferred_number_of_children is EXCLUDED from calculation
            const upColumns = [
                'age_min', 'age_max', 'location_radius', 'preferred_gender', 
                'preferred_height', 'preferred_weight', 'preferred_body_type', 
                'preferred_education', 'preferred_religion', 'preferred_exercise', 
                'preferred_smoking', 'preferred_drinking', 'preferred_children', 
                'preferred_eye_color', 'preferred_hair_color', 
                'preferred_ethnicity', 'preferred_occupation', 'preferred_income', 
                'preferred_marital_status', 'preferred_lifestyle', 'preferred_body_art', 
                'preferred_english_ability', 'partner_preferences', 'relationship_type'
            ];

            // Build dynamic SQL to count non-null columns
            // have_children: ANY selected value (including "no children", "has children", etc.) counts as filled
            // If user selected ANY value in have_children dropdown, that's enough - no need for number_of_children_id
            const uaNotNullCount = uaColumns.map(col => {
                if (col === 'about_me') {
                    // TEXT field: check for NULL, empty string, or whitespace-only
                    return `CASE WHEN ua.${col} IS NOT NULL AND ua.${col} != '' AND TRIM(ua.${col}) != '' THEN 1 ELSE 0 END`;
                }
                if (col === 'have_children') {
                    // VARCHAR field: ANY selected value counts as filled (e.g., "1", "2", "3", "4" for "no children", "has children", etc.)
                    // If user selected ANY option in the dropdown, this counts as 1 filled field
                    return `CASE WHEN ua.${col} IS NOT NULL AND ua.${col} != '' AND TRIM(ua.${col}) != '' THEN 1 ELSE 0 END`;
                }
                // All other fields (IDs, numbers): check IS NOT NULL
                return `CASE WHEN ua.${col} IS NOT NULL THEN 1 ELSE 0 END`;
            }).join(' + ');

            const upNotNullCount = upColumns.map(col => {
                // VARCHAR/TEXT preference fields: check for NULL, empty string, or whitespace-only
                if (['preferred_weight', 'preferred_exercise', 'partner_preferences', 'preferred_children', 'relationship_type'].includes(col)) {
                    return `CASE WHEN up.${col} IS NOT NULL AND up.${col} != '' AND TRIM(up.${col}) != '' THEN 1 ELSE 0 END`;
                }
                // All other preference fields: check IS NOT NULL
                return `CASE WHEN up.${col} IS NOT NULL THEN 1 ELSE 0 END`;
            }).join(' + ');

            // Query to count filled columns
            // have_children is counted as 1 field if ANY value is selected
            // number_of_children_id is NOT included in the calculation at all
            const query = `
                SELECT 
                    COALESCE((${uaNotNullCount}), 0)::INTEGER as ua_filled_count,
                    COALESCE((${upNotNullCount}), 0)::INTEGER as up_filled_count,
                    CASE WHEN EXISTS (SELECT 1 FROM user_languages ul WHERE ul.user_id = u.id) THEN 1 ELSE 0 END as has_languages,
                    CASE WHEN EXISTS (SELECT 1 FROM user_hobbies_multiple uh WHERE uh.user_id = u.id) THEN 1 ELSE 0 END as has_hobbies
                FROM users u
                LEFT JOIN user_attributes ua ON u.id = ua.user_id
                LEFT JOIN user_preferences up ON u.id = up.user_id
                WHERE u.id = $1
            `;

            const result = await this.db.query(query, [userId]);

            if (result.rows.length === 0) {
                return 0;
            }

            const row = result.rows[0];
            
            // Calculate total required fields
            // have_children counts as 1 field (if any value selected)
            // number_of_children_id does NOT count towards total or filled count
            const totalColumns = uaColumns.length + upColumns.length + 2; // +2 for languages and hobbies
            
            const filledCount = 
                (parseInt(row.ua_filled_count) || 0) + 
                (parseInt(row.up_filled_count) || 0) + 
                (parseInt(row.has_languages) || 0) +
                (parseInt(row.has_hobbies) || 0);
            
            const percentage = totalColumns > 0 ? Math.round((filledCount / totalColumns) * 100) : 0;

            return Math.min(100, Math.max(0, percentage));
        } catch (error) {
            console.error('Error calculating profile completion:', error);
            return 0;
        }
    }

    async renderApiTemplate(req, res) {
        try {
            const { templateName } = req.params;
            const { userId } = req.query;

            let templatePath = path.join(__dirname, '..', 'app', 'pages', `${templateName}.html`);
            if (!fs.existsSync(templatePath)) {
                return res.status(404).json({ success: false, error: 'Template not found' });
            }

            let templateContent = fs.readFileSync(templatePath, 'utf8');
            let userData = {};

            if (userId) {
                userData = await this.loadUserData(userId, templateName, req.query.tab || 'basic', null);
            }

            templateContent = this.templateUtils.processTemplateVariables(templateContent, userData);

            res.json({ success: true, template: templateContent, userData });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Template rendering failed' });
        }
    }

    async renderTalkPage(req, res, userId = null, user = null, sessionToken = null) {
        try {
            const talkTemplatePath = path.join(__dirname, '..', 'app', 'pages', 'talk.html');
            if (!fs.existsSync(talkTemplatePath)) {
                return res.status(404).send('<h1>Talk template not found</h1>');
            }

            let talkContent = fs.readFileSync(talkTemplatePath, 'utf8');
            let userData = {};
            if (userId) {
                userData = await this.loadUserData(userId, 'talk', 'talk', sessionToken);
                }

            talkContent = await this.templateUtils.processTemplateIncludes(talkContent, userData);
            talkContent = this.templateUtils.processTemplateVariables(talkContent, userData);

            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Content-Type', 'text/html');
            res.send(talkContent);
        } catch (error) {
            res.status(500).send('<h1>Internal Server Error</h1>');
        }
    }
}

module.exports = TemplateController; 
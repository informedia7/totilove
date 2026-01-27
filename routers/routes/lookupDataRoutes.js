/**
 * Lookup Data Routes
 * Provides lookup data for profile editing dropdowns
 */

const express = require('express');
const router = express.Router();
const { lookupLimiter } = require('../middleware/rateLimiter');
const { extractSessionToken } = require('../middleware/authMiddleware');

/**
 * Create lookup data routes
 * @param {Object} authController - AuthController instance
 * @param {Object} authMiddleware - AuthMiddleware instance
 * @returns {express.Router} Express router
 */
function createLookupDataRoutes(authController, authMiddleware) {
    if (!authController || !authController.db) {
        throw new Error('AuthController with database is required for lookup data routes');
    }

    router.get('/api/profile/lookup-data', lookupLimiter, async (req, res) => {
        try {
            let sessionToken = req.query.sessionToken;

            if (sessionToken && typeof sessionToken === 'string') {
                const normalized = sessionToken.trim().toLowerCase();
                if (!normalized || normalized === 'null' || normalized === 'undefined') {
                    sessionToken = null;
                }
            }

            sessionToken = sessionToken || extractSessionToken(req);

            if (!sessionToken) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token is required'
                });
            }

            if (!authMiddleware || !authMiddleware.sessions) {
                console.error('[LookupData] authMiddleware not available');
                return res.status(500).json({
                    success: false,
                    error: 'Authentication middleware not available'
                });
            }

            // Verify session
            const session = authMiddleware.sessions.get(sessionToken);
            if (!session || session.expiresAt <= Date.now()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            const lookupData = {};
            const missingTables = [];
            const queryErrors = [];
            
            const executeQuery = async (queryText, tableName, description) => {
                try {
                    const result = await authController.db.query(queryText);
                    return { success: true, data: result.rows, tableName };
                } catch (error) {
                    const errorInfo = {
                        tableName,
                        description,
                        error: error.message,
                        code: error.code,
                        query: queryText
                    };
                    console.error(`[LookupData] ❌ TABLE MISSING OR ERROR: ${tableName}`, errorInfo);
                    queryErrors.push(errorInfo);
                    missingTables.push(tableName);
                    throw error;
                }
            };

            try {
                // Get all lookup tables
                const [
                    bodyTypesResult,
                    eyeColorsResult,
                    hairColorsResult,
                    ethnicitiesResult,
                    religionsResult,
                    educationLevelsResult,
                    occupationCategoriesResult,
                    incomeRangesResult,
                    lifestylePreferencesResult,
                    livingSituationsResult,
                    maritalStatusesResult,
                    smokingPreferencesResult,
                    drinkingPreferencesResult,
                    exerciseHabitsResult,
                    haveChildrenStatusesResult,
                    heightsResult,
                    weightsResult,
                    numberOfChildrenResult,
                    relocationPreferencesResult,
                    relationshipTypesResult,
                    countriesResult,
                    languagesResult,
                    fluencyLevelsResult
                ] = await Promise.all([
                    executeQuery('SELECT id, name, description FROM user_body_types WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_body_types', 'Body types lookup'),
                    executeQuery('SELECT id, name FROM user_eye_colors WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_eye_colors', 'Eye colors lookup'),
                    executeQuery('SELECT id, name FROM user_hair_colors WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_hair_colors', 'Hair colors lookup'),
                    executeQuery('SELECT id, name FROM user_ethnicities WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_ethnicities', 'Ethnicities lookup'),
                    executeQuery('SELECT id, name FROM user_religions WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_religions', 'Religions lookup'),
                    executeQuery('SELECT id, name FROM user_education_levels WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_education_levels', 'Education levels lookup'),
                    executeQuery('SELECT id, name FROM user_occupation_categories WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_occupation_categories', 'Occupation categories lookup'),
                    executeQuery('SELECT id, name FROM user_income_ranges WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_income_ranges', 'Income ranges lookup'),
                    executeQuery('SELECT id, name FROM user_lifestyle_preferences WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_lifestyle_preferences', 'Lifestyle preferences lookup'),
                    executeQuery('SELECT id, name FROM user_living_situations WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_living_situations', 'Living situations lookup'),
                    executeQuery('SELECT id, name FROM user_marital_statuses WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_marital_statuses', 'Marital statuses lookup'),
                    executeQuery('SELECT id, name FROM user_smoking_preferences WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_smoking_preferences', 'Smoking preferences lookup'),
                    executeQuery('SELECT id, name FROM user_drinking_preferences WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_drinking_preferences', 'Drinking preferences lookup'),
                    executeQuery('SELECT id, name FROM user_exercise_habits WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_exercise_habits', 'Exercise habits lookup'),
                    executeQuery('SELECT id, name FROM user_have_children_statuses WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_have_children_statuses', 'Have children statuses lookup'),
                    executeQuery('SELECT id, height_cm, display_text FROM user_height_reference ORDER BY height_cm ASC', 'user_height_reference', 'Heights lookup'),
                    executeQuery('SELECT id, weight_kg, display_text FROM user_weight_reference ORDER BY weight_kg ASC', 'user_weight_reference', 'Weights lookup'),
                    executeQuery('SELECT id, name FROM user_number_of_children WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_number_of_children', 'Number of children lookup'),
                    executeQuery('SELECT id, name FROM user_relocation_willingness WHERE is_active = true ORDER BY display_order ASC, name ASC', 'user_relocation_willingness', 'Relocation preferences lookup'),
                    executeQuery('SELECT id, display_name as name FROM user_relationship_type_reference WHERE is_active = true ORDER BY display_order ASC, display_name ASC', 'user_relationship_type_reference', 'Relationship types lookup'),
                    executeQuery('SELECT id, name, emoji FROM country ORDER BY name ASC', 'country', 'Countries lookup'),
                    executeQuery('SELECT id, name, native_name, iso_code FROM languages WHERE is_active = true ORDER BY name ASC', 'languages', 'Languages lookup'),
                    executeQuery('SELECT id, name FROM user_language_fluency_levels ORDER BY id ASC', 'user_language_fluency_levels', 'Fluency levels lookup')
                ]);

                lookupData.bodyTypes = bodyTypesResult.data;
                lookupData.eyeColors = eyeColorsResult.data;
                lookupData.hairColors = hairColorsResult.data;
                lookupData.ethnicities = ethnicitiesResult.data;
                lookupData.religions = religionsResult.data;
                lookupData.educationLevels = educationLevelsResult.data;
                lookupData.occupationCategories = occupationCategoriesResult.data;
                lookupData.incomeRanges = incomeRangesResult.data;
                lookupData.lifestylePreferences = lifestylePreferencesResult.data;
                lookupData.livingSituations = livingSituationsResult.data;
                lookupData.maritalStatuses = maritalStatusesResult.data;
                lookupData.smokingPreferences = smokingPreferencesResult.data;
                lookupData.drinkingPreferences = drinkingPreferencesResult.data;
                lookupData.exerciseHabits = exerciseHabitsResult.data;
                lookupData.haveChildrenStatuses = haveChildrenStatusesResult.data;
                lookupData.heights = heightsResult.data;
                lookupData.weights = weightsResult.data;
                lookupData.numberOfChildren = numberOfChildrenResult.data;
                lookupData.relocationPreferences = relocationPreferencesResult.data;
                lookupData.relationshipTypes = relationshipTypesResult.data;
                lookupData.countries = countriesResult.data;
                lookupData.languages = languagesResult.data;
                lookupData.fluencyLevels = fluencyLevelsResult.data;
                lookupData.genders = [{ id: 'male', name: 'Male' }, { id: 'female', name: 'Female' }];
                lookupData.preferredChildrenStatuses = lookupData.haveChildrenStatuses;

                // Interest categories (supports interests + multi-select badges)
                try {
                    const interestCategoriesResult = await executeQuery(
                        'SELECT id, name, description, icon, icon AS emoji, color FROM user_interest_categories WHERE is_active = true ORDER BY name ASC',
                        'user_interest_categories',
                        'Interest categories lookup'
                    );
                    lookupData.interestCategories = interestCategoriesResult.data;
                    lookupData.interests = interestCategoriesResult.data;
                } catch (interestError) {
                    lookupData.interestCategories = [];
                    lookupData.interests = [];
                }

                // Hobbies (with graceful fallbacks for legacy table names/structures)
                const hobbyQueries = [
                    {
                        table: 'user_hobbies_reference',
                        query: 'SELECT id, name, icon, icon AS emoji FROM user_hobbies_reference WHERE is_active = true ORDER BY name ASC',
                        description: 'Hobbies lookup'
                    },
                    {
                        table: 'user_hobbies',
                        query: 'SELECT id, name, icon, icon AS emoji FROM user_hobbies WHERE is_active = true ORDER BY name ASC',
                        description: 'Hobbies lookup (fallback)'
                    }
                ];

                let hobbiesLoaded = false;
                for (const hobbyQuery of hobbyQueries) {
                    if (hobbiesLoaded) break;
                    try {
                        const hobbiesResult = await executeQuery(hobbyQuery.query, hobbyQuery.table, hobbyQuery.description);
                        lookupData.hobbies = hobbiesResult.data;
                        lookupData.hobbies_reference = hobbiesResult.data;
                        lookupData.hobbiesReference = hobbiesResult.data;
                        hobbiesLoaded = true;
                    } catch (hobbyError) {
                        // Try next fallback table/query
                    }
                }

                if (!hobbiesLoaded) {
                    lookupData.hobbies = [];
                    lookupData.hobbies_reference = [];
                    lookupData.hobbiesReference = [];
                }

                // Try body art and english ability with fallbacks
                try {
                    const bodyArtResult = await authController.db.query('SELECT id, name FROM user_body_art WHERE is_active = true ORDER BY display_order ASC, name ASC');
                    lookupData.bodyArt = bodyArtResult.rows;
                } catch (e1) {
                    try {
                        const bodyArtResult = await authController.db.query('SELECT id, name FROM user_body_arts WHERE is_active = true ORDER BY display_order ASC, name ASC');
                        lookupData.bodyArt = bodyArtResult.rows;
                    } catch (e2) {
                        try {
                            const bodyArtResult = await authController.db.query('SELECT id, name FROM user_body_art_types WHERE is_active = true ORDER BY display_order ASC, name ASC');
                            lookupData.bodyArt = bodyArtResult.rows;
                        } catch (e3) {
                            lookupData.bodyArt = [];
                        }
                    }
                }

                try {
                    const englishAbilityResult = await authController.db.query('SELECT id, name FROM user_english_ability WHERE is_active = true ORDER BY display_order ASC, name ASC');
                    lookupData.englishAbility = englishAbilityResult.rows;
                } catch (e1) {
                    try {
                        const englishAbilityResult = await authController.db.query('SELECT id, name FROM user_english_abilities WHERE is_active = true ORDER BY display_order ASC, name ASC');
                        lookupData.englishAbility = englishAbilityResult.rows;
                    } catch (e2) {
                        lookupData.englishAbility = [];
                    }
                }

                res.json({ success: true, data: lookupData });

            } catch (dbError) {
                console.error('[LookupData] ❌ DATABASE ERROR:', missingTables);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch lookup data',
                    missingTables: missingTables,
                    errors: queryErrors.map(e => ({
                        table: e.tableName,
                        description: e.description,
                        error: e.error,
                        code: e.code
                    })),
                    details: process.env.NODE_ENV === 'development' ? {
                        message: dbError.message,
                        code: dbError.code,
                        detail: dbError.detail
                    } : undefined
                });
            }
        } catch (error) {
            console.error('[LookupData] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });

    return router;
}

module.exports = createLookupDataRoutes;




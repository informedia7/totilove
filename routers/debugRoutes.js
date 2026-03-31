const express = require('express');

module.exports = function(db, TemplateController) {
    const router = express.Router();

    // Test route
    router.get('/debug/test', (req, res) => {
        res.json({
            success: true,
            message: 'Debug test route is working!',
            timestamp: new Date().toISOString(),
            path: req.path
        });
    });

    // Test query using users_deleted as source of truth (simplified structure - no receiver_id)
    router.get('/debug/test-deleted-user-logic', async (req, res) => {
        try {
            const userId = parseInt(req.query.userId) || 6; // elladavis173
            const deletedUserId = parseInt(req.query.deletedUserId) || 2; // deleted user
            
            // Query using users_deleted table - only contains: deleted_user_id, real_name, email, created_at
            // No receiver_id column - this is a global list of deleted users
            const result = await db.query(`
                SELECT 
                    deleted_user_id,
                    real_name,
                    email,
                    created_at
                FROM users_deleted
                WHERE deleted_user_id = $1
            `, [deletedUserId]);

            // Check if user had messages with this deleted user (to determine if they should see it)
            const messagesCheck = await db.query(`
                SELECT COUNT(*) as message_count,
                       MAX(timestamp) as last_message_time
                FROM user_messages
                WHERE ((sender_id = $1 AND receiver_id = $2)
                   OR (sender_id = $2 AND receiver_id = $1))
                AND COALESCE(deleted_by_receiver, false) = false
                AND COALESCE(recall_type, 'none') = 'none'
                AND COALESCE(message_type, 'text') != 'like'
            `, [userId, deletedUserId]);
            
            // Show the query logic explanation
            const queryLogic = `
                How elladavis173 (User ${userId}) tracks deleted user ${deletedUserId}:
                
                1. Check if user ${deletedUserId} exists in users_deleted table (global list)
                2. Check if user ${userId} had messages with user ${deletedUserId} in messages table
                3. If both conditions are true → show deleted user in conversation list
                
                Query used:
                SELECT * FROM users_deleted WHERE deleted_user_id = ${deletedUserId}
                AND EXISTS (
                    SELECT 1 FROM user_messages 
                    WHERE (sender_id = ${userId} AND receiver_id = ${deletedUserId})
                       OR (sender_id = ${deletedUserId} AND receiver_id = ${userId})
                )
            `;

            // Get all deleted users in the table
            const allDeletedUsers = await db.query(`
                SELECT 
                    deleted_user_id,
                    real_name,
                    email,
                    created_at
                FROM users_deleted
                ORDER BY created_at DESC
                LIMIT 10
            `);

            res.json({
                success: true,
                receiver_id: userId,
                deleted_user_id: deletedUserId,
                query_used: 'SELECT deleted_user_id, real_name, email, created_at FROM users_deleted WHERE deleted_user_id = $1',
                found_in_users_deleted: result.rows.length > 0,
                users_deleted_result: result.rows.length > 0 ? {
                    deleted_user_id: result.rows[0].deleted_user_id,
                    real_name: result.rows[0].real_name,
                    real_name: result.rows[0].real_name, // For backward compatibility
                    email: result.rows[0].email,
                    created_at: result.rows[0].created_at,
                    profile_image: '/assets/images/account_deactivated.svg', // Set in application logic
                    is_deleted_user: true // Set in application logic
                } : null,
                had_messages_with_user: messagesCheck.rows[0].message_count > 0,
                message_count: parseInt(messagesCheck.rows[0].message_count || 0),
                last_message_time: messagesCheck.rows[0].last_message_time,
                should_show_in_list: result.rows.length > 0 && messagesCheck.rows[0].message_count > 0,
                all_deleted_users_sample: allDeletedUsers.rows,
                table_structure: {
                    columns: ['id', 'deleted_user_id', 'real_name', 'email', 'created_at'],
                    note: 'users_deleted table is now a global list - no receiver_id. Check messages table to see if user should see deleted user in their list.'
                },
                query_logic: queryLogic
            });
        } catch (error) {
            console.error('Test query error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
    });

    // Execute the exact query from messageController
    router.get('/debug/execute-conversations-query', async (req, res) => {
        try {
            const userId = parseInt(req.query.userId);
            if (!userId || isNaN(userId)) {
                return res.status(400).json({
                    success: false,
                    error: 'userId parameter required'
                });
            }

            // Execute the EXACT query from messageController.getConversationsList
            const result = await db.query(`
                WITH active_conversations AS (
                    SELECT DISTINCT 
                        CASE 
                            WHEN m.sender_id = $1 THEN m.receiver_id
                            ELSE m.sender_id
                        END as other_user_id,
                        u.real_name as other_real_name,
                        u.email as other_email,
                        COALESCE(ui.file_name, NULL) as profile_image,
                        MAX(m.timestamp) as last_message_time,
                        COUNT(CASE 
                            WHEN m.receiver_id = $1 
                            AND m.read_at IS NULL 
                            AND COALESCE(m.deleted_by_receiver, false) = false
                            AND COALESCE(m.recall_type, 'none') = 'none'
                            AND COALESCE(m.message_type, 'text') != 'like'
                            THEN 1 
                        END) as unread_count,
                        CASE 
                            WHEN ud.deleted_user_id IS NOT NULL THEN true
                            ELSE false
                        END as is_deleted_user
                    FROM user_messages m
                    JOIN users u ON (
                        CASE 
                            WHEN m.sender_id = $1 THEN m.receiver_id
                            ELSE m.sender_id
                        END = u.id
                    )
                    LEFT JOIN user_images ui ON ui.user_id = u.id AND ui.is_profile = 1
                    LEFT JOIN users_deleted ud ON ud.receiver_id = $1 
                        AND ud.deleted_user_id = (
                            CASE 
                                WHEN m.sender_id = $1 THEN m.receiver_id
                                ELSE m.sender_id
                            END
                        )
                    WHERE (m.sender_id = $1 OR m.receiver_id = $1)
                    AND COALESCE(m.deleted_by_receiver, false) = false
                    AND COALESCE(m.recall_type, 'none') = 'none'
                    AND COALESCE(m.message_type, 'text') != 'like'
                    GROUP BY 
                        CASE 
                            WHEN m.sender_id = $1 THEN m.receiver_id
                            ELSE m.sender_id
                        END,
                        u.real_name, 
                        u.email, 
                        ui.file_name,
                        ud.deleted_user_id
                ),
                deleted_users_cte AS (
                    SELECT 
                        ud.deleted_user_id as other_user_id,
                        ud.real_name as other_real_name,
                        ud.email as other_email,
                        '/assets/images/account_deactivated.svg' as profile_image,
                        ud.created_at as last_message_time,
                        0 as unread_count,
                        true as is_deleted_user
                    FROM users_deleted ud
                    WHERE ud.receiver_id = $1
                    AND NOT EXISTS (
                        SELECT 1 FROM user_messages m
                        WHERE (m.sender_id = $1 AND m.receiver_id = ud.deleted_user_id)
                           OR (m.sender_id = ud.deleted_user_id AND m.receiver_id = $1)
                    )
                )
                SELECT 
                    other_user_id,
                    other_real_name,
                    other_email,
                    CASE 
                        WHEN is_deleted_user = true THEN '/assets/images/account_deactivated.svg'
                        ELSE profile_image
                    END as profile_image,
                    last_message_time,
                    unread_count,
                    is_deleted_user
                FROM active_conversations
                UNION ALL
                SELECT 
                    other_user_id,
                    other_real_name,
                    other_email,
                    profile_image,
                    last_message_time,
                    unread_count,
                    true as is_deleted_user
                FROM deleted_users_cte
                ORDER BY last_message_time DESC
            `, [userId]);

            res.json({
                success: true,
                userId: userId,
                query: 'Exact query from messageController.getConversationsList',
                rowCount: result.rows.length,
                rows: result.rows,
                deletedUsersInQuery: result.rows.filter(r => r.is_deleted_user === true),
                deletedUserIds: result.rows.filter(r => r.is_deleted_user === true).map(r => r.other_user_id)
            });
        } catch (error) {
            console.error('Query execution error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
    });

    // Diagnostic endpoint for deleted users
    router.get('/debug/deleted-users-diagnostic', async (req, res) => {
        try {
            const userId = parseInt(req.query.userId);
            if (!userId || isNaN(userId)) {
                return res.status(400).json({
                    success: false,
                    error: 'userId parameter required'
                });
            }

            // Check users_deleted table
            const deletedCheck = await db.query(`
                SELECT * FROM users_deleted WHERE receiver_id = $1
            `, [userId]);

            // Check if deleted users exist in users table
            const deletedUserIds = deletedCheck.rows.map(r => r.deleted_user_id);
            let usersTableCheck = { rows: [] };
            if (deletedUserIds.length > 0) {
                usersTableCheck = await db.query(`
                    SELECT id, real_name, email FROM users WHERE id = ANY($1::int[])
                `, [deletedUserIds]);
            }

            // Check messages with deleted users
            let messagesCheck = { rows: [] };
            if (deletedUserIds.length > 0) {
                messagesCheck = await db.query(`
                    SELECT COUNT(*) as message_count, 
                           MAX(timestamp) as last_message_time
                    FROM user_messages 
                    WHERE (sender_id = $1 AND receiver_id = ANY($2::int[]))
                       OR (sender_id = ANY($2::int[]) AND receiver_id = $1)
                `, [userId, deletedUserIds]);
            }

            // Test the actual query logic
            let queryTest = { rows: [] };
            try {
                queryTest = await db.query(`
                    WITH active_conversations AS (
                        SELECT DISTINCT 
                            CASE 
                                WHEN m.sender_id = $1 THEN m.receiver_id
                                ELSE m.sender_id
                            END as other_user_id,
                            u.real_name as other_real_name,
                            u.email as other_email,
                            COALESCE(ui.file_name, NULL) as profile_image,
                            MAX(m.timestamp) as last_message_time,
                            COUNT(CASE 
                                WHEN m.receiver_id = $1 
                                AND m.read_at IS NULL 
                                AND COALESCE(m.deleted_by_receiver, false) = false
                                AND COALESCE(m.recall_type, 'none') = 'none'
                                AND COALESCE(m.message_type, 'text') != 'like'
                                THEN 1 
                            END) as unread_count,
                            CASE 
                                WHEN ud.deleted_user_id IS NOT NULL THEN true
                                ELSE false
                            END as is_deleted_user
                        FROM user_messages m
                        JOIN users u ON (
                            CASE 
                                WHEN m.sender_id = $1 THEN m.receiver_id
                                ELSE m.sender_id
                            END = u.id
                        )
                        LEFT JOIN user_images ui ON ui.user_id = u.id AND ui.is_profile = 1
                        LEFT JOIN users_deleted ud ON ud.receiver_id = $1 
                            AND ud.deleted_user_id = (
                                CASE 
                                    WHEN m.sender_id = $1 THEN m.receiver_id
                                    ELSE m.sender_id
                                END
                            )
                        WHERE (m.sender_id = $1 OR m.receiver_id = $1)
                        AND COALESCE(m.deleted_by_receiver, false) = false
                        AND COALESCE(m.recall_type, 'none') = 'none'
                        AND COALESCE(m.message_type, 'text') != 'like'
                        GROUP BY 
                            CASE 
                                WHEN m.sender_id = $1 THEN m.receiver_id
                                ELSE m.sender_id
                            END,
                            u.real_name, 
                            u.email, 
                            ui.file_name,
                            ud.deleted_user_id
                    )
                    SELECT 
                        other_user_id,
                        other_real_name,
                        is_deleted_user,
                        profile_image
                    FROM active_conversations
                    WHERE other_user_id = ANY($2::int[])
                `, [userId, deletedUserIds.length > 0 ? deletedUserIds : [0]]);
            } catch (queryError) {
                console.error('Query test error:', queryError);
            }

            res.json({
                success: true,
                userId: userId,
                users_deleted_table: {
                    count: deletedCheck.rows.length,
                    entries: deletedCheck.rows
                },
                users_table_check: {
                    count: usersTableCheck.rows.length,
                    entries: usersTableCheck.rows,
                    note: deletedUserIds.length > 0 && usersTableCheck.rows.length === 0 
                        ? '⚠️ Deleted users NOT found in users table (hard deleted)' 
                        : deletedUserIds.length > 0 && usersTableCheck.rows.length < deletedUserIds.length
                        ? '⚠️ Some deleted users missing from users table'
                        : '✅ All deleted users found in users table'
                },
                messages_check: {
                    message_count: messagesCheck.rows[0]?.message_count || 0,
                    last_message_time: messagesCheck.rows[0]?.last_message_time || null
                },
                query_test: {
                    count: queryTest.rows.length,
                    entries: queryTest.rows,
                    note: queryTest.rows.length === 0 && deletedCheck.rows.length > 0
                        ? '⚠️ Query returned 0 rows - likely because deleted users are not in users table (JOIN fails)'
                        : queryTest.rows.length > 0
                        ? '✅ Query found deleted users'
                        : 'No deleted users to test'
                },
                diagnosis: deletedUserIds.length > 0 && usersTableCheck.rows.length === 0
                    ? 'PROBLEM: Deleted users were hard deleted from users table. The JOIN with users u will fail. Need to modify query to handle this case.'
                    : deletedUserIds.length > 0 && queryTest.rows.length === 0
                    ? 'PROBLEM: Query not returning deleted users even though they exist in users table. Check JOIN conditions.'
                    : deletedUserIds.length === 0
                    ? 'INFO: No deleted users found in users_deleted table for this user.'
                    : 'OK: Query should work correctly.'
            });
        } catch (error) {
            console.error('Diagnostic error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
    });

    // Helper function to render table sections
    function renderSection(title, data) {
        const rows = Object.entries(data).map(([key, value]) => {
            let displayValue = '';
            if (value === null || value === undefined) {
                displayValue = '<span class="null">null</span>';
            } else if (value === '') {
                displayValue = '<span class="empty">(empty)</span>';
            } else if (typeof value === 'number') {
                displayValue = `<span class="number">${value}</span>`;
            } else if (typeof value === 'string') {
                displayValue = `<span class="string">"${value}"</span>`;
            } else {
                displayValue = JSON.stringify(value);
            }
            return `<tr><td><strong>${key}</strong></td><td>${displayValue}</td></tr>`;
        }).join('');

        return `
            <div class="section">
                <div class="section-title">${title}</div>
                <table>
                    <thead><tr><th>Field</th><th>Value</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    // Debug page to display all template data
    router.get('/debug/user-data/:userId', async (req, res) => {
        try {
            const { userId } = req.params;
            const sessionToken = req.query.token || 'test-token';

            console.log(`[DEBUG] Fetching user data for userId: ${userId}`);

            // Get the user data from database (using correct table names)
            const userResult = await db.query(`
                SELECT u.id, u.real_name, u.email, u.birthdate, u.gender,
                       u.city_id, u.country_id, u.state_id, u.date_joined, u.last_login,
                       ua.about_me, ua.height_cm, ua.weight_kg,
                       ua.smoking_preference_id, ua.drinking_preference_id, ua.exercise_habits_id,
                       ua.ethnicity_id, ua.income_id, ua.marital_status_id, ua.lifestyle_id,
                       ua.living_situation_id, ua.body_art_id, ua.english_ability_id,
                       ua.relocation_id, ua.occupation_category_id,
                       ua.body_type_id, ua.interest_category_id, ua.eye_color_id, ua.hair_color_id,
                       ua.religion_id, ua.education_id,
                       bt.name as body_type_name, ic.name as interest_category_name, 
                       ey.name as eye_color_name, hc.name as hair_color_name,
                       eth.name as ethnicity_name, rel.name as religion_name, edu.name as education_name,
                       occ.name as occupation_name, inc.name as income_name, ls.name as lifestyle_name,
                       lv.name as living_situation_name, ms.name as marital_status_name,
                       sp.name as smoking_preference_name, dp.name as drinking_preference_name,
                       eh.name as exercise_habits_name,
                       ci.name as city_name, s.name as state_name, co.name as country_name,
                       uhr.id as height_reference_id, uwr.id as weight_reference_id,
                       up.age_min as preferred_age_min, up.age_max as preferred_age_max,
                       up.location_radius as preferred_distance, up.preferred_gender,
                       up.preferred_height, uphr.id as preferred_height_reference_id,
                       up.preferred_body_type, up.preferred_education,
                       up.preferred_religion, up.preferred_smoking, up.preferred_drinking,
                       up.preferred_children
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
                WHERE u.id = $1
            `, [userId]);

            if (userResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const user = userResult.rows[0];
            const format = req.query.format || 'html';

            // Calculate age (handle null birthdate)
            if (user.birthdate) {
                const birthDate = new Date(user.birthdate);
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }
                user.age = age;
            } else {
                user.age = null;
            }

            // Format height
            let heightDisplay = '';
            if (user.height_cm) {
                const feet = Math.floor(user.height_cm / 30.48);
                const inches = Math.round((user.height_cm % 30.48) / 2.54);
                heightDisplay = `${feet}'${inches}"`;
            }

            // Build userData object
            const userData = {
                userId: user.id,
                real_name: user.real_name || '',
                userEmail: user.email,
                userAge: user.age,
                userGender: user.gender,
                userGenderRaw: user.gender,
                userLocation: [user.city_name, user.state_name, user.country_name]
                    .filter(Boolean).join(', '),
                userHeight: heightDisplay,
                aboutMe: user.about_me || '',
                
                // ID Variables (for backward compatibility, also add non-Id versions)
                bodyTypeId: user.body_type_id != null ? String(user.body_type_id) : '',
                bodyType: user.body_type_id != null ? String(user.body_type_id) : '', // For {{bodyType}} in HTML
                eyeColorId: user.eye_color_id != null ? String(user.eye_color_id) : '',
                eyeColor: user.eye_color_id != null ? String(user.eye_color_id) : '', // For backward compatibility
                hairColorId: user.hair_color_id != null ? String(user.hair_color_id) : '',
                hairColor: user.hair_color_id != null ? String(user.hair_color_id) : '', // For backward compatibility
                ethnicityId: user.ethnicity_id != null ? String(user.ethnicity_id) : '',
                ethnicity: user.ethnicity_id != null ? String(user.ethnicity_id) : '', // For backward compatibility
                religionId: user.religion_id != null ? String(user.religion_id) : '',
                religion: user.religion_id != null ? String(user.religion_id) : '', // For backward compatibility
                educationId: user.education_id != null ? String(user.education_id) : '',
                education: user.education_id != null ? String(user.education_id) : '', // For backward compatibility
                occupationId: user.occupation_category_id != null ? String(user.occupation_category_id) : '',
                occupation: user.occupation_category_id != null ? String(user.occupation_category_id) : '', // For backward compatibility
                smokingId: user.smoking_preference_id != null ? String(user.smoking_preference_id) : '',
                smoking: user.smoking_preference_id != null ? String(user.smoking_preference_id) : '', // For backward compatibility
                drinkingId: user.drinking_preference_id != null ? String(user.drinking_preference_id) : '',
                drinking: user.drinking_preference_id != null ? String(user.drinking_preference_id) : '', // For backward compatibility
                exerciseId: user.exercise_habits_id != null ? String(user.exercise_habits_id) : '',
                exercise: user.exercise_habits_id != null ? String(user.exercise_habits_id) : '', // For backward compatibility
                childrenId: user.living_situation_id != null ? String(user.living_situation_id) : '',
                children: user.living_situation_id != null ? String(user.living_situation_id) : '', // For backward compatibility
                
                // Name Variables
                bodyTypeName: user.body_type_name || '',
                eyeColorName: user.eye_color_name || '',
                hairColorName: user.hair_color_name || '',
                ethnicityName: user.ethnicity_name || '',
                religionName: user.religion_name || '',
                educationName: user.education_name || '',
                occupationName: user.occupation_name || '',
                smokingName: user.smoking_preference_name || '',
                drinkingName: user.drinking_preference_name || '',
                exerciseName: user.exercise_habits_name || '',
                childrenName: user.living_situation_name || '',
                
                // Height/Weight
                height_cm: user.height_cm || '',
                weight_kg: user.weight_kg || '',
                height_reference_id: user.height_reference_id || '',
                weight_reference_id: user.weight_reference_id || '',
                current_height_reference_id: user.height_reference_id || '',
                current_height_cm: user.height_cm || '',
                current_weight_reference_id: user.weight_reference_id || '',
                current_weight_kg: user.weight_kg || '',
                
                // Preferred
                preferredAgeMin: user.preferred_age_min != null ? String(user.preferred_age_min) : '',
                preferredAgeMax: user.preferred_age_max != null ? String(user.preferred_age_max) : '',
                preferredGender: user.preferred_gender || 'Any',
                preferredDistance: user.preferred_distance || 50,
                preferredHeight: user.preferred_height != null ? String(user.preferred_height) : '',
                // Handle "Not important" (0) and normal values
                preferredHeightReferenceId: (user.preferred_height === '0' || user.preferred_height === 0) ? '0' : (user.preferred_height_reference_id || ''),
                current_preferred_height_reference_id: (user.preferred_height === '0' || user.preferred_height === 0) ? '0' : (user.preferred_height_reference_id || ''),
                current_preferred_height_cm: user.preferred_height || '',
                preferredBodyType: (user.preferred_body_type != null && user.preferred_body_type !== '') ? String(user.preferred_body_type) : '',
                preferredBodyTypeId: (user.preferred_body_type != null && user.preferred_body_type !== '') ? String(user.preferred_body_type) : '',
                preferredEducation: (user.preferred_education != null && user.preferred_education !== '') ? String(user.preferred_education) : '',
                preferredEducationId: (user.preferred_education != null && user.preferred_education !== '') ? String(user.preferred_education) : '',
                preferredReligion: (user.preferred_religion != null && user.preferred_religion !== '') ? String(user.preferred_religion) : '',
                preferredReligionId: (user.preferred_religion != null && user.preferred_religion !== '') ? String(user.preferred_religion) : '',
                preferredSmoking: (user.preferred_smoking != null && user.preferred_smoking !== '') ? String(user.preferred_smoking) : '',
                preferredSmokingId: (user.preferred_smoking != null && user.preferred_smoking !== '') ? String(user.preferred_smoking) : '',
                preferredDrinking: (user.preferred_drinking != null && user.preferred_drinking !== '') ? String(user.preferred_drinking) : '',
                preferredDrinkingId: (user.preferred_drinking != null && user.preferred_drinking !== '') ? String(user.preferred_drinking) : '',
                preferredChildren: (user.preferred_children != null && user.preferred_children !== '') ? String(user.preferred_children) : '',
                preferredChildrenId: (user.preferred_children != null && user.preferred_children !== '') ? String(user.preferred_children) : '',
                
                // Interest
                interest_category_id: user.interest_category_id != null ? String(user.interest_category_id) : '',
                current_interest_category_id: user.interest_category_id != null ? String(user.interest_category_id) : '',
                interest_category: user.interest_category_name || '',
                current_interest_category_name: user.interest_category_name || ''
            };

            if (format === 'json') {
                return res.json({
                    success: true,
                    data: userData,
                    rawUser: user
                });
            }

            // HTML format
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Debug - User Data ${userId}</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background: #f5f5f5;
                            padding: 2rem;
                        }
                        .container { max-width: 1400px; margin: 0 auto; }
                        h1 { color: #333; margin-bottom: 1rem; }
                        .controls {
                            background: white;
                            padding: 1rem;
                            border-radius: 4px;
                            margin-bottom: 1rem;
                        }
                        .controls a {
                            display: inline-block;
                            padding: 0.5rem 1rem;
                            background: #007bff;
                            color: white;
                            text-decoration: none;
                            border-radius: 4px;
                            margin-right: 0.5rem;
                        }
                        .controls a:hover { background: #0056b3; }
                        .section {
                            background: white;
                            border-radius: 4px;
                            margin-bottom: 2rem;
                            overflow: hidden;
                        }
                        .section-title {
                            background: #007bff;
                            color: white;
                            padding: 1rem;
                            font-weight: bold;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                        }
                        th, td {
                            padding: 0.75rem 1rem;
                            text-align: left;
                            border-bottom: 1px solid #ddd;
                        }
                        th {
                            background: #f9f9f9;
                            font-weight: bold;
                            color: #333;
                        }
                        tr:hover { background: #f9f9f9; }
                        .empty { color: #999; font-style: italic; }
                        .number { color: #0066cc; font-weight: bold; }
                        .string { color: #008000; }
                        .null { color: #999; }
                        .note {
                            padding: 1rem;
                            background: #e7f3ff;
                            border-left: 4px solid #2196F3;
                            margin: 1rem;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🔍 Debug - User Data (ID: ${userId})</h1>
                        
                        <div class="controls">
                            <a href="/debug/user-data/${userId}?format=html">📊 HTML View</a>
                            <a href="/debug/user-data/${userId}?format=json">📄 JSON View</a>
                            <a href="/">🏠 Home</a>
                        </div>
                        <div class="note">
                            <strong>ℹ️ Info:</strong> This page displays all database values and template variables.
                            Empty string values are safe for numeric inputs (they won't cause "cannot be parsed" errors).
                        </div>
                        ${renderSection('User Basic Info', {
                            'User ID': user.id,
                            'Username': user.real_name || '',
                            'Email': user.email,
                            'Age': user.age,
                            'Gender': user.gender,
                            'Birthdate': user.birthdate,
                            'Date Joined': user.date_joined,
                            'Last Login': user.last_login,
                            'About Me': user.about_me
                        })}
                        ${renderSection('Location', {
                            'City': user.city_name,
                            'State': user.state_name,
                            'Country': user.country_name
                        })}
                        ${renderSection('Physical Attributes (IDs)', {
                            'Body Type ID': user.body_type_id,
                            'Eye Color ID': user.eye_color_id,
                            'Hair Color ID': user.hair_color_id,
                            'Ethnicity ID': user.ethnicity_id,
                            'Religion ID': user.religion_id,
                            'Education ID': user.education_id
                        })}
                        ${renderSection('Physical Attributes (Names)', {
                            'Body Type': user.body_type_name,
                            'Eye Color': user.eye_color_name,
                            'Hair Color': user.hair_color_name,
                            'Ethnicity': user.ethnicity_name,
                            'Religion': user.religion_name,
                            'Education': user.education_name
                        })}
                        ${renderSection('Height & Weight', {
                            'Height (cm)': user.height_cm,
                            'Height (ft/in)': heightDisplay,
                            'Weight (kg)': user.weight_kg,
                            'Height Ref ID': user.height_reference_id,
                            'Weight Ref ID': user.weight_reference_id
                        })}
                        ${renderSection('Lifestyle (IDs)', {
                            'Occupation ID': user.occupation_category_id,
                            'Smoking Pref ID': user.smoking_preference_id,
                            'Drinking Pref ID': user.drinking_preference_id,
                            'Exercise ID': user.exercise_habits_id,
                            'Living Situation ID': user.living_situation_id,
                            'Income ID': user.income_id
                        })}
                        ${renderSection('Lifestyle (Names)', {
                            'Occupation': user.occupation_name,
                            'Smoking Preference': user.smoking_preference_name,
                            'Drinking Preference': user.drinking_preference_name,
                            'Exercise Habits': user.exercise_habits_name,
                            'Income': user.income_name,
                            'Lifestyle': user.lifestyle_name,
                            'Living Situation': user.living_situation_name,
                            'Marital Status': user.marital_status_name
                        })}
                        ${renderSection('Interest Category', {
                            'Interest ID': user.interest_category_id,
                            'Interest Name': user.interest_category_name
                        })}
                        ${renderSection('Preferred Partner (IDs)', {
                            'Age Min': user.preferred_age_min,
                            'Age Max': user.preferred_age_max,
                            'Gender': user.preferred_gender,
                            'Distance': user.preferred_distance,
                            'Height': user.preferred_height,
                            'Height Ref ID': user.preferred_height_reference_id,
                            'Body Type': user.preferred_body_type,
                            'Education': user.preferred_education,
                            'Religion': user.preferred_religion,
                            'Smoking': user.preferred_smoking,
                            'Drinking': user.preferred_drinking,
                            'Children': user.preferred_children
                        })}
                        ${renderSection('Template Variables (Profile Edit - IDs)', {
                            'bodyTypeId': userData.bodyTypeId,
                            'eyeColorId': userData.eyeColorId,
                            'hairColorId': userData.hairColorId,
                            'ethnicityId': userData.ethnicityId,
                            'religionId': userData.religionId,
                            'educationId': userData.educationId,
                            'occupationId': userData.occupationId,
                            'smokingId': userData.smokingId,
                            'drinkingId': userData.drinkingId,
                            'exerciseId': userData.exerciseId,
                            'childrenId': userData.childrenId,
                            'interest_category_id': userData.interest_category_id
                        })}
                        ${renderSection('Template Variables (Profile Edit - Names)', {
                            'bodyTypeName': userData.bodyTypeName,
                            'eyeColorName': userData.eyeColorName,
                            'hairColorName': userData.hairColorName,
                            'ethnicityName': userData.ethnicityName,
                            'religionName': userData.religionName,
                            'educationName': userData.educationName,
                            'occupationName': userData.occupationName,
                            'smokingName': userData.smokingName,
                            'drinkingName': userData.drinkingName,
                            'exerciseName': userData.exerciseName,
                            'childrenName': userData.childrenName,
                            'interest_category': userData.interest_category,
                            'aboutMe': userData.aboutMe
                        })}
                        ${renderSection('Expected Hidden Input Values (After Template Replacement)', {
                            'current-body-type-id ({{bodyType}})': userData.bodyType || '(empty)',
                            'current-eye-color ({{eyeColorName}})': userData.eyeColorName || '(empty)',
                            'current-hair-color ({{hairColorName}})': userData.hairColorName || '(empty)',
                            'current-ethnicity ({{ethnicityName}})': userData.ethnicityName || '(empty)',
                            'current-religion ({{religionName}})': userData.religionName || '(empty)',
                            'current-education ({{educationName}})': userData.educationName || '(empty)',
                            'current-occupation ({{occupationName}})': userData.occupationName || '(empty)',
                            'current-smoking ({{smokingName}})': userData.smokingName || '(empty)',
                            'current-drinking ({{drinkingName}})': userData.drinkingName || '(empty)',
                            'current-exercise ({{exerciseName}})': userData.exerciseName || '(empty)',
                            'current-children ({{childrenName}})': userData.childrenName || '(empty)',
                            'current-interest-category-name ({{interest_category}})': userData.interest_category || '(empty)'
                        })}
                        ${renderSection('Template Variables (Preferences)', {
                            'preferredBodyTypeId': userData.preferredBodyTypeId,
                            'preferredEducationId': userData.preferredEducationId,
                            'preferredReligionId': userData.preferredReligionId,
                            'preferredSmokingId': userData.preferredSmokingId,
                            'preferredDrinkingId': userData.preferredDrinkingId,
                            'preferredChildrenId': userData.preferredChildrenId
                        })}
                        ${renderSection('Template Variables (Height/Weight)', {
                            'current_height_reference_id': userData.current_height_reference_id,
                            'current_height_cm': userData.current_height_cm,
                            'current_weight_reference_id': userData.current_weight_reference_id,
                            'current_weight_kg': userData.current_weight_kg,
                            'current_preferred_height_reference_id': userData.current_preferred_height_reference_id,
                            'current_preferred_height_cm': userData.current_preferred_height_cm
                        })}
                    </div>
                    <script>
                        console.log('Template Variables:', ${JSON.stringify(userData, null, 2)});
                        console.log('Raw User Data:', ${JSON.stringify(user, null, 2)});
                        
                        // Debug helper: Check what values should be in hidden inputs
                        console.log('\\n=== EXPECTED HIDDEN INPUT VALUES ===');
                        console.log('current-body-type-id should be:', '${userData.bodyType || ''}');
                        console.log('current-eye-color should be:', '${userData.eyeColorName || ''}');
                        console.log('current-hair-color should be:', '${userData.hairColorName || ''}');
                        console.log('current-ethnicity should be:', '${userData.ethnicityName || ''}');
                        console.log('current-religion should be:', '${userData.religionName || ''}');
                        console.log('current-education should be:', '${userData.educationName || ''}');
                        console.log('current-occupation should be:', '${userData.occupationName || ''}');
                        console.log('current-smoking should be:', '${userData.smokingName || ''}');
                        console.log('current-drinking should be:', '${userData.drinkingName || ''}');
                        console.log('current-exercise should be:', '${userData.exerciseName || ''}');
                        console.log('current-children should be:', '${userData.childrenName || ''}');
                        console.log('\\n=== TO DEBUG PROFILE-EDIT PAGE ===');
                        console.log('1. Open profile-edit page in browser');
                        console.log('2. Open browser console (F12)');
                        console.log('3. Run this code to check actual hidden input values:');
                        console.log('   Array.from(document.querySelectorAll("input[type=\\"hidden\\"][id^=\\"current-\\"]")).forEach(el => {');
                        console.log('       console.log(el.id + ":", JSON.stringify(el.value));');
                        console.log('   });');
                    </script>
                </body>
                </html>
            `;

            res.send(html);

        } catch (error) {
            console.error('[DEBUG] Error fetching user data:', error);
            console.error('[DEBUG] Error stack:', error.stack);
            console.error('[DEBUG] Error details:', {
                message: error.message,
                code: error.code,
                detail: error.detail,
                hint: error.hint
            });
            
            // Return detailed error in JSON format
            if (req.query.format === 'json') {
                return res.status(500).json({
                    success: false,
                    error: error.message,
                    code: error.code,
                    detail: error.detail,
                    hint: error.hint,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                });
            }
            
            // Return HTML error page
            res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Debug Error</title>
                    <style>
                        body { font-family: Arial; padding: 2rem; background: #f5f5f5; }
                        .error { background: white; padding: 2rem; border-radius: 8px; border-left: 4px solid #dc3545; }
                        h1 { color: #dc3545; }
                        pre { background: #f8f9fa; padding: 1rem; border-radius: 4px; overflow-x: auto; }
                    </style>
                </head>
                <body>
                    <div class="error">
                        <h1>❌ Debug Error</h1>
                        <p><strong>Error:</strong> ${error.message}</p>
                        ${error.code ? `<p><strong>Code:</strong> ${error.code}</p>` : ''}
                        ${error.detail ? `<p><strong>Detail:</strong> ${error.detail}</p>` : ''}
                        ${error.hint ? `<p><strong>Hint:</strong> ${error.hint}</p>` : ''}
                        <pre>${error.stack}</pre>
                        <p><a href="/debug/test">Test Route</a> | <a href="/">Home</a></p>
                    </div>
                </body>
                </html>
            `);
        }
    });

    // Check if a table exists
    router.get('/debug/check-table-exists', async (req, res) => {
        try {
            const tableName = req.query.tableName;
            if (!tableName) {
                return res.status(400).json({
                    success: false,
                    error: 'tableName parameter required'
                });
            }

            const result = await db.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                );
            `, [tableName]);

            res.json({
                success: true,
                tableName: tableName,
                exists: result.rows[0].exists
            });
        } catch (error) {
            console.error('Check table exists error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Check messages between two users
    router.get('/debug/check-messages', async (req, res) => {
        try {
            const userId1 = parseInt(req.query.userId1);
            const userId2 = parseInt(req.query.userId2);
            
            if (!userId1 || !userId2 || isNaN(userId1) || isNaN(userId2)) {
                return res.status(400).json({
                    success: false,
                    error: 'userId1 and userId2 parameters required'
                });
            }

            const result = await db.query(`
                SELECT 
                    id,
                    sender_id,
                    receiver_id,
                    message,
                    timestamp,
                    deleted_by_sender,
                    deleted_by_receiver,
                    recall_type,
                    message_type
                FROM user_messages
                WHERE ((sender_id = $1 AND receiver_id = $2)
                   OR (sender_id = $2 AND receiver_id = $1))
                ORDER BY timestamp DESC
                LIMIT 50
            `, [userId1, userId2]);

            res.json({
                success: true,
                userId1: userId1,
                userId2: userId2,
                messageCount: result.rows.length,
                messages: result.rows
            });
        } catch (error) {
            console.error('Check messages error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Check if a column exists in a table
    router.post('/debug/check-column-exists', async (req, res) => {
        try {
            const { table, column } = req.body;
            if (!table || !column) {
                return res.status(400).json({
                    success: false,
                    error: 'table and column parameters required'
                });
            }

            const result = await db.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                    AND column_name = $2
                );
            `, [table, column]);

            res.json({
                success: true,
                table: table,
                column: column,
                exists: result.rows[0].exists
            });
        } catch (error) {
            console.error('Check column exists error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Check receiver mapping state
    router.post('/debug/check-receiver-mapping', async (req, res) => {
        try {
            const { receiverId, deletedUserId } = req.body;
            if (!receiverId || !deletedUserId) {
                return res.status(400).json({
                    success: false,
                    error: 'receiverId and deletedUserId parameters required'
                });
            }

            const result = await db.query(`
                SELECT 
                    id,
                    receiver_id,
                    deleted_user_id,
                    created_at,
                    cleared_at
                FROM users_deleted_receivers
                WHERE receiver_id = $1 AND deleted_user_id = $2
            `, [receiverId, deletedUserId]);

            if (result.rows.length === 0) {
                return res.json({
                    success: true,
                    exists: false,
                    receiverId: receiverId,
                    deletedUserId: deletedUserId
                });
            }

            res.json({
                success: true,
                exists: true,
                id: result.rows[0].id,
                receiver_id: result.rows[0].receiver_id,
                deleted_user_id: result.rows[0].deleted_user_id,
                created_at: result.rows[0].created_at,
                cleared_at: result.rows[0].cleared_at
            });
        } catch (error) {
            console.error('Check receiver mapping error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Check if deleted user exists in users_deleted
    router.post('/debug/check-deleted-user', async (req, res) => {
        try {
            const { deletedUserId } = req.body;
            if (!deletedUserId) {
                return res.status(400).json({
                    success: false,
                    error: 'deletedUserId parameter required'
                });
            }

            const result = await db.query(`
                SELECT 
                    deleted_user_id,
                    real_name,
                    email,
                    created_at
                FROM users_deleted
                WHERE deleted_user_id = $1
            `, [deletedUserId]);

            if (result.rows.length === 0) {
                return res.json({
                    success: true,
                    exists: false,
                    deletedUserId: deletedUserId
                });
            }

            res.json({
                success: true,
                exists: true,
                deleted_user_id: result.rows[0].deleted_user_id,
                real_name: result.rows[0].real_name, // For backward compatibility
                real_name: result.rows[0].real_name,
                email: result.rows[0].email,
                created_at: result.rows[0].created_at
            });
        } catch (error) {
            console.error('Check deleted user error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Check if a deleted user has been cleared by a receiver
    router.get('/debug/check-cleared', async (req, res) => {
        try {
            const receiverId = parseInt(req.query.receiverId);
            const deletedUserId = parseInt(req.query.deletedUserId);
            
            if (!receiverId || !deletedUserId || isNaN(receiverId) || isNaN(deletedUserId)) {
                return res.status(400).json({
                    success: false,
                    error: 'receiverId and deletedUserId parameters required'
                });
            }

            // Check users_deleted_receivers table with cleared_at
            const result = await db.query(`
                SELECT 
                    id,
                    receiver_id,
                    deleted_user_id,
                    created_at,
                    cleared_at
                FROM users_deleted_receivers
                WHERE receiver_id = $1 AND deleted_user_id = $2
            `, [receiverId, deletedUserId]);

            if (result.rows.length === 0) {
                return res.json({
                    success: true,
                    exists: false,
                    cleared: false,
                    message: 'No mapping found'
                });
            }

            const row = result.rows[0];
            res.json({
                success: true,
                exists: true,
                cleared: row.cleared_at !== null,
                cleared_at: row.cleared_at,
                created_at: row.created_at
            });
        } catch (error) {
            console.error('Check cleared error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
};

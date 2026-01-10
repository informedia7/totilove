const TemplateUtils = require('../../utils/templateUtils');
const path = require('path');
const fs = require('fs');

class TemplateController {
    constructor(db) {
        this.db = db;
        this.templateUtils = new TemplateUtils();
    }

    async renderTemplate(req, res, templateName, userId = null, user = null, sessionToken = null) {
        try {
            // Get user data if userId is provided
            let userData = {};
            
            if (userId) {
                const userResult = await this.db.query(`
                    SELECT u.*, ua.*, up.*, c.name as city_name, s.name as state_name, co.name as country_name,
                           ui.file_name as profile_image
                    FROM users u
                    LEFT JOIN user_attributes ua ON u.id = ua.user_id
                    LEFT JOIN user_preferences up ON u.id = up.user_id
                    LEFT JOIN city c ON u.city_id = c.id
                    LEFT JOIN state s ON u.state_id = s.id
                    LEFT JOIN country co ON u.country_id = co.id
                    LEFT JOIN user_images ui ON u.id = ui.user_id AND ui.is_profile = 1
                    WHERE u.id = $1
                `, [userId]);

                if (userResult.rows.length > 0) {
                    const user = userResult.rows[0];
                    
                    // Fetch user interests (table may not exist yet)
                    let userInterests = 'Not specified';
                    try {
                        // Check if user_interest_categories table exists first
                        const tableCheck = await this.db.query(`
                            SELECT EXISTS (
                                SELECT FROM information_schema.tables 
                                WHERE table_schema = 'public' 
                                AND table_name = 'user_interest_categories'
                            );
                        `);
                        
                        if (tableCheck.rows[0].exists) {
                            const interestsResult = await this.db.query(`
                                SELECT i.name 
                                FROM user_interest_categories ui 
                                JOIN interests i ON ui.interest_id = i.id 
                                WHERE ui.user_id = $1 
                                ORDER BY ui.intensity_level_id DESC, i.name
                            `, [userId]);
                            
                            if (interestsResult.rows.length > 0) {
                                userInterests = interestsResult.rows.map(row => row.name).join(', ');
                            }
                        }
                    } catch (error) {
                        console.log('Could not fetch user interests:', error.message);
                    }

                    // Build user data object with all necessary fields
                    userData = {
                        userId: user.id,
                        real_name: user.real_name || '', // Use real_name, keep real_name for backward compatibility
                        userEmail: user.email,
                        userAge: user.birthdate ? this.templateUtils.calculateAge(user.birthdate) : 'Not specified',
                        userAgeNumber: user.birthdate ? this.templateUtils.calculateAge(user.birthdate) : '',
                        userGender: this.templateUtils.formatGenderIcon(user.gender) || 'Not specified',
                        userGenderRaw: user.gender || 'Not specified',
                        userLocation: user.city_name || user.state_name || user.country_name ? 
                            [user.city_name, user.state_name, user.country_name].filter(Boolean).join(', ') : 
                            'Location not specified',
                        countryId: user.country_id || '',
                        stateId: user.state_id || '',
                        cityId: user.city_id || '',
                        aboutMe: user.about_me || '',
                        userAvatar: user.profile_image ? `/uploads/profile_images/${user.profile_image}` : '/assets/images/default_profile.svg',
                        
                        // Physical attributes
                        height: user.height_cm ? `${user.height_cm} cm` : 'Not specified',
                        height_cm: user.height_cm || '',
                        height_m: user.height_cm ? (user.height_cm / 100).toFixed(2) : '',
                        height_ft: user.height_ft || '',
                        height_in: user.height_in || '',
                        bodyType: user.body_type || 'Not specified',
                        eyeColor: user.eye_color || 'Not specified',
                        hairColor: user.hair_color || 'Not specified',
                        ethnicity: user.ethnicity || 'Not specified',
                        religion: user.religion || 'Not specified',
                        education: user.education || 'Not specified',
                        occupation: user.occupation || 'Not specified',
                        smoking: user.smoking_preference || 'Not specified',
                        drinking: user.drinking_preference || 'Not specified',
                        exercise: user.exercise_habits || 'Not specified',
                        children: user.have_children || 'Not specified',
                        interests: userInterests,
                        
                        // Preferences
                        preferredAgeMin: user.preferred_age_min || 'Not specified',
                        preferredAgeMax: user.preferred_age_max || 'Not specified',
                        preferredGender: user.preferred_gender || 'Not specified',
                        preferredDistance: user.preferred_distance || 'Not specified',
                        preferredHeight: user.preferred_height || 'Not specified',
                        preferredBodyType: user.preferred_body_type || 'Not specified',
                        preferredEducation: user.preferred_education || 'Not specified',
                        preferredReligion: user.preferred_religion || 'Not specified',
                        preferredSmoking: user.preferred_smoking || 'Not specified',
                        preferredDrinking: user.preferred_drinking || 'Not specified',
                        preferredChildren: user.preferred_children || 'Not specified',
                        
                        memberSince: this.templateUtils.getRelativeTime(user.date_joined),
                        date_joined: this.templateUtils.getRelativeTime(user.date_joined),
                        lastActive: this.templateUtils.getRelativeTime(user.last_login || user.date_joined),
                        pageTitle: 'Profile',
                        currentPage: 'profile',
                        activeTab: req.query.tab || 'basic',
                        sessionToken: sessionToken
                    };
                }
            }

            // Read the template file
            const templatePath = path.join(__dirname, '../../app/pages', `${templateName}.html`);
            let pageContent = '';
            
            try {
                pageContent = fs.readFileSync(templatePath, 'utf8');
            } catch (error) {
                console.error(`Error reading template ${templateName}:`, error);
                return res.status(404).send('Template not found');
            }

            // Read the layout file
            const layoutPath = path.join(__dirname, '../../app/components/layouts/layout.html');
            let layoutContent = '';
            
            try {
                layoutContent = fs.readFileSync(layoutPath, 'utf8');
            } catch (error) {
                console.error('Error reading layout:', error);
                return res.status(500).send('Layout error');
            }

            // Process template includes
            pageContent = await this.templateUtils.processTemplateIncludes(pageContent, userData);
            
            // Process template variables
            pageContent = this.templateUtils.processTemplateVariables(pageContent, userData);
            
            // Insert page content into layout
            layoutContent = layoutContent.replace('{{content}}', pageContent);
            
            // Process template variables in layout
            const htmlContent = this.templateUtils.processTemplateVariables(layoutContent, userData);
            
            // Send the rendered HTML
            res.send(htmlContent);
        } catch (error) {
            console.error('Error rendering template:', error);
            res.status(500).send('Internal server error: ' + error.message);
        }
    }

    async renderTalkPage(req, res, userId = null, user = null, sessionToken = null) {
        try {
            const templatePath = path.join(__dirname, '../../app/pages/talk.html');
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            
            let userData = {};
            
            // Always fetch complete user data from database for template rendering
            if (userId) {
                const userResult = await this.db.query(`
                    SELECT u.*, ua.*, up.*, c.name as city_name, s.name as state_name, co.name as country_name,
                           ui.file_name as profile_image
                    FROM users u
                    LEFT JOIN user_attributes ua ON u.id = ua.user_id
                    LEFT JOIN user_preferences up ON u.id = up.user_id
                    LEFT JOIN city c ON u.city_id = c.id
                    LEFT JOIN state s ON u.state_id = s.id
                    LEFT JOIN country co ON u.country_id = co.id
                    LEFT JOIN user_images ui ON u.id = ui.user_id AND ui.is_profile = 1
                    WHERE u.id = $1
                `, [userId]);

                if (userResult.rows.length > 0) {
                    const dbUser = userResult.rows[0];
                    userData = {
                        userId: dbUser.id,
                        real_name: dbUser.real_name || '', // Use real_name, keep real_name for backward compatibility
                        userEmail: dbUser.email,
                        userAge: dbUser.birthdate ? this.templateUtils.calculateAge(dbUser.birthdate) : 'Not specified',
                        userAgeNumber: dbUser.birthdate ? this.templateUtils.calculateAge(dbUser.birthdate) : '',
                        userGender: this.templateUtils.formatGenderIcon(dbUser.gender) || 'Not specified',
                        userGenderRaw: dbUser.gender || 'Not specified',
                        userLocation: dbUser.city_name || dbUser.state_name || dbUser.country_name ? 
                            [dbUser.city_name, dbUser.state_name, dbUser.country_name].filter(Boolean).join(', ') : 
                            'Location not specified',
                        userAvatar: dbUser.profile_image ? `/uploads/profile_images/${dbUser.profile_image}` : '/assets/images/default_profile.svg',
                        memberSince: this.templateUtils.getRelativeTime(dbUser.date_joined),
                        lastActive: this.templateUtils.getRelativeTime(dbUser.last_login || dbUser.date_joined),
                        sessionToken: sessionToken
                    };
                } else {
                    console.log('No user found in database for userId:', userId);
                }
            }

            // Process template variables
            const renderedContent = this.templateUtils.processTemplateVariables(templateContent, userData);
            
            // Set cache-busting headers
            res.set({
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            
            res.send(renderedContent);
        } catch (error) {
            console.error('Error rendering talk page:', error);
            res.status(500).send('Internal server error: ' + error.message);
        }
    }
}

module.exports = TemplateController; 
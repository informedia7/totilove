const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = 3000;

console.log('Server file loaded at', new Date().toISOString());

// Database configuration
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'postgres',
    port: 5432,
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', '..'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// API Routes
app.get('/api/countries', async (req, res) => {
    console.log('GET /api/countries - Request received');
    try {
        const result = await pool.query(`
            SELECT id, name 
            FROM country 
            ORDER BY name
        `);
        
        const countries = result.rows.map(row => ({
            id: row.id,
            name: row.name
        }));
        console.log('Countries found:', countries.length);
        
        res.json({
            success: true,
            countries: countries
        });
    } catch (error) {
        console.error('Database error in /api/countries:', error);
        res.status(500).json({
            success: false,
            error: 'Database error: ' + error.message
        });
    }
});

app.get('/api/states', async (req, res) => {
    const { country_id } = req.query;
    console.log('GET /api/states - Request received for country_id:', country_id);
    
    if (!country_id) {
        return res.status(400).json({
            success: false,
            error: 'Country ID parameter is required'
        });
    }
    
    try {
        const result = await pool.query(`
            SELECT id, name 
            FROM state 
            WHERE country_id = $1 
            ORDER BY name
        `, [country_id]);
        
        const states = result.rows.map(row => ({
            id: row.id,
            name: row.name
        }));
        console.log('States found for country_id', country_id + ':', states.length);
        
        res.json({
            success: true,
            states: states
        });
    } catch (error) {
        console.error('Database error in /api/states:', error);
        res.status(500).json({
            success: false,
            error: 'Database error: ' + error.message
        });
    }
});

app.get('/api/cities', async (req, res) => {
    const { state_id } = req.query;
    console.log('GET /api/cities - Request received for state_id:', state_id);
    
    if (!state_id) {
        return res.status(400).json({
            success: false,
            error: 'State ID parameter is required'
        });
    }
    
    try {
        const result = await pool.query(`
            SELECT id, name 
            FROM city 
            WHERE state_id = $1 
            ORDER BY name
        `, [state_id]);
        
        const cities = result.rows.map(row => ({
            id: row.id,
            name: row.name
        }));
        console.log('Cities found for state_id', state_id + ':', cities.length);
        
        res.json({
            success: true,
            cities: cities
        });
    } catch (error) {
        console.error('Database error in /api/cities:', error);
        res.status(500).json({
            success: false,
            error: 'Database error: ' + error.message
        });
    }
});

app.get('/api/check-real_name', async (req, res) => {
    // Note: This endpoint is deprecated - real_name doesn't need uniqueness checking
    // Keeping for backward compatibility but always returns available
    res.json({
        success: true,
        available: true,
        message: 'Real names do not need to be unique'
    });
        
        res.json({
            success: true,
            available: result.rows.length === 0
        });
    } catch (error) {
        console.error('Database error checking real_name:', error);
        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

app.get('/api/check-email', async (req, res) => {
    const { email } = req.query;
    
    if (!email) {
        return res.status(400).json({
            success: false,
            error: 'Email parameter is required'
        });
    }
    
    try {
        const result = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        
        res.json({
            success: true,
            available: result.rows.length === 0
        });
    } catch (error) {
        console.error('Database error checking email:', error);
        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

app.get('/api/featured-profiles', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.real_name,
                EXTRACT(YEAR FROM AGE(u.birthdate)) as age,
                c.name as country,
                s.name as state,
                ct.name as city
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            LEFT JOIN state s ON u.state_id = s.id  
            LEFT JOIN city ct ON u.city_id = ct.id
            WHERE u.real_name IS NOT NULL 
            ORDER BY u.date_joined DESC 
            LIMIT 8
        `);
        
        res.json({
            success: true,
            profiles: result.rows
        });
    } catch (error) {
        console.error('Database error getting featured profiles:', error);
        res.status(500).json({
            success: false,
            error: 'Database error',
            profiles: []
        });
    }
});

// Get user profile by ID
app.get('/api/user/:id', async (req, res) => {
    const userId = req.params.id;
    
    try {
        const result = await pool.query(`
            SELECT 
                u.id,
                u.real_name,
                u.email,
                u.gender,
                u.birthdate,
                u.date_joined,
                u.last_login,
                c.name as country,
                s.name as state,
                ct.name as city
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            LEFT JOIN state s ON u.state_id = s.id  
            LEFT JOIN city ct ON u.city_id = ct.id
            WHERE u.id = $1
        `, [userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Database error getting user profile:', error);
        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required'
        });
    }
    
    try {
        const result = await pool.query(
            'SELECT id, real_name, email, password FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }
        
        const user = result.rows[0];
        
        // Check if password is hashed (bcrypt) or plain text
        let passwordMatch = false;
        if (user.password.startsWith('$2')) {
            // Hashed password
            passwordMatch = await bcrypt.compare(password, user.password);
        } else {
            // Plain text password (for legacy users)
            passwordMatch = password === user.password;
        }
        
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }
        
        // Update last login
        await pool.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );
        
        res.json({
            success: true,
            message: 'Login successful!',
            user: {
                id: user.id,
                real_name: user.real_name || '', // For backward compatibility
                real_name: user.real_name || '',
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed: ' + error.message
        });
    }
});

app.post('/register', async (req, res) => {
    console.log('Registration attempt:', req.body);
    
    const {
        real_name, email, password, birthdate, gender, country, state, city, 
        about_myself, interests, age_min, age_max, location_radius, preferred_gender
    } = req.body;

    // Enhanced validation with detailed logging
    const missingFields = [];
    if (!real_name) missingFields.push('real_name');
    if (!email) missingFields.push('email');
    if (!password) missingFields.push('password');
    if (!birthdate) missingFields.push('birthdate');
    if (!gender) missingFields.push('gender');
    if (!country) missingFields.push('country');
    if (!preferred_gender) missingFields.push('preferred_gender');
    
    if (missingFields.length > 0) {
        console.log('Missing required fields:', missingFields);
        return res.status(400).json({
            success: false,
            error: `Missing required fields: ${missingFields.join(', ')}`
        });
    }

    // Validate age
    const birthDate = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    if (age < 18) {
        console.log(`Age validation failed: User is ${age} years old`);
        return res.status(400).json({
            success: false,
            error: 'You must be at least 18 years old to register'
        });
    }

    try {
        // Note: real_name doesn't need uniqueness checking

        const emailCheck = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        
        if (emailCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Email already registered'
            });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const result = await pool.query(`
            INSERT INTO users (
                real_name, email, password, birthdate, gender, 
                country_id, state_id, city_id, date_joined
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, NOW()
            ) RETURNING id, real_name, email
        `, [
            real_name, email, hashedPassword, birthdate, gender, 
            country || null, state || null, city || null
        ]);

        res.json({
            success: true,
            message: 'Registration successful!',
            user: {
                id: result.rows[0].id,
                real_name: result.rows[0].real_name || '', // For backward compatibility
                real_name: result.rows[0].real_name || '',
                email: result.rows[0].email
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed: ' + error.message
        });
    }
});

// Get user's contact countries (for profile page)
app.get('/api/contact-countries/:userId', async (req, res) => {
    const userId = req.params.userId;
    
    try {
        const result = await pool.query(`
            SELECT uc.country_id, c.name as country_name
            FROM user_contact_countries uc
            JOIN country c ON uc.country_id = c.id
            WHERE uc.user_id = $1
            ORDER BY c.name
        `, [userId]);
        
        res.json({
            success: true,
            countries: result.rows
        });
    } catch (error) {
        console.error('Error getting contact countries:', error);
        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

// Update user profile settings (for profile page)
app.post('/api/profile-settings/:userId', async (req, res) => {
    const userId = req.params.userId;
    let { countries } = req.body;
    console.log(`Profile settings update for user ${userId}:`, req.body);

    // Accept countries as array, comma-separated string, or single value
    if (typeof countries === 'string') {
        // If comma-separated string, split and trim
        countries = countries.split(',').map(c => c.trim()).filter(Boolean);
    } else if (typeof countries === 'number') {
        countries = [countries];
    } else if (!Array.isArray(countries)) {
        countries = [];
    }
    // Convert all to numbers
    countries = countries.map(c => Number(c)).filter(c => !isNaN(c));
    console.log('Countries to save (parsed):', countries);

    try {
        // Start transaction
        await pool.query('BEGIN');
        console.log('Transaction started');

        // Always delete existing contact countries
        const deleteResult = await pool.query('DELETE FROM user_contact_countries WHERE user_id = $1', [userId]);
        console.log(`Deleted ${deleteResult.rowCount} existing contact countries for user ${userId}`);

        // Insert new contact countries if provided
        if (countries && countries.length > 0) {
            console.log(`Inserting ${countries.length} new contact countries`);
            for (const countryId of countries) {
                console.log(`Inserting country ID: ${countryId} for user: ${userId}`);
                await pool.query(
                    'INSERT INTO user_contact_countries (user_id, country_id) VALUES ($1, $2)',
                    [userId, countryId]
                );
            }
        } else {
            console.log('No countries provided or empty array');
        }

        // Commit transaction
        await pool.query('COMMIT');
        console.log('Transaction committed successfully');

        res.json({
            success: true,
            message: 'Profile settings updated successfully'
        });
    } catch (error) {
        // Rollback transaction on error
        await pool.query('ROLLBACK');
        console.error('Error updating profile settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile settings: ' + error.message
        });
    }
});

// Page Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'pages', 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'pages', 'login.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'pages', 'users', 'profile.html'));
});

app.get('/contact', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Contact - Totilove</title>
            <link rel="stylesheet" href="/assets/css/vendor/font-awesome.min.css">
            <link rel="stylesheet" href="/components/navbar.css">
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
                .container { max-width: 600px; margin: 100px auto; padding: 50px; background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1); }
                h1 { color: #6c5ce7; text-align: center; margin-bottom: 30px; }
                p { font-size: 1.2rem; margin: 20px 0; text-align: center; color: #333; }
                a { color: #6c5ce7; text-decoration: none; font-weight: bold; }
                a:hover { text-decoration: underline; }
                .contact-info { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div id="navbar-placeholder"></div>
            <script src="/components/global-navbar.js"></script>
            
            <div class="container">
                <h1>💌 Contact Us</h1>
                <p>We'd love to hear from you! Get in touch with the Totilove team.</p>
                
                <div class="contact-info">
                    <p><strong>📧 Email:</strong> hello@totilove.com</p>
                    <p><strong>📱 Phone:</strong> +1 (555) 123-4567</p>
                    <p><strong>🏢 Address:</strong> 123 Love Street, Romance City, RC 12345</p>
                </div>
                
                <p>Full contact form coming soon!</p>
                <p>For now, you can <a href="/register">join Totilove</a> or go back to the <a href="/">homepage</a>.</p>
            </div>
        </body>
        </html>
    `);
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    if (req.url.startsWith('/components/') || req.url.startsWith('/public/')) {
        res.status(404).send('File not found');
    } else {
        res.status(404).send(`
            <h1>404 - Page Not Found</h1>
            <p>The page you're looking for doesn't exist.</p>
            <p><a href="/">Go back to homepage</a></p>
        `);
    }
});

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Totilove server running at http://localhost:${PORT}`);
    
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
    }
});

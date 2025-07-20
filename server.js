const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const redis = require('redis');
const http = require('http');
const socketIo = require('socket.io');
const MessageService = require('./services/messageService');
const SessionService = require('./services/sessionService');
const SessionAPI = require('./session-api');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = 3000;

// Database configuration
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432,
    // Add connection pool settings for better reliability
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 10
});

// Redis configuration
const redisClient = redis.createClient({
    host: 'localhost',
    port: 6379,
    // password: 'your-redis-password' // if you have password
    retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            // Redis server is not running
            console.warn('⚠️ Redis server not available, falling back to database-only sessions');
            return undefined; // Stop retrying
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            // Stop retrying after 1 hour
            return new Error('Redis retry time exhausted');
        }
        if (options.attempt > 3) {
            // Stop retrying after 3 attempts
            return undefined;
        }
        // Retry after 2 seconds
        return Math.min(options.attempt * 100, 2000);
    }
});

// Initialize services
let messageService;
let sessionService;
let redisAvailable = false;

// Connect to Redis
redisClient.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
        console.warn('⚠️ Redis server not running - using database-only sessions and basic messaging');
        redisAvailable = false;
    } else {
        console.error('❌ Redis connection error:', err);
    }
});

redisClient.on('connect', () => {
    console.log('✅ Redis connected successfully');
    redisAvailable = true;
    messageService = new MessageService(pool, redisClient);
    sessionService = new SessionService(pool, redisClient);
});

redisClient.on('ready', () => {
    console.log('✅ Redis client ready');
});

// Try to connect Redis, but don't fail if it's not available
redisClient.connect().catch((err) => {
    console.warn('⚠️ Redis connection failed, continuing without Redis:', err.message);
    redisAvailable = false;
    // Initialize fallback services
    console.log('🔄 Initializing fallback services without Redis...');
    // Initialize database-only session service
    sessionService = new SessionService(pool, null);
    messageService = new MessageService(pool, null);
    console.log('✅ Database-only services initialized');
});

// Add timeout to ensure services are initialized even if Redis connect doesn't complete
setTimeout(() => {
    if (!sessionService) {
        console.log('🔄 Timeout reached, forcing database-only session service initialization...');
        sessionService = new SessionService(pool, null);
        console.log('✅ Database-only session service initialized (forced)');
    }
    if (!messageService) {
        console.log('🔄 Timeout reached, forcing database-only message service initialization...');
        messageService = new MessageService(pool, null);
        console.log('✅ Database-only message service initialized (forced)');
    }
}, 2000); // 2 second timeout

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging middleware
app.use((req, res, next) => {
    console.log(`📡 ${new Date().toISOString()} - ${req.method} ${req.url}`);
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

// Session activity middleware - automatically update session activity
app.use(async (req, res, next) => {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (sessionToken && sessionService) {
        try {
            await sessionService.updateActivity(sessionToken);
        } catch (error) {
            console.warn('Failed to update session activity:', error.message);
        }
    }
    
    next();
});

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Initialize Session API
const sessionAPI = new SessionAPI();
global.sessionAPI = sessionAPI; // Make it globally available
app.use(sessionAPI.getRouter());

// API Routes

// Get countries
app.get('/api/countries', async (req, res) => {
    console.log('GET /api/countries - Request received');
    try {
        const result = await pool.query(`
            SELECT id, name 
            FROM country 
            ORDER BY name
        `);
        
        console.log('Countries found:', result.rows.length);
        
        // Return with success wrapper for consistency
        res.json({
            success: true,
            countries: result.rows
        });
    } catch (error) {
        console.error('Database error in /api/countries:', error);
        res.status(500).json({
            success: false,
            error: 'Database error: ' + error.message
        });
    }
});

// Get states for a country
app.get('/api/states', async (req, res) => {
    const { country, country_id } = req.query;
    console.log('GET /api/states - Request received for:', { country, country_id });
    
    if (!country && !country_id) {
        return res.status(400).json({
            success: false,
            error: 'Country or country_id parameter is required'
        });
    }
    
    try {
        let result;
        
        if (country_id) {
            // For registration form - get states by country ID
            result = await pool.query(`
                SELECT id, name 
                FROM state 
                WHERE country_id = $1 
                ORDER BY name
            `, [country_id]);
            
            console.log('States found for country_id', country_id + ':', result.rows.length);
            
            res.json({
                success: true,
                states: result.rows
            });
        } else {
            // For profile page - get states by country name
            result = await pool.query(`
                SELECT DISTINCT state_name 
                FROM geographical_data 
                WHERE country_name = $1 
                AND state_name IS NOT NULL 
                AND state_name != ''
                ORDER BY state_name
            `, [country]);
            
            const states = result.rows.map(row => row.state_name);
            console.log('States found for', country + ':', states.length);
            
            res.json({
                success: true,
                states: states
            });
        }
    } catch (error) {
        console.error('Database error in /api/states:', error);
        res.status(500).json({
            success: false,
            error: 'Database error: ' + error.message
        });
    }
});

// Get cities for a state
app.get('/api/cities', async (req, res) => {
    const { country, state, state_id } = req.query;
    console.log('GET /api/cities - Request received for:', { country, state, state_id });
    
    if (!state_id && (!country || !state)) {
        return res.status(400).json({
            success: false,
            error: 'Either state_id or both country and state parameters are required'
        });
    }
    
    try {
        let result;
        
        if (state_id) {
            // For registration form - get cities by state ID
            result = await pool.query(`
                SELECT id, name 
                FROM city 
                WHERE state_id = $1 
                ORDER BY name
            `, [state_id]);
            
            console.log('Cities found for state_id', state_id + ':', result.rows.length);
            
            res.json({
                success: true,
                cities: result.rows
            });
        } else {
            // For profile page - get cities by country and state name
            result = await pool.query(`
                SELECT DISTINCT city_name 
                FROM geographical_data 
                WHERE country_name = $1 
                AND state_name = $2 
                AND city_name IS NOT NULL 
                AND city_name != ''
                ORDER BY city_name
            `, [country, state]);
            
            const cities = result.rows.map(row => row.city_name);
            console.log('Cities found for', state, '/', country + ':', cities.length);
            
            res.json({
                success: true,
                cities: cities
            });
        }
    } catch (error) {
        console.error('Database error in /api/cities:', error);
        res.status(500).json({
            success: false,
            error: 'Database error: ' + error.message
        });
    }
});

// Check username availability
app.get('/api/check-username', async (req, res) => {
    const { username } = req.query;
    
    if (!username) {
        return res.status(400).json({
            success: false,
            error: 'Username parameter is required'
        });
    }
    
    try {
        const result = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );
        
        res.json({
            success: true,
            available: result.rows.length === 0
        });
    } catch (error) {
        console.error('Database error checking username:', error);
        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

// Check email availability
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

// Get featured profiles for homepage
app.get('/api/featured-profiles', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, 
                   DATE_PART('year', AGE(u.birthdate)) AS age,
                   c.name as country, s.name as state, ct.name as city,
                   ui.file_name as profile_image
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            LEFT JOIN state s ON u.state_id = s.id
            LEFT JOIN city ct ON u.city_id = ct.id
            INNER JOIN user_images ui ON u.id = ui.user_id AND ui.is_profile = 1
            WHERE u.birthdate IS NOT NULL 
            ORDER BY u.date_joined DESC 
            LIMIT 8
        `);
        
        // Check for valid images and provide fallbacks
        const profilesWithValidImages = result.rows.map(profile => {
            const baseFilename = profile.profile_image;
            const uploadsPath = path.join(__dirname, 'public', 'uploads', 'profile_images');
            
            // Check different image formats in order of preference
            const imageOptions = [
                baseFilename, // Original JPG
                baseFilename.replace('.jpg', '_fallback.svg'), // Fallback SVG
                baseFilename.replace('.jpg', '.svg'), // Basic SVG
                baseFilename.replace('.jpg', '_enhanced.svg') // Enhanced SVG
            ];
            
            let validImage = null;
            for (const option of imageOptions) {
                const filePath = path.join(uploadsPath, option);
                try {
                    const stats = fs.statSync(filePath);
                    if (stats.size > 0) { // File exists and has content
                        validImage = option;
                        break;
                    }
                } catch (error) {
                    // File doesn't exist, continue to next option
                }
            }
            
            return {
                ...profile,
                profile_image: validImage || baseFilename // Use original as fallback
            };
        });
        
        res.json({
            success: true,
            profiles: profilesWithValidImages
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

// Admin API endpoints
app.get('/api/admin/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            success: true,
            status: 'healthy'
        });
    } catch (error) {
        res.json({
            success: false,
            status: 'error',
            message: error.message
        });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
        const activeUsers = await pool.query('SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL \'30 days\'');
        
        res.json({
            success: true,
            stats: {
                totalUsers: parseInt(totalUsers.rows[0].count),
                activeUsers: parseInt(activeUsers.rows[0].count),
                totalReports: 0, // Placeholder
                blockedUsers: 0  // Placeholder
            }
        });
    } catch (error) {
        console.error('Error getting admin stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get stats'
        });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, email, date_joined, last_login
            FROM users 
            ORDER BY date_joined DESC 
            LIMIT 50
        `);
        
        res.json({
            success: true,
            users: result.rows
        });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get users'
        });
    }
});

// Get user images
app.get('/api/user/:id/images', async (req, res) => {
    try {
        const userId = req.params.id;
        const result = await pool.query(`
            SELECT id, file_name, is_profile, uploaded_at 
            FROM user_images 
            WHERE user_id = $1 
            ORDER BY is_profile DESC, uploaded_at DESC
        `, [userId]);
        
        res.json({
            success: true,
            images: result.rows
        });
    } catch (error) {
        console.error('Error getting user images:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user images'
        });
    }
});

// Get user profile by ID
app.get('/api/user/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }

        // Get user basic info with location
        const userResult = await pool.query(`
            SELECT u.id, u.username, u.email, u.birthdate, u.gender, u.date_joined, u.last_login,
                   c.name as country, s.name as state, ct.name as city
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            LEFT JOIN state s ON u.state_id = s.id
            LEFT JOIN city ct ON u.city_id = ct.id
            WHERE u.id = $1
        `, [userId]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const user = userResult.rows[0];
        
        // Get profile settings if they exist
        const settingsResult = await pool.query(`
            SELECT * FROM user_profile_settings WHERE user_id = $1
        `, [userId]);
        
        if (settingsResult.rows.length > 0) {
            user.profile_settings = settingsResult.rows[0];
        }
        
        // Get contact countries
        const countriesResult = await pool.query(`
            SELECT ucc.*, c.name as country_name, c.iso2 as country_code
            FROM user_contact_countries ucc
            LEFT JOIN country c ON ucc.country_id = c.id
            WHERE ucc.user_id = $1
        `, [userId]);
        
        user.contact_countries = countriesResult.rows;
        
        res.json({
            success: true,
            user: user
        });
    } catch (error) {
        console.error('Database error getting user profile:', error);
        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

// Registration endpoint
app.post('/register', async (req, res) => {
    console.log('Registration attempt:', req.body);
    
    const {
        username, email, password, birthdate, gender, country, state, city, 
        about_myself, interests, age_min, age_max, location_radius, preferred_gender
    } = req.body;

    // Basic validation - only check for truly required fields
    if (!username || !email || !password || !birthdate || !gender || !country) {
        return res.status(400).json({
            success: false,
            error: 'All required fields must be filled (username, email, password, birthdate, gender, country)'
        });
    }

    try {
        // Check if username already exists
        const usernameCheck = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );
        
        if (usernameCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Username already exists'
            });
        }

        // Check if email already exists
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

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Calculate age from date of birth
        const birthDate = new Date(birthdate);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        // Insert new user
        const result = await pool.query(`
            INSERT INTO users (
                username, email, password, birthdate, gender, 
                country_id, state_id, city_id, date_joined
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, NOW()
            ) RETURNING id, username, email
        `, [
            username, email, hashedPassword, birthdate, gender,
            country && country !== '' ? parseInt(country) : null, 
            state && state !== '' ? parseInt(state) : null, 
            city && city !== '' ? parseInt(city) : null
        ]);

        console.log('User registered successfully:', result.rows[0]);

        // Generate session using Redis-powered session service
        let sessionToken = null;
        if (sessionService) {
            try {
                sessionToken = await sessionService.createSession(
                    result.rows[0].id,
                    req.ip || '127.0.0.1',
                    req.get('User-Agent') || 'Unknown'
                );
            } catch (sessionError) {
                console.error('Error creating session:', sessionError);
                // Continue without session - user can still log in manually
            }
        }

        res.json({
            success: true,
            message: 'Registration successful!',
            sessionToken: sessionToken,
            user: {
                id: result.rows[0].id,
                username: result.rows[0].username,
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

// Login endpoint
app.post('/login', async (req, res) => {
    console.log('Login attempt:', req.body);
    
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required'
        });
    }

    try {
        // Find user by email
        const result = await pool.query(
            'SELECT id, username, email, password FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        const user = result.rows[0];

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password);
        
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

        console.log('User logged in successfully:', { id: user.id, email: user.email });

        // Generate session using database-only SessionAPI
        let sessionToken = null;
        try {
            // Use the SessionAPI to create a proper session
            const sessionResult = await sessionAPI.createSession(
                user.id,
                req.ip || '127.0.0.1',
                req.get('User-Agent') || 'Unknown'
            );
            sessionToken = sessionResult.token;
            console.log('Session created successfully:', sessionToken);
        } catch (sessionError) {
            console.error('Error creating session:', sessionError);
            return res.status(500).json({
                success: false,
                error: 'Login successful but session creation failed: ' + sessionError.message
            });
        }

        res.json({
            success: true,
            message: 'Login successful!',
            sessionToken: sessionToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
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

// API Authentication Login endpoint
app.post('/api/auth/login', async (req, res) => {
    console.log('API Login attempt:', req.body);
    
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required'
        });
    }

    try {
        // Find user by email
        const result = await pool.query(
            'SELECT id, username, email, password FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        const user = result.rows[0];

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password);
        
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

        console.log('User logged in successfully via API:', { id: user.id, email: user.email });

        // Generate session using session service
        let sessionToken = null;
        if (sessionService) {
            try {
                sessionToken = await sessionService.createSession(
                    user.id,
                    req.ip || '127.0.0.1',
                    req.get('User-Agent') || 'Unknown'
                );
            } catch (sessionError) {
                console.error('Error creating session:', sessionError);
                return res.status(500).json({
                    success: false,
                    error: 'Login successful but session creation failed'
                });
            }
        } else {
            return res.status(500).json({
                success: false,
                error: 'Session service not available'
            });
        }

        res.json({
            success: true,
            message: 'Login successful!',
            token: sessionToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('API Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed: ' + error.message
        });
    }
});

// Get current user profile
app.get('/api/profile', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');
        
        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        if (!sessionService) {
            return res.status(500).json({
                success: false,
                error: 'Session service not available'
            });
        }

        const session = await sessionService.getSession(sessionToken);
        
        if (!session) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired session'
            });
        }

        // Get user profile
        const userResult = await pool.query(`
            SELECT u.id, u.username, u.email, u.birthdate, u.gender, u.date_joined, u.last_login,
                   c.name as country, s.name as state, ct.name as city
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            LEFT JOIN state s ON u.state_id = s.id
            LEFT JOIN city ct ON u.city_id = ct.id
            WHERE u.id = $1
        `, [session.userId]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const user = userResult.rows[0];

        res.json({
            success: true,
            id: user.id,
            username: user.username,
            email: user.email,
            birthdate: user.birthdate,
            gender: user.gender,
            dateJoined: user.date_joined,
            lastLogin: user.last_login,
            location: {
                country: user.country,
                state: user.state,
                city: user.city
            }
        });

    } catch (error) {
        console.error('Database error getting user profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user profile'
        });
    }
});

// Online Status Endpoints
// Store online users in memory (for production, use Redis or database)
const onlineUsers = new Map();

// Simple test endpoint
app.get('/api/test', (req, res) => {
    console.log('🧪 Test endpoint called');
    res.json({ success: true, message: 'Server is working!', timestamp: Date.now() });
});

// Heartbeat endpoint - updates user's online status
app.post('/api/heartbeat', async (req, res) => {
    try {
        const { userId, username, timestamp } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }

        // Update online status in memory (always works)
        onlineUsers.set(userId.toString(), {
            userId,
            username,
            lastSeen: timestamp || Date.now(),
            isOnline: true
        });

        // Try to update user_sessions table (structure may vary)
        try {
            // Generate a session token for online tracking
            const sessionToken = `online_${userId}_${Date.now()}`;
            
            // Try to insert/update - handle different possible column structures
            await pool.query(`
                INSERT INTO user_sessions (user_id, session_token, created_at, last_activity, is_active)
                VALUES ($1, $2, NOW(), NOW(), true)
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    last_activity = NOW(), 
                    is_active = true,
                    session_token = $2
            `, [userId, sessionToken]);
            
        } catch (dbError) {
            // If the above fails, try a simpler approach
            console.log('⚠️ Primary user_sessions update failed, trying alternative:', dbError.message);
            
            try {
                // Just try to update or insert with basic fields
                await pool.query(`
                    INSERT INTO user_sessions (user_id, session_token, created_at)
                    VALUES ($1, $2, NOW())
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        session_token = $2,
                        created_at = NOW()
                `, [userId, `online_${userId}_${Date.now()}`]);
                
            } catch (secondError) {
                console.log('⚠️ Alternative user_sessions update also failed:', secondError.message);
                // Continue anyway - memory tracking still works
            }
        }

        console.log(`💓 Heartbeat received from user ${username} (${userId})`);
        
        res.json({
            success: true,
            message: 'Heartbeat received'
        });

    } catch (error) {
        console.error('❌ Heartbeat error:', error);
        res.status(500).json({
            success: false,
            error: 'Heartbeat failed: ' + error.message
        });
    }
});

// Set user offline
app.post('/api/user-offline', async (req, res) => {
    try {
        const { userId, timestamp } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }

        // Update status in memory
        if (onlineUsers.has(userId.toString())) {
            const user = onlineUsers.get(userId.toString());
            user.isOnline = false;
            user.lastSeen = timestamp || Date.now();
            onlineUsers.set(userId.toString(), user);
        }

        // Update user_sessions table - only update last_activity, keep sessions active
        // Sessions should only be deactivated on explicit logout, not on page navigation
        await pool.query(`
            UPDATE user_sessions 
            SET last_activity = NOW()
            WHERE user_id = $1 AND is_active = true
        `, [userId]);

        console.log(`🔴 User ${userId} went offline`);
        
        res.json({
            success: true,
            message: 'User status updated to offline'
        });

    } catch (error) {
        console.error('Offline status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update offline status: ' + error.message
        });
    }
});

// Get online users
app.get('/api/online-users', async (req, res) => {
    try {
        console.log('📊 API /api/online-users called');
        
        // Clean up stale entries (users offline for more than 5 minutes)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        
        for (const [userId, userData] of onlineUsers.entries()) {
            if (userData.lastSeen < fiveMinutesAgo) {
                userData.isOnline = false;
                onlineUsers.set(userId, userData);
            }
        }

        // Get online users from memory
        const memoryOnlineUsers = Array.from(onlineUsers.values())
            .filter(user => user.isOnline && user.lastSeen > fiveMinutesAgo);

        console.log('💾 Memory online users found:', memoryOnlineUsers.length);

        // For now, let's just use memory-based tracking to ensure it works
        const response = {
            success: true,
            onlineUsers: memoryOnlineUsers,
            count: memoryOnlineUsers.length,
            timestamp: Date.now()
        };

        console.log('✅ Sending response:', JSON.stringify(response, null, 2));

        res.json(response);

    } catch (error) {
        console.error('❌ Get online users error:', error);
        const errorResponse = {
            success: false,
            error: 'Failed to get online users: ' + error.message,
            onlineUsers: [],
            count: 0
        };
        
        console.log('❌ Sending error response:', JSON.stringify(errorResponse, null, 2));
        res.status(500).json(errorResponse);
    }
});

// Get specific user status
app.get('/api/user-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const userData = onlineUsers.get(userId);
        
        if (userData) {
            // Check if user is actually online (within last 5 minutes)
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            const isOnline = userData.isOnline && userData.lastSeen > fiveMinutesAgo;
            
            res.json({
                success: true,
                isOnline,
                lastSeen: userData.lastSeen,
                username: userData.username
            });
        } else {
            // Check database
            const result = await pool.query(`
                SELECT u.username, us.is_active, us.last_activity
                FROM user_sessions us
                JOIN users u ON u.id = us.user_id
                WHERE us.user_id = $1
            `, [userId]);
            
            if (result.rows.length > 0) {
                const dbUser = result.rows[0];
                const lastSeen = new Date(dbUser.last_activity).getTime();
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                const isOnline = dbUser.is_active && lastSeen > fiveMinutesAgo;
                
                res.json({
                    success: true,
                    isOnline,
                    lastSeen,
                    username: dbUser.username
                });
            } else {
                res.json({
                    success: true,
                    isOnline: false,
                    lastSeen: null,
                    username: null
                });
            }
        }

    } catch (error) {
        console.error('Get user status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user status: ' + error.message
        });
    }
});

// Get user last seen
app.get('/api/user-lastseen/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const userData = onlineUsers.get(userId);
        
        if (userData) {
            res.json({
                success: true,
                lastSeen: userData.lastSeen
            });
        } else {
            const result = await pool.query(`
                SELECT last_activity FROM user_sessions WHERE user_id = $1
            `, [userId]);
            
            if (result.rows.length > 0) {
                res.json({
                    success: true,
                    lastSeen: new Date(result.rows[0].last_activity).getTime()
                });
            } else {
                res.json({
                    success: true,
                    lastSeen: null
                });
            }
        }

    } catch (error) {
        console.error('Get last seen error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get last seen: ' + error.message
        });
    }
});

// User Profile Settings API endpoints
app.get('/api/profile-settings/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(`
            SELECT * FROM user_profile_settings 
            WHERE user_id = $1
        `, [userId]);
        
        if (result.rows.length > 0) {
            res.json({
                success: true,
                settings: result.rows[0]
            });
        } else {
            // Return default settings if none exist
            res.json({
                success: true,
                settings: {
                    profile_visibility: 'public',
                    email_notifications: true,
                    show_online_status: true,
                    contact_age_min: 18,
                    contact_age_max: 65,
                    require_photos: false
                }
            });
        }
    } catch (error) {
        console.error('Error fetching profile settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch profile settings'
        });
    }
});

app.post('/api/profile-settings/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const {
            profileVisibility,
            emailNotifications,
            showOnlineStatus,
            contactPreferences
        } = req.body;
        
        console.log('=== PROFILE SETTINGS SAVE REQUEST ===');
        console.log('User ID:', userId);
        console.log('Full request body:', JSON.stringify(req.body, null, 2));
        console.log('Contact preferences:', contactPreferences);
        console.log('Allowed countries:', contactPreferences?.allowedCountries);
        console.log('=======================================');
        
        // Update or insert profile settings
        const result = await pool.query(`
            INSERT INTO user_profile_settings 
            (user_id, profile_visibility, email_notifications, show_online_status, 
             contact_age_min, contact_age_max, require_photos, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                profile_visibility = $2,
                email_notifications = $3,
                show_online_status = $4,
                contact_age_min = $5,
                contact_age_max = $6,
                require_photos = $7,
                updated_at = NOW()
            RETURNING *
        `, [
            userId,
            profileVisibility,
            emailNotifications,
            showOnlineStatus,
            contactPreferences?.ageRange?.min || 18,
            contactPreferences?.ageRange?.max || 65,
            contactPreferences?.requirePhotos || false
        ]);
        
        // Handle contact countries
        if (contactPreferences?.allowedCountries) {
            console.log('Processing contact countries:', contactPreferences.allowedCountries);
            console.log('User ID:', userId);
            
            // Validate country limit (max 10 countries, excluding "all")
            const specificCountries = contactPreferences.allowedCountries.filter(code => code !== 'all');
            
            if (specificCountries.length > 10) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum 10 countries allowed. Please select fewer countries.'
                });
            }
            
            try {
                // Clear existing country preferences
                console.log('Deleting existing contact countries for user:', userId);
                const deleteResult = await pool.query('DELETE FROM user_contact_countries WHERE user_id = $1', [userId]);
                console.log('Deleted rows:', deleteResult.rowCount);
                
                // Insert new country preferences
                for (const countryCode of contactPreferences.allowedCountries) {
                    console.log('Processing country code:', countryCode);
                    
                    if (countryCode === 'all') {
                        console.log('Inserting "All Countries" option');
                        const insertResult = await pool.query(`
                            INSERT INTO user_contact_countries (user_id, country_id, is_all_countries)
                            VALUES ($1, NULL, true)
                            RETURNING *
                        `, [userId]);
                        console.log('Inserted "All Countries":', insertResult.rows[0]);
                    } else {
                        // countryCode should now always be a country ID (numeric)
                        let countryId = parseInt(countryCode);
                        
                        if (isNaN(countryId)) {
                            console.warn(`Invalid country ID: ${countryCode} (not a number)`);
                            continue; // Skip this invalid entry
                        }
                        
                        // Check if country exists
                        console.log('Checking if country exists with ID:', countryId);
                        const countryResult = await pool.query(
                            'SELECT id, name FROM country WHERE id = $1',
                            [countryId]
                        );
                        
                        console.log('Country lookup result:', countryResult.rows);
                        
                        if (countryResult.rows.length > 0) {
                            console.log('Country found, inserting contact country:', countryResult.rows[0]);
                            const insertResult = await pool.query(`
                                INSERT INTO user_contact_countries (user_id, country_id, is_all_countries)
                                VALUES ($1, $2, false)
                                RETURNING *
                            `, [userId, countryId]);
                            console.log('Inserted contact country:', insertResult.rows[0]);
                        } else {
                            console.warn(`Country not found for ID: ${countryCode}`);
                        }
                    }
                }
                
                // Verify the final state
                const finalResult = await pool.query(
                    'SELECT * FROM user_contact_countries WHERE user_id = $1',
                    [userId]
                );
                console.log('Final contact countries for user:', finalResult.rows);
                
            } catch (contactCountryError) {
                console.error('Error handling contact countries:', contactCountryError);
                console.error('Error details:', {
                    message: contactCountryError.message,
                    stack: contactCountryError.stack,
                    code: contactCountryError.code
                });
                // Don't return error, just log it and continue
            }
        } else {
            console.log('No contact countries provided in request');
        }
        
        res.json({
            success: true,
            message: 'Profile settings saved successfully',
            settings: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error saving profile settings:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            error: 'Failed to save profile settings: ' + error.message
        });
    }
});

// Online Users API - Redis-powered
app.get('/api/online-users', async (req, res) => {
    try {
        console.log('📊 API /api/online-users called');
        
        if (sessionService) {
            // Use Redis-powered session service
            const onlineUsers = await sessionService.getOnlineUsers(50);
            
            console.log('✅ Online users from Redis sessions:', onlineUsers.length);
            
            res.json({
                success: true,
                onlineUsers: onlineUsers,
                count: onlineUsers.length,
                timestamp: Date.now(),
                source: 'redis-sessions'
            });
        } else {
            // Fallback to memory-based tracking
            console.log('⚠️ Session service not available, using memory fallback');
            
            // Clean up stale entries (users offline for more than 5 minutes)
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            
            for (const [userId, userData] of onlineUsers.entries()) {
                if (userData.lastSeen < fiveMinutesAgo) {
                    userData.isOnline = false;
                    onlineUsers.set(userId, userData);
                }
            }

            // Get online users from memory
            const memoryOnlineUsers = Array.from(onlineUsers.values())
                .filter(user => user.isOnline && user.lastSeen > fiveMinutesAgo);

            console.log('💾 Memory online users found:', memoryOnlineUsers.length);

            res.json({
                success: true,
                onlineUsers: memoryOnlineUsers,
                count: memoryOnlineUsers.length,
                timestamp: Date.now(),
                source: 'memory-fallback'
            });
        }

    } catch (error) {
        console.error('❌ Get online users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get online users: ' + error.message,
            onlineUsers: [],
            count: 0
        });
    }
});

// Matches API
app.get('/api/matches/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Get mutual likes for matches
        const result = await pool.query(`
            SELECT DISTINCT u.id, u.username, u.birthdate, u.gender, c.name as country
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            INNER JOIN likes l1 ON u.id = l1.liked_user_id
            INNER JOIN likes l2 ON u.id = l2.liked_by
            WHERE l1.liked_by = $1 
            AND l2.liked_user_id = $1
            AND u.id != $1
            ORDER BY u.username
        `, [userId]);
        
        res.json({
            success: true,
            matches: result.rows
        });
    } catch (error) {
        console.error('Error fetching matches:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch matches'
        });
    }
});

// Search API
app.get('/api/search', async (req, res) => {
    try {
        const { age_min = 18, age_max = 100, gender, location, radius } = req.query;
        
        let query = `
            SELECT u.id, u.username, u.birthdate, u.gender, 
                   c.name as country, s.name as state, ct.name as city,
                   ui.file_name as profile_image
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            LEFT JOIN state s ON u.state_id = s.id
            LEFT JOIN city ct ON u.city_id = ct.id
            LEFT JOIN user_images ui ON u.id = ui.user_id AND ui.is_profile = 1
            WHERE DATE_PART('year', AGE(u.birthdate)) BETWEEN $1 AND $2
        `;
        
        const params = [age_min, age_max];
        let paramCount = 2;
        
        if (gender && gender !== '') {
            paramCount++;
            query += ` AND u.gender = $${paramCount}`;
            params.push(gender);
        }
        
        if (location && location !== '') {
            paramCount++;
            query += ` AND (c.name ILIKE $${paramCount} OR s.name ILIKE $${paramCount} OR ct.name ILIKE $${paramCount})`;
            params.push(`%${location}%`);
        }
        
        query += ` ORDER BY u.username LIMIT 50`;
        
        const result = await pool.query(query, params);
        
        // Check for valid images and provide fallbacks (same logic as featured profiles)
        const resultsWithValidImages = result.rows.map(user => {
            const baseFilename = user.profile_image;
            if (!baseFilename) return user;
            
            const uploadsPath = path.join(__dirname, 'public', 'uploads', 'profile_images');
            
            // Check different image formats in order of preference
            const imageOptions = [
                baseFilename, // Original JPG
                baseFilename.replace('.jpg', '_fallback.svg'), // Fallback SVG
                baseFilename.replace('.jpg', '.svg'), // Basic SVG
                baseFilename.replace('.jpg', '_enhanced.svg') // Enhanced SVG
            ];
            
            let validImage = null;
            for (const option of imageOptions) {
                const filePath = path.join(uploadsPath, option);
                try {
                    const stats = fs.statSync(filePath);
                    if (stats.size > 0) { // File exists and has content
                        validImage = option;
                        break;
                    }
                } catch (error) {
                    // File doesn't exist, continue to next option
                }
            }
            
            return {
                ...user,
                profile_image: validImage || baseFilename // Use original as fallback
            };
        });
        
        res.json({
            success: true,
            results: resultsWithValidImages
        });
    } catch (error) {
        console.error('Error performing search:', error);
        res.status(500).json({
            success: false,
            error: 'Search failed'
        });
    }
});

// Authentication middleware for messaging
async function requireAuth(req, res, next) {
    console.log('🔐 RequireAuth called for:', req.method, req.path);
    console.log('🔐 Headers:', req.headers.authorization ? 'Present' : 'Missing');
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.body?.sessionToken;
        
        console.log('🔐 Session token extracted:', sessionToken ? 'Present' : 'Missing');
        
        if (!sessionToken) {
            console.log('❌ No session token found');
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Please log in first.'
            });
        }

        if (!sessionService) {
            console.log('❌ Session service not available');
            return res.status(500).json({
                success: false,
                error: 'Session service not available'
            });
        }

        const session = await sessionService.getSession(sessionToken);
        console.log('🔐 Session lookup result:', session ? 'Found' : 'Not found');
        
        if (!session) {
            console.log('❌ Invalid or expired session');
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired session. Please log in again.'
            });
        }

        console.log('✅ Authentication successful for user:', session.userId);
        // Add user info to request
        req.user = {
            id: session.userId,
            sessionToken: sessionToken
        };

        next();
    } catch (error) {
        console.error('❌ Authentication error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
}

// Messages API - Redis-powered
app.post('/api/messages/send', requireAuth, async (req, res) => {
    try {
        const { receiverId, content } = req.body;
        const senderId = req.user.id; // Get sender ID from authenticated user
        
        if (!receiverId || !content) {
            return res.status(400).json({
                success: false,
                error: 'Receiver ID and content are required'
            });
        }

        if (!messageService) {
            return res.status(500).json({
                success: false,
                error: 'Message service not ready'
            });
        }

        const result = await messageService.sendMessage(senderId, receiverId, content);
        
        // Broadcast message via WebSocket for real-time delivery
        if (result && result.message) {
            const messageData = {
                id: result.message.id,
                senderId: parseInt(senderId),
                receiverId: parseInt(receiverId),
                content: content,
                timestamp: result.message.timestamp,
                status: 'sent'
            };
            
            // Send to receiver if they're connected
            const receiverSocketId = connectedUsers.get(receiverId.toString());
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('message', messageData);
            }
            
            // Send confirmation to sender
            const senderSocketId = connectedUsers.get(senderId.toString());
            if (senderSocketId) {
                io.to(senderSocketId).emit('message', messageData);
            }
            
            console.log(`📨 Message broadcast: ${senderId} -> ${receiverId}`);
        }
        
        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send message'
        });
    }
});

// Get unread message count for notification badge (query parameter version)
app.get('/api/messages/count', requireAuth, async (req, res) => {
    try {
        const userId = req.query.user_id;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'user_id query parameter is required'
            });
        }
        
        // Count unread messages for this user
        const result = await pool.query(`
            SELECT COUNT(*) as unread_count
            FROM messages 
            WHERE receiver_id = $1 
            AND read_at IS NULL
            AND (deleted_by_receiver IS NULL OR deleted_by_receiver = false)
        `, [userId]);
        
        res.json({
            success: true,
            unread_count: parseInt(result.rows[0].unread_count)
        });
    } catch (error) {
        console.error('Error getting unread message count:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get unread message count',
            unread_count: 0
        });
    }
});

// Get unread message count for notification badge
app.get('/api/messages/count/:userId', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Count unread messages for this user
        const result = await pool.query(`
            SELECT COUNT(*) as unread_count
            FROM messages 
            WHERE receiver_id = $1 
            AND read_at IS NULL
            AND (deleted_by_receiver IS NULL OR deleted_by_receiver = false)
        `, [userId]);
        
        res.json({
            success: true,
            count: parseInt(result.rows[0].unread_count)
        });
    } catch (error) {
        console.error('Error getting unread message count:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get unread message count',
            count: 0
        });
    }
});

app.get('/api/messages/:userId/:otherUserId', requireAuth, async (req, res) => {
    console.log('🚀 MESSAGES API CALLED - User:', req.params.userId, 'Other:', req.params.otherUserId);
    try {
        const { userId, otherUserId } = req.params;
        const { before, limit = 50 } = req.query;
        
        console.log('🔧 Messages API - Before:', before, 'Limit:', limit);

        if (!messageService) {
            console.log('❌ Message service not ready');
            return res.status(500).json({
                success: false,
                error: 'Message service not ready'
            });
        }

        let messages;
        
        if (before) {
            console.log('📚 Getting older messages from database');
            // Get older messages from database
            messages = await messageService.getOlderMessages(
                parseInt(userId), 
                parseInt(otherUserId), 
                parseInt(before), 
                parseInt(limit)
            );
        } else {
            console.log('🔥 Getting recent messages from Redis');
            // Get recent messages from Redis
            messages = await messageService.getRecentMessages(
                parseInt(userId), 
                parseInt(otherUserId), 
                parseInt(limit)
            );
        }
        
        console.log('🔍 Messages API Debug - Found', messages.length, 'messages');
        console.log('🔍 First 2 messages:', JSON.stringify(messages.slice(0, 2), null, 2));
        
        res.json({
            success: true,
            messages: messages
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch messages'
        });
    }
});

// Get conversations list endpoint
app.get('/api/conversations', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log('💬 Conversations API called for user:', userId);
        
        // Simplified query to get conversations with last messages and unread counts
        const result = await pool.query(`
            WITH user_conversations AS (
                SELECT DISTINCT
                    CASE 
                        WHEN sender_id = $1 THEN receiver_id 
                        ELSE sender_id 
                    END as other_user_id
                FROM messages 
                WHERE sender_id = $1 OR receiver_id = $1
            ),
            conversation_data AS (
                SELECT 
                    uc.other_user_id as id,
                    u.username,
                    (
                        SELECT message 
                        FROM messages m 
                        WHERE (m.sender_id = $1 AND m.receiver_id = uc.other_user_id) 
                           OR (m.sender_id = uc.other_user_id AND m.receiver_id = $1)
                        ORDER BY m.timestamp DESC 
                        LIMIT 1
                    ) as lastMessage,
                    (
                        SELECT EXTRACT(EPOCH FROM timestamp) * 1000 
                        FROM messages m 
                        WHERE (m.sender_id = $1 AND m.receiver_id = uc.other_user_id) 
                           OR (m.sender_id = uc.other_user_id AND m.receiver_id = $1)
                        ORDER BY m.timestamp DESC 
                        LIMIT 1
                    ) as lastMessageTime,
                    (
                        SELECT COUNT(*) 
                        FROM messages m 
                        WHERE m.sender_id = uc.other_user_id 
                        AND m.receiver_id = $1
                        AND m.read_at IS NULL
                        AND (m.deleted_by_receiver IS NULL OR m.deleted_by_receiver = false)
                    ) as unreadCount,
                    false as isOnline
                FROM user_conversations uc
                JOIN users u ON u.id = uc.other_user_id
            )
            SELECT * FROM conversation_data
            WHERE lastMessage IS NOT NULL
            ORDER BY lastMessageTime DESC
        `, [userId]);
        
        console.log('💬 Conversations API - Found', result.rows.length, 'conversations for user', userId);
        console.log('💬 Sample conversation:', JSON.stringify(result.rows[0], null, 2));
        
        res.json({
            success: true,
            conversations: result.rows
        });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch conversations'
        });
    }
});

// Get user info endpoint
app.get('/api/users/:userId', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(`
            SELECT 
                u.id, 
                u.username, 
                u.email,
                CASE 
                    WHEN us.user_id IS NOT NULL AND us.expires_at > NOW() THEN true 
                    ELSE false 
                END as is_online
            FROM users u
            LEFT JOIN user_sessions us ON u.id = us.user_id AND us.expires_at > NOW()
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
        console.error('Error fetching user info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user info'
        });
    }
});

app.get('/api/conversations/:userId', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;

        if (!messageService) {
            return res.status(500).json({
                success: false,
                error: 'Message service not ready'
            });
        }

        const conversations = await messageService.getConversations(parseInt(userId));
        
        // Debug logging to see what we're returning
        console.log('🔍 Conversations API Debug:');
        console.log('User ID:', userId);
        console.log('Conversations found:', conversations.length);
        conversations.forEach((conv, index) => {
            console.log(`Conversation ${index}:`, {
                partnerId: conv.partnerId,
                partnerName: conv.partnerName,
                lastMessage: conv.lastMessage,
                timestamp: conv.timestamp,
                timestampType: typeof conv.timestamp,
                timestampDate: new Date(conv.timestamp),
                unreadCount: conv.unreadCount
            });
        });
        
        // If no conversations found, create a default one with proper user info
        if (conversations.length === 0) {
            // Get available users for a default conversation
            const usersResult = await pool.query(
                'SELECT id, username FROM users WHERE id != $1 LIMIT 5',
                [userId]
            );
            
            const defaultConversations = usersResult.rows.map(user => ({
                partnerId: user.id,
                partnerName: user.username,
                lastMessage: 'Start your conversation',
                timestamp: Date.now(),
                unreadCount: 0
            }));
            
            return res.json({
                success: true,
                conversations: defaultConversations
            });
        }
        
        res.json({
            success: true,
            conversations: conversations
        });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch conversations'
        });
    }
});

app.post('/api/messages/read', requireAuth, async (req, res) => {
    try {
        const { userId, otherUserId } = req.body;

        if (!messageService) {
            return res.status(500).json({
                success: false,
                error: 'Message service not ready'
            });
        }

        await messageService.markAsRead(parseInt(userId), parseInt(otherUserId));
        
        res.json({
            success: true,
            message: 'Messages marked as read'
        });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark messages as read'
        });
    }
});

app.post('/api/messages/typing', requireAuth, async (req, res) => {
    try {
        const { userId, chatWithUserId, isTyping } = req.body;

        if (!messageService) {
            return res.status(500).json({
                success: false,
                error: 'Message service not ready'
            });
        }

        await messageService.setTyping(
            parseInt(userId), 
            parseInt(chatWithUserId), 
            isTyping
        );
        
        res.json({
            success: true,
            message: 'Typing status updated'
        });
    } catch (error) {
        console.error('Error updating typing status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update typing status'
        });
    }
});

// Delete single message
app.delete('/api/messages/:messageId', requireAuth, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { deleteType } = req.body; // 'for_me' or 'for_everyone'
        const userId = req.user.id;
        
        // First, check if the message exists and get sender/receiver info
        const messageCheck = await pool.query(`
            SELECT sender_id, receiver_id 
            FROM messages 
            WHERE id = $1
        `, [messageId]);
        
        if (messageCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }
        
        const message = messageCheck.rows[0];
        
        if (deleteType === 'for_everyone') {
            // Only sender can delete for everyone (within time limit if needed)
            if (message.sender_id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: 'You can only delete your own messages for everyone'
                });
            }
            
            // Delete the message completely
            await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);
            
        } else { // 'for_me'
            // Mark as deleted for the current user
            if (message.sender_id === userId) {
                await pool.query(`
                    UPDATE messages 
                    SET deleted_by_sender = TRUE, deleted_at = NOW() 
                    WHERE id = $1
                `, [messageId]);
            } else if (message.receiver_id === userId) {
                await pool.query(`
                    UPDATE messages 
                    SET deleted_by_receiver = TRUE, deleted_at = NOW() 
                    WHERE id = $1
                `, [messageId]);
            } else {
                return res.status(403).json({
                    success: false,
                    error: 'You can only delete messages you sent or received'
                });
            }
        }
        
        res.json({
            success: true,
            message: 'Message deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete message'
        });
    }
});

// Delete multiple messages
app.delete('/api/messages/bulk', requireAuth, async (req, res) => {
    try {
        const { messageIds, deleteType } = req.body; // Array of message IDs
        const userId = req.user.id;
        
        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid message IDs'
            });
        }
        
        if (deleteType === 'for_everyone') {
            // Only delete messages sent by the current user
            const deleteResult = await pool.query(`
                DELETE FROM messages 
                WHERE id = ANY($1) AND sender_id = $2
            `, [messageIds, userId]);
            
            res.json({
                success: true,
                message: `${deleteResult.rowCount} messages deleted for everyone`
            });
            
        } else { // 'for_me'
            // Mark messages as deleted for the current user
            const senderUpdate = await pool.query(`
                UPDATE messages 
                SET deleted_by_sender = TRUE, deleted_at = NOW() 
                WHERE id = ANY($1) AND sender_id = $2
            `, [messageIds, userId]);
            
            const receiverUpdate = await pool.query(`
                UPDATE messages 
                SET deleted_by_receiver = TRUE, deleted_at = NOW() 
                WHERE id = ANY($1) AND receiver_id = $2
            `, [messageIds, userId]);
            
            const totalUpdated = senderUpdate.rowCount + receiverUpdate.rowCount;
            
            res.json({
                success: true,
                message: `${totalUpdated} messages deleted for you`
            });
        }
        
    } catch (error) {
        console.error('Error deleting messages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete messages'
        });
    }
});

// Bulk delete messages from specific users
app.delete('/api/messages/bulk-users', requireAuth, async (req, res) => {
    try {
        const { userIds, deleteType } = req.body; // Array of user IDs
        const currentUserId = req.user.id;
        
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user IDs'
            });
        }
        
        if (deleteType === 'for_everyone') {
            // Only delete messages sent by the current user to these users
            const deleteResult = await pool.query(`
                DELETE FROM messages 
                WHERE sender_id = $1 AND receiver_id = ANY($2)
            `, [currentUserId, userIds]);
            
            res.json({
                success: true,
                message: `Deleted ${deleteResult.rowCount} messages for everyone`
            });
            
        } else { // 'for_me'
            // Mark all messages between current user and selected users as deleted for current user
            const senderUpdate = await pool.query(`
                UPDATE messages 
                SET deleted_by_sender = TRUE, deleted_at = NOW() 
                WHERE sender_id = $1 AND receiver_id = ANY($2)
            `, [currentUserId, userIds]);
            
            const receiverUpdate = await pool.query(`
                UPDATE messages 
                SET deleted_by_receiver = TRUE, deleted_at = NOW() 
                WHERE receiver_id = $1 AND sender_id = ANY($2)
            `, [currentUserId, userIds]);
            
            const totalUpdated = senderUpdate.rowCount + receiverUpdate.rowCount;
            
            res.json({
                success: true,
                message: `Deleted ${totalUpdated} messages for you`
            });
        }
        
    } catch (error) {
        console.error('Error deleting messages from users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete messages'
        });
    }
});

// Bulk delete messages from specific users
app.delete('/api/messages/bulk-users', requireAuth, async (req, res) => {
    try {
        const { userIds, deleteType } = req.body;
        const currentUserId = req.user.id;
        
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user IDs'
            });
        }
        
        if (deleteType === 'delete_all') {
            // Permanently delete all messages between current user and selected users
            const deleteResult = await pool.query(`
                DELETE FROM messages 
                WHERE (sender_id = $1 AND receiver_id = ANY($2))
                   OR (sender_id = ANY($2) AND receiver_id = $1)
            `, [currentUserId, userIds]);
            
            res.json({
                success: true,
                message: `${deleteResult.rowCount} messages permanently deleted`,
                deletedCount: deleteResult.rowCount
            });
            
        } else {
            // For future extension - could add other delete types
            res.status(400).json({
                success: false,
                error: 'Unsupported delete type'
            });
        }
        
    } catch (error) {
        console.error('Error deleting messages from users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete messages'
        });
    }
});

// Mark messages as read
app.post('/api/messages/mark-read', requireAuth, async (req, res) => {
    try {
        const { otherUserId } = req.body;
        const currentUserId = req.user.id;
        
        // Update messages to mark as read
        const result = await pool.query(`
            UPDATE messages 
            SET read_at = NOW() 
            WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL
        `, [otherUserId, currentUserId]);
        
        res.json({
            success: true,
            markedCount: result.rowCount
        });
        
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark messages as read'
        });
    }
});

// Activity API
app.get('/api/activity/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(`
            SELECT a.*, u.username as target_username
            FROM user_activity a
            LEFT JOIN users u ON a.target_user_id = u.id
            WHERE a.user_id = $1
            ORDER BY a.created_at DESC
            LIMIT 50
        `, [userId]);
        
        res.json({
            success: true,
            activities: result.rows.map(activity => ({
                ...activity,
                type: activity.activity_type,
                description: activity.description || `${activity.activity_type} activity`
            }))
        });
    } catch (error) {
        console.error('Error fetching activity:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch activity'
        });
    }
});

// Enhanced User Matching API
app.get('/api/matches/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { ageMin = 18, ageMax = 65, gender, location, radius = 50, limit = 20 } = req.query;
        
        let query = `
            SELECT DISTINCT u.id, u.username, u.gender,
                   DATE_PART('year', AGE(u.birthdate)) AS age,
                   c.name as country, s.name as state, ct.name as city,
                   ui.file_name as profile_image,
                   (CASE WHEN os.user_id IS NOT NULL THEN true ELSE false END) as is_online,
                   ups.profile_visibility,
                   (SELECT COUNT(*) FROM likes WHERE liked_user_id = u.id) as like_count
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            LEFT JOIN state s ON u.state_id = s.id
            LEFT JOIN city ct ON u.city_id = ct.id
            LEFT JOIN user_images ui ON u.id = ui.user_id AND ui.is_profile = 1
            LEFT JOIN user_profile_settings ups ON u.id = ups.user_id
            LEFT JOIN (
                SELECT DISTINCT user_id FROM user_sessions 
                WHERE last_activity > NOW() - INTERVAL '10 minutes' AND is_active = true
            ) os ON u.id = os.user_id
            WHERE u.id != $1
            AND u.birthdate IS NOT NULL
            AND DATE_PART('year', AGE(u.birthdate)) BETWEEN $2 AND $3
            AND (ups.profile_visibility IS NULL OR ups.profile_visibility = 'public')
        `;
        
        const params = [userId, ageMin, ageMax];
        let paramCount = 3;
        
        if (gender && gender !== 'all') {
            paramCount++;
            query += ` AND u.gender = $${paramCount}`;
            params.push(gender);
        }
        
        if (location && location !== '') {
            paramCount++;
            query += ` AND (c.name ILIKE $${paramCount} OR s.name ILIKE $${paramCount} OR ct.name ILIKE $${paramCount})`;
            params.push(`%${location}%`);
        }
        
        // Exclude users already liked/passed
        query += `
            AND u.id NOT IN (
                SELECT liked_user_id FROM likes WHERE liked_by = $1
                UNION
                SELECT passed_user_id FROM user_passes WHERE passed_by = $1
            )
        `;
        
        query += ` ORDER BY is_online DESC, like_count DESC, RANDOM() LIMIT $${paramCount + 1}`;
        params.push(parseInt(limit));
        
        const result = await pool.query(query, params);
        
        // Calculate compatibility scores and add enhanced data
        const matches = result.rows.map(user => {
            const baseScore = 70; // Base compatibility
            let score = baseScore;
            
            // Boost score for online users
            if (user.is_online) score += 10;
            
            // Boost score for users with photos
            if (user.profile_image) score += 5;
            
            // Add some randomness to make it interesting
            score += Math.floor(Math.random() * 15);
            
            // Ensure score doesn't exceed 99
            score = Math.min(score, 99);
            
            return {
                ...user,
                age: parseInt(user.age),
                compatibility_score: score,
                distance: Math.floor(Math.random() * parseInt(radius)) + 1, // Mock distance
                mutual_friends: Math.floor(Math.random() * 5), // Mock mutual friends
                last_active: user.is_online ? 'Online now' : 'Recently active'
            };
        });
        
        res.json({
            success: true,
            matches: matches,
            total: matches.length
        });
    } catch (error) {
        console.error('Error finding matches:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to find matches'
        });
    }
});

// Like/Pass Actions
app.post('/api/like', async (req, res) => {
    try {
        const { userId, likedUserId } = req.body;
        
        if (!userId || !likedUserId) {
            return res.status(400).json({
                success: false,
                error: 'User ID and liked user ID are required'
            });
        }
        
        // Check if already liked
        const existingLike = await pool.query(
            'SELECT id FROM likes WHERE liked_by = $1 AND liked_user_id = $2',
            [userId, likedUserId]
        );
        
        if (existingLike.rows.length > 0) {
            return res.json({
                success: true,
                message: 'Already liked',
                isMatch: false
            });
        }
        
        // Insert like
        await pool.query(
            'INSERT INTO likes (liked_by, liked_user_id, created_at) VALUES ($1, $2, NOW())',
            [userId, likedUserId]
        );
        
        // Check for mutual like (match)
        const mutualLike = await pool.query(
            'SELECT id FROM likes WHERE liked_by = $1 AND liked_user_id = $2',
            [likedUserId, userId]
        );
        
        const isMatch = mutualLike.rows.length > 0;
        
        // If it's a match, create match record
        if (isMatch) {
            try {
                await pool.query(`
                    INSERT INTO matches (user1_id, user2_id, created_at) 
                    VALUES ($1, $2, NOW())
                    ON CONFLICT (user1_id, user2_id) DO NOTHING
                `, [Math.min(userId, likedUserId), Math.max(userId, likedUserId)]);
            } catch (matchError) {
                console.log('Match table might not exist, continuing without it');
            }
        }
        
        res.json({
            success: true,
            message: isMatch ? 'It\'s a match!' : 'Like sent',
            isMatch: isMatch
        });
    } catch (error) {
        console.error('Error processing like:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process like'
        });
    }
});

app.post('/api/pass', async (req, res) => {
    try {
        const { userId, passedUserId } = req.body;
        
        if (!userId || !passedUserId) {
            return res.status(400).json({
                success: false,
                error: 'User ID and passed user ID are required'
            });
        }
        
        // Check if already passed
        const existingPass = await pool.query(
            'SELECT id FROM user_passes WHERE passed_by = $1 AND passed_user_id = $2',
            [userId, passedUserId]
        );
        
        if (existingPass.rows.length === 0) {
            // Insert pass record
            try {
                await pool.query(`
                    INSERT INTO user_passes (passed_by, passed_user_id, created_at) 
                    VALUES ($1, $2, NOW())
                `, [userId, passedUserId]);
            } catch (passError) {
                console.log('User_passes table might not exist, continuing without it');
            }
        }
        
        res.json({
            success: true,
            message: 'User passed'
        });
    } catch (error) {
        console.error('Error processing pass:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process pass'
        });
    }
});

// Get user's matches (mutual likes)
app.get('/api/user-matches/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(`
            SELECT DISTINCT u.id, u.username, u.gender,
                   DATE_PART('year', AGE(u.birthdate)) AS age,
                   c.name as country, s.name as state, ct.name as city,
                   ui.file_name as profile_image,
                   (CASE WHEN os.user_id IS NOT NULL THEN true ELSE false END) as is_online,
                   m.created_at as matched_at
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            LEFT JOIN state s ON u.state_id = s.id
            LEFT JOIN city ct ON u.city_id = ct.id
            LEFT JOIN user_images ui ON u.id = ui.user_id AND ui.is_profile = 1
            LEFT JOIN (
                SELECT DISTINCT user_id FROM user_sessions 
                WHERE last_activity > NOW() - INTERVAL '10 minutes' AND is_active = true
            ) os ON u.id = os.user_id
            INNER JOIN likes l1 ON u.id = l1.liked_user_id
            INNER JOIN likes l2 ON u.id = l2.liked_by
            LEFT JOIN matches m ON ((m.user1_id = $1 AND m.user2_id = u.id) OR (m.user1_id = u.id AND m.user2_id = $1))
            WHERE l1.liked_by = $1 
            AND l2.liked_user_id = $1
            AND u.id != $1
            ORDER BY m.created_at DESC, u.username
        `, [userId]);
        
        res.json({
            success: true,
            matches: result.rows.map(match => ({
                ...match,
                age: parseInt(match.age)
            }))
        });
    } catch (error) {
        console.error('Error fetching user matches:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch matches'
        });
    }
});

// Contact Countries API
app.get('/api/contact-countries/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Validate userId is a valid integer string first
        if (!userId || !/^\d+$/.test(userId)) {
            console.log(`Invalid user ID format provided: ${userId}`);
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID provided'
            });
        }
        
        const parsedUserId = parseInt(userId);
        if (parsedUserId <= 0) {
            console.log(`Invalid user ID value: ${parsedUserId}`);
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID provided'
            });
        }
        
        const result = await pool.query(`
            SELECT ucc.*, c.name as country_name, c.iso2 as country_code
            FROM user_contact_countries ucc
            LEFT JOIN country c ON ucc.country_id = c.id
            WHERE ucc.user_id = $1
        `, [parsedUserId]);
        
        res.json({
            success: true,
            countries: result.rows
        });
    } catch (error) {
        console.error('Error fetching contact countries:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch contact countries: ' + error.message
        });
    }
});

// User Session Management - Redis-powered
app.post('/api/session', async (req, res) => {
    try {
        const { userId, ipAddress, userAgent } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }

        if (!sessionService) {
            return res.status(500).json({
                success: false,
                error: 'Session service not available'
            });
        }

        const sessionToken = await sessionService.createSession(
            userId,
            ipAddress || req.ip || '127.0.0.1',
            userAgent || req.get('User-Agent') || 'Unknown'
        );
        
        res.json({
            success: true,
            message: 'Session created',
            sessionToken: sessionToken
        });
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create session'
        });
    }
});

// Logout endpoint - destroy session
app.post('/api/logout', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.body.sessionToken;
        
        if (!sessionToken) {
            return res.status(400).json({
                success: false,
                error: 'Session token is required'
            });
        }

        if (!sessionService) {
            return res.status(500).json({
                success: false,
                error: 'Session service not available'
            });
        }

        await sessionService.destroySession(sessionToken);
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to logout'
        });
    }
});

// Logout from all devices
app.post('/api/logout-all', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');
        
        if (!sessionToken || !sessionService) {
            return res.status(400).json({
                success: false,
                error: 'Session token required and session service must be available'
            });
        }

        // Get user ID from current session
        const session = await sessionService.getSession(sessionToken);
        if (!session) {
            return res.status(401).json({
                success: false,
                error: 'Invalid session'
            });
        }

        await sessionService.destroyUserSessions(session.userId);
        
        res.json({
            success: true,
            message: 'Logged out from all devices'
        });
    } catch (error) {
        console.error('Error logging out from all devices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to logout from all devices'
        });
    }
});

// Get user sessions
app.get('/api/user-sessions', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');
        
        if (!sessionToken || !sessionService) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Get user ID from current session
        const session = await sessionService.getSession(sessionToken);
        if (!session) {
            return res.status(401).json({
                success: false,
                error: 'Invalid session'
            });
        }

        const sessions = await sessionService.getUserSessions(session.userId);
        
        res.json({
            success: true,
            sessions: sessions
        });
    } catch (error) {
        console.error('Error getting user sessions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sessions'
        });
    }
});

// Validate current user session
app.get('/api/current-user', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');
        
        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                authenticated: false,
                error: 'No session token provided'
            });
        }

        if (!sessionService) {
            return res.status(500).json({
                success: false,
                authenticated: false,
                error: 'Session service not available'
            });
        }

        // Validate session using Redis-powered session service
        const session = await sessionService.getSession(sessionToken);

        if (!session || !session.isActive) {
            return res.status(401).json({
                success: false,
                authenticated: false,
                error: 'Invalid or expired session'
            });
        }

        // Get fresh user data
        const userResult = await pool.query(
            'SELECT id, username, email, first_name, last_name FROM users WHERE id = $1',
            [session.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                authenticated: false,
                error: 'User not found'
            });
        }

        const user = userResult.rows[0];

        res.json({
            success: true,
            authenticated: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });

    } catch (error) {
        console.error('Error validating session:', error);
        res.status(500).json({
            success: false,
            authenticated: false,
            error: 'Session validation failed'
        });
    }
});

// Page Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'login.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'users', 'profile.html'));
});

app.get('/profile-simple.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'users', 'profile-simple.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

app.get('/contact', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Contact - Totilove</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
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
            <script src="/components/navbar.js"></script>
            
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
    console.log('404 - File not found:', req.url);
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
server.listen(PORT, async () => {
    console.log(`🚀 Totilove server running at http://localhost:${PORT}`);
    console.log(`📡 WebSocket server ready for real-time features`);
    
    // Test database connection
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
    }
    
    // Setup session cleanup job (run every hour)
    if (sessionService) {
        setInterval(async () => {
            try {
                const cleaned = await sessionService.cleanupExpiredSessions();
                if (cleaned > 0) {
                    console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
                }
            } catch (error) {
                console.error('❌ Session cleanup error:', error);
            }
        }, 60 * 60 * 1000); // 1 hour
        
        console.log('✅ Session cleanup job scheduled');
    }
});

// WebSocket connection handling
const connectedUsers = new Map(); // userId -> socket.id mapping

io.on('connection', (socket) => {
    console.log(`🔌 New WebSocket connection: ${socket.id}`);
    
    // User authentication for socket
    socket.on('authenticate', (data) => {
        const { userId, username } = data;
        if (userId && username) {
            socket.userId = userId;
            socket.username = username;
            connectedUsers.set(userId.toString(), socket.id);
            
            console.log(`✅ User authenticated: ${username} (${userId})`);
            
            // Join user to their personal room
            socket.join(`user_${userId}`);
            
            // Broadcast user online status
            socket.broadcast.emit('user_online', { userId, username });
            
            // Send current online users to the newly connected user
            const onlineUsers = Array.from(connectedUsers.keys()).map(id => ({
                userId: id,
                socketId: connectedUsers.get(id)
            }));
            socket.emit('online_users_update', onlineUsers);
        }
    });
    
    // Handle private messages
    socket.on('send_message', async (data) => {
        try {
            const { receiverId, content } = data;
            const senderId = socket.userId;
            
            if (!senderId || !receiverId || !content) {
                socket.emit('error', { message: 'Invalid message data' });
                return;
            }
            
            // Save message using MessageService
            if (messageService) {
                const result = await messageService.sendMessage(senderId, receiverId, content);
                
                // Send to receiver if they're online
                const receiverSocketId = connectedUsers.get(receiverId.toString());
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('new_message', {
                        id: result.message.id,
                        senderId: senderId,
                        senderUsername: socket.username,
                        content: content,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Confirm to sender
                socket.emit('message_sent', {
                    id: result.message.id,
                    receiverId: receiverId,
                    content: content,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });
    
    // Handle typing indicators
    socket.on('typing_start', (data) => {
        const { receiverId } = data;
        const receiverSocketId = connectedUsers.get(receiverId.toString());
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_typing', {
                userId: socket.userId,
                username: socket.username,
                isTyping: true
            });
        }
    });
    
    socket.on('typing_stop', (data) => {
        const { receiverId } = data;
        const receiverSocketId = connectedUsers.get(receiverId.toString());
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_typing', {
                userId: socket.userId,
                username: socket.username,
                isTyping: false
            });
        }
    });
    
    // Handle user matching requests
    socket.on('find_matches', async (data) => {
        try {
            const userId = socket.userId;
            if (!userId) return;
            
            // Get user preferences (simplified for demo)
            const matches = await findUserMatches(userId, data.preferences || {});
            socket.emit('matches_found', matches);
        } catch (error) {
            console.error('Error finding matches:', error);
            socket.emit('error', { message: 'Failed to find matches' });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${socket.id}`);
        
        if (socket.userId) {
            connectedUsers.delete(socket.userId.toString());
            
            // Broadcast user offline status
            socket.broadcast.emit('user_offline', {
                userId: socket.userId,
                username: socket.username
            });
        }
    });
});

// User matching function
async function findUserMatches(userId, preferences = {}) {
    try {
        const {
            ageMin = 18,
            ageMax = 65,
            gender = null,
            location = null,
            radius = 50
        } = preferences;
        
        let query = `
            SELECT DISTINCT u.id, u.username, u.gender,
                   DATE_PART('year', AGE(u.birthdate)) AS age,
                   c.name as country, s.name as state, ct.name as city,
                   ui.file_name as profile_image,
                   (CASE WHEN os.user_id IS NOT NULL THEN true ELSE false END) as is_online
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            LEFT JOIN state s ON u.state_id = s.id
            LEFT JOIN city ct ON u.city_id = ct.id
            LEFT JOIN user_images ui ON u.id = ui.user_id AND ui.is_profile = 1
            LEFT JOIN (
                SELECT DISTINCT user_id FROM user_sessions 
                WHERE last_activity > NOW() - INTERVAL '10 minutes' AND is_active = true
            ) os ON u.id = os.user_id
            WHERE u.id != $1
            AND u.birthdate IS NOT NULL
            AND DATE_PART('year', AGE(u.birthdate)) BETWEEN $2 AND $3
        `;
        
        const params = [userId, ageMin, ageMax];
        let paramCount = 3;
        
        if (gender && gender !== 'all') {
            paramCount++;
            query += ` AND u.gender = $${paramCount}`;
            params.push(gender);
        }
        
        // Exclude users already liked/passed
        query += `
            AND u.id NOT IN (
                SELECT liked_user_id FROM likes WHERE liked_by = $1
                UNION
                SELECT passed_user_id FROM user_passes WHERE passed_by = $1
            )
        `;
        
        query += ` ORDER BY is_online DESC, RANDOM() LIMIT 20`;
        
        const result = await pool.query(query, params);
        
        return result.rows.map(user => ({
            ...user,
            age: parseInt(user.age),
            compatibility_score: Math.floor(Math.random() * 30) + 70 // Mock compatibility
        }));
    } catch (error) {
        console.error('Error finding matches:', error);
        return [];
    }
}

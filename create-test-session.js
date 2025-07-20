// Test session creation for profile page
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432,
});

async function createTestSession() {
    try {
        console.log('🔧 Creating test session for profile testing...');
        
        // Check if test user exists
        const userResult = await pool.query('SELECT id, username, email FROM users WHERE email = $1', ['ezy4@hotmail.com']);
        
        if (userResult.rows.length === 0) {
            console.error('❌ Test user not found');
            return;
        }
        
        const user = userResult.rows[0];
        console.log('👤 Found test user:', user);
        
        // Generate a session token
        const sessionToken = require('crypto').randomBytes(32).toString('hex');
        console.log('🔑 Generated session token:', sessionToken.substring(0, 8) + '...');
        
        // Create session in database with proper expires_at
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
        await pool.query(`
            DELETE FROM user_sessions WHERE user_id = $1
        `, [user.id]);
        
        await pool.query(`
            INSERT INTO user_sessions (user_id, session_token, last_activity, is_active, ip_address, user_agent, expires_at)
            VALUES ($1, $2, NOW(), true, $3, $4, $5)
        `, [user.id, sessionToken, '127.0.0.1', 'Test Browser', expiresAt]);
        
        console.log('✅ Session created successfully');
        console.log('\n📋 To test the profile page:');
        console.log('1. Open browser developer tools');
        console.log('2. Go to Application/Storage > Local Storage > http://localhost:3000');
        console.log(`3. Add key "sessionToken" with value: ${sessionToken}`);
        console.log(`4. Add key "currentUser" with value: ${JSON.stringify(user)}`);
        console.log('5. Navigate to http://localhost:3000/profile');
        console.log('\nOr use document.cookie in browser console:');
        console.log(`document.cookie = "sessionToken=${sessionToken}; path=/"`);
        
    } catch (error) {
        console.error('❌ Error creating test session:', error);
    } finally {
        await pool.end();
    }
}

createTestSession();

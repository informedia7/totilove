const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'totilove',
  password: 'Fikayo123',
  port: 5432,
});

async function createToken() {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const userId = 20;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    console.log('🔄 Creating new session token...');
    
    // Delete old sessions for this user
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    
    // Create new session
    await pool.query(
      'INSERT INTO user_sessions (session_token, user_id, last_activity, is_active, created_at) VALUES ($1, $2, NOW(), true, NOW())',
      [token, userId]
    );
    
    console.log('✅ Session created successfully');
    console.log('Token:', token);
    console.log('User ID:', userId);
    console.log('Expires:', expiresAt.toISOString());
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

createToken();

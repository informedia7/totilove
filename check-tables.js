const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'totilove',
  password: 'Fikayo123',
  port: 5432,
});

async function listTables() {
  try {
    console.log('🔍 Checking database tables...');
    
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log('📋 Available tables:');
    result.rows.forEach(row => {
      console.log('  -', row.table_name);
    });
    
    // Check if user_sessions exists instead
    const sessionCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%session%';
    `);
    
    console.log('🔍 Session-related tables:');
    sessionCheck.rows.forEach(row => {
      console.log('  -', row.table_name);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

listTables();

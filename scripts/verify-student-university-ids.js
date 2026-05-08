const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'totilove1',
  user: process.env.PGUSER || process.env.DB_USER || 'postgres',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'password'
});

async function run() {
  try {
    const occupationResult = await pool.query(`
      SELECT id, name
      FROM user_occupation_categories
      WHERE LOWER(name) = 'student'
      ORDER BY id
    `);

    const educationResult = await pool.query(`
      SELECT id, name
      FROM user_education_levels
      WHERE LOWER(name) IN ('university', 'postgraduate')
      ORDER BY id
    `);

    console.log(JSON.stringify({
      occupations: occupationResult.rows,
      educations: educationResult.rows
    }, null, 2));
  } catch (error) {
    console.error('VERIFY_ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();

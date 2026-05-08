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
    const query = `
      SELECT COUNT(*)::int AS invalid_count
      FROM user_attributes ua
      LEFT JOIN user_income_ranges uir ON uir.id = ua.income_id
      WHERE ua.income_id IS NULL OR uir.id IS NULL
    `;

    const result = await pool.query(query);
    console.log('INVALID_INCOME_LINKS:', result.rows[0].invalid_count);
  } catch (error) {
    console.error('VERIFY_ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();

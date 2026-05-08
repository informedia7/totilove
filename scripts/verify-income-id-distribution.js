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
      SELECT income_id, COUNT(*)::int AS count
      FROM user_attributes
      GROUP BY income_id
      ORDER BY income_id
    `;

    const result = await pool.query(query);
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (error) {
    console.error('VERIFY_ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();

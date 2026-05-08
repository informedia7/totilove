const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const sqlPath = path.join(
  __dirname,
  '..',
  'database',
  'migrations',
  'update_income_by_student_and_education.sql'
);
const sql = fs.readFileSync(sqlPath, 'utf8');

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'totilove1',
  user: process.env.PGUSER || process.env.DB_USER || 'postgres',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'password'
});

async function run() {
  try {
    await pool.query(sql);
    console.log('MIGRATION_OK: update_income_by_student_and_education.sql applied');
  } catch (error) {
    console.error('MIGRATION_ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'totilove1',
  user: process.env.PGUSER || process.env.DB_USER || 'postgres',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'password'
});

const targets = [
  'user_activity',
  'user_attributes',
  'user_hobbies_multiple',
  'user_images',
  'user_interests_multiple',
  'user_matches',
  'user_messages',
  'user_preferences',
  'users_favorites',
  'users_likes'
];

async function run() {
  try {
    const result = await pool.query(`
      SELECT
        src.relname AS source_table,
        con.conname AS fk_name,
        CASE con.confdeltype
          WHEN 'a' THEN 'NO ACTION'
          WHEN 'r' THEN 'RESTRICT'
          WHEN 'c' THEN 'CASCADE'
          WHEN 'n' THEN 'SET NULL'
          WHEN 'd' THEN 'SET DEFAULT'
        END AS on_delete_action
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
      WHERE con.contype = 'f'
        AND src_ns.nspname = 'public'
        AND tgt_ns.nspname = 'public'
        AND tgt.relname = 'users'
        AND src.relname = ANY($1::text[])
      ORDER BY source_table, fk_name
    `, [targets]);

    console.log('=== POST-MIGRATION FK ACTIONS ===');
    result.rows.forEach((r) => {
      console.log(`${r.source_table} | ${r.fk_name} | ON DELETE ${r.on_delete_action}`);
    });

    const nonCascade = result.rows.filter((r) => r.on_delete_action !== 'CASCADE');
    console.log('\n=== NON-CASCADE IN TARGET SET ===');
    if (nonCascade.length === 0) {
      console.log('NONE');
    } else {
      nonCascade.forEach((r) => {
        console.log(`${r.source_table} | ${r.fk_name} | ON DELETE ${r.on_delete_action}`);
      });
    }
  } catch (error) {
    console.error('VERIFY_ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();

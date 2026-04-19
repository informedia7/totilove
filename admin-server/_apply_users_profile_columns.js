require('dotenv').config();
const { query } = require('./config/database');

(async () => {
    try {
        await query('BEGIN');

        await query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS about_me TEXT,
            ADD COLUMN IF NOT EXISTS partner_preferences TEXT
        `);

        await query(`
            UPDATE users u
            SET about_me = ua.about_me
            FROM user_attributes ua
            WHERE ua.user_id = u.id
              AND ua.about_me IS NOT NULL
              AND ua.about_me <> ''
              AND (u.about_me IS NULL OR u.about_me = '')
        `);

        await query(`
            UPDATE users u
            SET partner_preferences = ua.partner_preferences
            FROM user_attributes ua
            WHERE ua.user_id = u.id
              AND ua.partner_preferences IS NOT NULL
              AND ua.partner_preferences <> ''
              AND (u.partner_preferences IS NULL OR u.partner_preferences = '')
        `);

        await query('COMMIT');
        console.log('Applied users profile columns + backfill.');
    } catch (e) {
        await query('ROLLBACK');
        console.error('FAILED:', e.message);
        process.exitCode = 1;
    }
    process.exit(0);
})();

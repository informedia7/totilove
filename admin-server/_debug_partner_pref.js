require('dotenv').config();
const { query } = require('./config/database');

(async () => {
    try {
        const uaCols = await query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='user_attributes' ORDER BY ordinal_position");
        const upCols = await query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='user_preferences' ORDER BY ordinal_position");

        console.log('user_attributes columns:', uaCols.rows.map(r => r.column_name).join(', '));
        console.log('user_preferences columns:', upCols.rows.map(r => r.column_name).join(', '));

        const sample = await query(`
            SELECT
                u.id,
                u.real_name,
                ua.about_me,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='user_attributes' AND column_name='partner_preferences'
                    ) THEN ua.partner_preferences
                    ELSE NULL
                END AS ua_partner_preferences,
                up.preferred_gender,
                up.age_min,
                up.age_max
            FROM users u
            LEFT JOIN user_attributes ua ON ua.user_id = u.id
            LEFT JOIN user_preferences up ON up.user_id = u.id
            ORDER BY u.id DESC
            LIMIT 20
        `);

        console.log('Sample rows with about_me / partner sources:');
        for (const row of sample.rows) {
            console.log(JSON.stringify(row));
        }
    } catch (e) {
        console.error('ERROR:', e.message);
        if (e.detail) console.error('DETAIL:', e.detail);
    }
    process.exit(0);
})();

require('dotenv').config();
const { query } = require('./config/database');

(async () => {
    try {
        const cols = await query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' ORDER BY ordinal_position"
        );
        console.log('users columns:', cols.rows.map(r => r.column_name).join(', '));

        const missing = ['about_me', 'partner_preferences'].filter(
            c => !cols.rows.some(r => r.column_name === c)
        );
        if (missing.length) {
            console.log('MISSING COLUMNS:', missing.join(', '));
        } else {
            console.log('OK: both profile columns present');
        }

        // Try the exact query the service runs
        const test = await query(
            'SELECT u.id, u.real_name, u.about_me, u.partner_preferences FROM users u ORDER BY u.id DESC LIMIT 1'
        );
        console.log('Test query OK, sample row:', JSON.stringify(test.rows[0]));
    } catch (e) {
        console.error('ERROR:', e.message);
        if (e.detail) console.error('DETAIL:', e.detail);
        if (e.hint)   console.error('HINT:',   e.hint);
    }
    process.exit(0);
})();

require('dotenv').config();
const userService = require('./services/userManagementService');

(async () => {
    try {
        const result = await userService.getUsers({ page: 1, limit: 1 });
        console.log('OK getUsers:', {
            count: result.users.length,
            sample: result.users[0]
                ? {
                    id: result.users[0].id,
                    about_me: result.users[0].about_me,
                    partner_preferences: result.users[0].partner_preferences
                }
                : null
        });
    } catch (e) {
        console.error('FAILED getUsers:', e.message);
        if (e.detail) console.error('DETAIL:', e.detail);
        process.exitCode = 1;
    }
    process.exit(0);
})();

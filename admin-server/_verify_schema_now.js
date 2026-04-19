require('dotenv').config();
const { query } = require('./config/database');

(async () => {
  try {
    const dbInfo = await query(
      `SELECT current_database() AS db, current_user AS db_user`
    );

    const userAttrCols = await query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'user_attributes'
         AND column_name IN ('height_cm', 'weight_kg', 'height_display', 'height_feet', 'height_inches', 'weight_display', 'weight_lbs')
       ORDER BY column_name`
    );

    const usersCols = await query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'users'
         AND column_name IN ('height_cm', 'weight_kg', 'height_display', 'height_feet', 'height_inches', 'weight_display', 'weight_lbs')
       ORDER BY column_name`
    );

    console.log('DB INFO:', JSON.stringify(dbInfo.rows[0], null, 2));
    console.log('user_attributes matching columns:', JSON.stringify(userAttrCols.rows, null, 2));
    console.log('users matching columns:', JSON.stringify(usersCols.rows, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  }
})();

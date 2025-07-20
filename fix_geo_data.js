const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost', 
    database: 'totilove',
    password: 'postgres',
    port: 5432,
});

async function updateMissingGeoData() {
    try {
        console.log('🔧 Geographic Data Fix Utility');
        console.log('================================\n');
        
        // Check current status
        const missingGeoResult = await pool.query(`
            SELECT COUNT(*) as count 
            FROM users 
            WHERE country_id IS NULL
        `);
        
        console.log(`📊 Users with missing geographic data: ${missingGeoResult.rows[0].count}`);
        
        if (missingGeoResult.rows[0].count > 0) {
            console.log('\n🔧 Fix Options:');
            console.log('1. Set all users without geo data to "Not Specified" (recommended)');
            console.log('2. Set all users to a default country (e.g., United States)');
            console.log('3. Leave as is - they can update their profile later');
            console.log('\nFor this demo, I\'ll set them to "Not Specified"...\n');
            
            // Option 1: Set to "Not Specified" - we'll need to find or create a "Not Specified" country
            // Let's check if we have a "Not Specified" or similar country
            const notSpecifiedCountry = await pool.query(`
                SELECT id FROM country 
                WHERE LOWER(name) LIKE '%not specified%' OR LOWER(name) LIKE '%unknown%'
                LIMIT 1
            `);
            
            let countryId = null;
            if (notSpecifiedCountry.rows.length > 0) {
                countryId = notSpecifiedCountry.rows[0].id;
                console.log(`✅ Found "Not Specified" country with ID: ${countryId}`);
            } else {
                // Use a common default country like United States
                const defaultCountry = await pool.query(`
                    SELECT id FROM country 
                    WHERE LOWER(name) = 'united states' OR LOWER(name) = 'usa'
                    LIMIT 1
                `);
                
                if (defaultCountry.rows.length > 0) {
                    countryId = defaultCountry.rows[0].id;
                    console.log(`✅ Using default country (United States) with ID: ${countryId}`);
                } else {
                    // Just use the first country in the database
                    const firstCountry = await pool.query(`SELECT id, name FROM country ORDER BY id LIMIT 1`);
                    if (firstCountry.rows.length > 0) {
                        countryId = firstCountry.rows[0].id;
                        console.log(`✅ Using first available country (${firstCountry.rows[0].name}) with ID: ${countryId}`);
                    }
                }
            }
            
            if (countryId) {
                console.log('\n🔄 Updating users with missing geographic data...');
                
                const updateResult = await pool.query(`
                    UPDATE users 
                    SET country_id = $1 
                    WHERE country_id IS NULL
                    RETURNING id, username
                `, [countryId]);
                
                console.log(`✅ Updated ${updateResult.rows.length} users:`);
                updateResult.rows.forEach(user => {
                    console.log(`   - User ${user.id}: ${user.username}`);
                });
            } else {
                console.log('❌ No suitable country found for default assignment');
            }
        } else {
            console.log('✅ All users already have geographic data assigned!');
        }
        
        // Final status check
        console.log('\n📈 Final Status:');
        const finalResult = await pool.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(country_id) as users_with_country,
                COUNT(*) - COUNT(country_id) as users_missing_country
            FROM users
        `);
        
        const stats = finalResult.rows[0];
        console.log(`   Total Users: ${stats.total_users}`);
        console.log(`   Users with Country: ${stats.users_with_country}`);
        console.log(`   Users missing Country: ${stats.users_missing_country}`);
        
        if (stats.users_missing_country == 0) {
            console.log('\n🎉 SUCCESS: All users now have geographic data!');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

// Run only if this script is executed directly
if (require.main === module) {
    updateMissingGeoData();
}

module.exports = { updateMissingGeoData };

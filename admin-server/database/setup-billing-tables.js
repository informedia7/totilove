/**
 * Setup script to create billing_plans and discount_codes tables
 * Run this with: node admin-server/database/setup-billing-tables.js
 */

const { query } = require('../config/database');
const logger = require('../utils/logger');

async function setupBillingTables() {
    try {
        console.log('Creating billing_plans and discount_codes tables...');

        // Create billing_plans table
        await query(`
            CREATE TABLE IF NOT EXISTS billing_plans (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                plan_type VARCHAR(50) NOT NULL,
                price_monthly NUMERIC(10, 2) NOT NULL DEFAULT 0,
                price_yearly NUMERIC(10, 2) NOT NULL DEFAULT 0,
                currency VARCHAR(3) DEFAULT 'USD',
                duration_days INTEGER,
                features JSONB,
                is_active BOOLEAN DEFAULT true,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
            )
        `);
        console.log('✓ billing_plans table created');

        // Create discount_codes table
        await query(`
            CREATE TABLE IF NOT EXISTS discount_codes (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) NOT NULL UNIQUE,
                description TEXT,
                discount_type VARCHAR(20) NOT NULL,
                discount_value NUMERIC(10, 2) NOT NULL,
                min_purchase_amount NUMERIC(10, 2) DEFAULT 0,
                max_discount_amount NUMERIC(10, 2),
                valid_from TIMESTAMP NOT NULL,
                valid_until TIMESTAMP,
                usage_limit INTEGER,
                usage_count INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                applicable_plans JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
            )
        `);
        console.log('✓ discount_codes table created');

        // Create indexes
        await query(`
            CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON billing_plans(is_active)
        `);
        await query(`
            CREATE INDEX IF NOT EXISTS idx_billing_plans_type ON billing_plans(plan_type)
        `);
        await query(`
            CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code)
        `);
        await query(`
            CREATE INDEX IF NOT EXISTS idx_discount_codes_active ON discount_codes(is_active)
        `);
        await query(`
            CREATE INDEX IF NOT EXISTS idx_discount_codes_valid ON discount_codes(valid_from, valid_until)
        `);
        console.log('✓ Indexes created');

        // Check if default plans exist
        const existingPlans = await query('SELECT COUNT(*) as count FROM billing_plans');
        if (parseInt(existingPlans.rows[0].count) === 0) {
            console.log('Inserting default plans...');
            
            await query(`
                INSERT INTO billing_plans (name, description, plan_type, price_monthly, price_yearly, duration_days, features, is_active, display_order)
                VALUES 
                    ('Free Plan', 'Basic features for free users', 'free', 0.00, 0.00, NULL, '{"unlimited_matches": false, "unlimited_messages": false, "profile_views": true}', true, 1),
                    ('Premium Plan', 'Full access to all premium features', 'premium', 9.99, 99.99, 30, '{"unlimited_matches": true, "unlimited_messages": true, "profile_views": true, "priority_support": true}', true, 2),
                    ('VIP Plan', 'Exclusive VIP features and priority', 'vip', 19.99, 199.99, 30, '{"unlimited_matches": true, "unlimited_messages": true, "profile_views": true, "priority_support": true, "exclusive_features": true}', true, 3)
            `);
            console.log('✓ Default plans inserted');
        } else {
            console.log('✓ Default plans already exist');
        }

        console.log('\n✅ Billing tables setup completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error setting up billing tables:', error);
        logger.error('Error setting up billing tables:', error);
        process.exit(1);
    }
}

// Run the setup
setupBillingTables();






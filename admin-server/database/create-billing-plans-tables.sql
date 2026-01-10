-- Billing Plans and Discount Codes Tables
-- This script creates tables for managing subscription plans and discount codes

-- Billing Plans Table
CREATE TABLE IF NOT EXISTS billing_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    plan_type VARCHAR(50) NOT NULL, -- 'free', 'basic', 'premium', 'vip', etc.
    price_monthly NUMERIC(10, 2) NOT NULL DEFAULT 0,
    price_yearly NUMERIC(10, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    duration_days INTEGER, -- NULL for unlimited, or number of days
    features JSONB, -- Store plan features as JSON
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Discount Codes Table
CREATE TABLE IF NOT EXISTS discount_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL, -- 'percentage' or 'fixed'
    discount_value NUMERIC(10, 2) NOT NULL, -- Percentage (0-100) or fixed amount
    min_purchase_amount NUMERIC(10, 2) DEFAULT 0,
    max_discount_amount NUMERIC(10, 2), -- NULL for unlimited
    valid_from TIMESTAMP NOT NULL,
    valid_until TIMESTAMP,
    usage_limit INTEGER, -- NULL for unlimited
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    applicable_plans JSONB, -- Array of plan IDs or 'all' for all plans
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON billing_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_billing_plans_type ON billing_plans(plan_type);
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_discount_codes_active ON discount_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_discount_codes_valid ON discount_codes(valid_from, valid_until);

-- Insert default plans
INSERT INTO billing_plans (name, description, plan_type, price_monthly, price_yearly, duration_days, features, is_active, display_order)
VALUES 
    ('Free Plan', 'Basic features for free users', 'free', 0.00, 0.00, NULL, '{"unlimited_matches": false, "unlimited_messages": false, "profile_views": true}', true, 1),
    ('Premium Plan', 'Full access to all premium features', 'premium', 9.99, 99.99, 30, '{"unlimited_matches": true, "unlimited_messages": true, "profile_views": true, "priority_support": true}', true, 2),
    ('VIP Plan', 'Exclusive VIP features and priority', 'vip', 19.99, 199.99, 30, '{"unlimited_matches": true, "unlimited_messages": true, "profile_views": true, "priority_support": true, "exclusive_features": true}', true, 3)
ON CONFLICT DO NOTHING;






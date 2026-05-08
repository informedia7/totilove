-- Migration: Create admin_rate_limiter_violations table
CREATE TABLE IF NOT EXISTS admin_rate_limiter_violations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    violation_type VARCHAR(50) NOT NULL,
    details TEXT,
    occurred_at TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT
);
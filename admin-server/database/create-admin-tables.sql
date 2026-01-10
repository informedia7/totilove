-- Admin Server Database Tables Creation Script
-- This script creates all necessary tables for the admin server

-- Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Admin Sessions Table
CREATE TABLE IF NOT EXISTS admin_sessions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- Admin Actions Table (Audit Log)
CREATE TABLE IF NOT EXISTS admin_actions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    action_type VARCHAR(50),
    target_user_id INTEGER,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Activity Log Table
CREATE TABLE IF NOT EXISTS admin_activity_log (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admin Analytics Table
CREATE TABLE IF NOT EXISTS admin_analytics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100),
    metric_value NUMERIC(10,2),
    date_recorded DATE DEFAULT CURRENT_DATE,
    admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin System Settings Table (with unique constraint on setting_key)
CREATE TABLE IF NOT EXISTS admin_system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type VARCHAR(20) DEFAULT 'string',
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_admin_id ON admin_activity_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created ON admin_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_system_settings_key ON admin_system_settings(setting_key);

-- Add comments
COMMENT ON TABLE admin_users IS 'Admin user accounts for the admin server';
COMMENT ON TABLE admin_sessions IS 'Admin user sessions';
COMMENT ON TABLE admin_actions IS 'Audit log of all admin actions';
COMMENT ON TABLE admin_activity_log IS 'Activity log for admin users';
COMMENT ON TABLE admin_analytics IS 'Analytics data stored by admins';
COMMENT ON TABLE admin_system_settings IS 'System configuration settings';





















































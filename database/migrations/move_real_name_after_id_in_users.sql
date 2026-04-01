-- Migration: Move real_name column to be right after id in users table
-- PostgreSQL doesn't support direct column reordering, so we need to recreate the table

BEGIN;

-- Step 1: Create a new table with the desired column order
CREATE TABLE users_new (
    id SERIAL PRIMARY KEY,
    real_name VARCHAR(255),
    email VARCHAR(255),
    password VARCHAR(255),
    birthdate DATE,
    gender VARCHAR(255),
    country_id INTEGER,
    state_id INTEGER,
    city_id INTEGER,
    suburb_id INTEGER,
    date_joined TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    previous_login TIMESTAMP,
    email_verified BOOLEAN DEFAULT false,
    profile_verified BOOLEAN DEFAULT false,
    is_banned BOOLEAN DEFAULT false,
    ip_address VARCHAR(255)
);

-- Step 2: Copy all data from old table to new table
INSERT INTO users_new (
    id, real_name, email, password, birthdate, gender, 
    country_id, state_id, city_id, suburb_id, 
    date_joined, last_login, previous_login, 
    email_verified, profile_verified, is_banned, ip_address
)
SELECT 
    id, real_name, email, password, birthdate, gender,
    country_id, state_id, city_id, suburb_id,
    date_joined, last_login, previous_login,
    email_verified, profile_verified, is_banned, ip_address
FROM users;

-- Step 3: Copy the sequence value to maintain auto-increment
SELECT setval('users_new_id_seq', (SELECT MAX(id) FROM users_new));

-- Step 4: Recreate all indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users_new(email);
CREATE INDEX IF NOT EXISTS idx_users_real_name ON users_new(real_name);
CREATE INDEX IF NOT EXISTS idx_users_country_id ON users_new(country_id);
CREATE INDEX IF NOT EXISTS idx_users_state_id ON users_new(state_id);
CREATE INDEX IF NOT EXISTS idx_users_city_id ON users_new(city_id);
CREATE INDEX IF NOT EXISTS idx_users_date_joined ON users_new(date_joined);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users_new(last_login);

-- Step 5: Recreate foreign key constraints
-- Note: These will be recreated automatically by PostgreSQL when we rename the table
-- But we need to check if they exist first

-- Step 6: Drop the old table
DROP TABLE users CASCADE;

-- Step 7: Rename the new table to the original name
ALTER TABLE users_new RENAME TO users;

-- Step 8: Rename the sequence
ALTER SEQUENCE users_new_id_seq RENAME TO users_id_seq;

-- Step 9: Recreate foreign key constraints that were dropped
-- (These will need to be recreated based on your schema)
-- Example:
-- ALTER TABLE users ADD CONSTRAINT fk_users_country FOREIGN KEY (country_id) REFERENCES country(id);
-- ALTER TABLE users ADD CONSTRAINT fk_users_state FOREIGN KEY (state_id) REFERENCES state(id);
-- ALTER TABLE users ADD CONSTRAINT fk_users_city FOREIGN KEY (city_id) REFERENCES city(id);

-- Step 10: Verify the new structure
DO $$
DECLARE
    col_order TEXT;
BEGIN
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO col_order
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users';
    
    RAISE NOTICE 'New column order: %', col_order;
END $$;

COMMIT;

-- Verification query (run separately to check):
-- SELECT column_name, ordinal_position 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' AND table_name = 'users'
-- ORDER BY ordinal_position;






























































































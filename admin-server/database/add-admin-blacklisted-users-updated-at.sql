-- Add updated_at on admin_blacklisted_users (PostgreSQL).
-- Fixes: record "new" has no field "updated_at" when a trigger references NEW.updated_at.
-- If the table is not in public, change the schema qualifier.

ALTER TABLE public.admin_blacklisted_users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Optional: set historical rows from blacklisted_at (only if that column exists)
-- UPDATE public.admin_blacklisted_users SET updated_at = blacklisted_at WHERE blacklisted_at IS NOT NULL;

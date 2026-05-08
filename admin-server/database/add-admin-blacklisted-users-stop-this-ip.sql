-- Optional: add stop_this_ip on admin_blacklisted_users (PostgreSQL).
-- The app also runs ALTER ... ADD COLUMN IF NOT EXISTS on startup paths via ensureAdminBlacklistSchema().
-- Repeat for non-public schemas if you use multiple copies of this table.

ALTER TABLE public.admin_blacklisted_users
    ADD COLUMN IF NOT EXISTS stop_this_ip BOOLEAN DEFAULT true;

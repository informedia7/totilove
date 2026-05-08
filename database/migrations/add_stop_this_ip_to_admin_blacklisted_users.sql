-- Add stop_this_ip: when true, registration block may use user_ip_address for this row; when false, email-only for matching logic (app-dependent).

ALTER TABLE public.admin_blacklisted_users
    ADD COLUMN IF NOT EXISTS stop_this_ip BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_blacklisted_users.stop_this_ip IS 'Default false. If true, registration is blocked when client IP matches user_ip_address for this row; if false, that row''s IP is ignored (email match on this table still blocks).';

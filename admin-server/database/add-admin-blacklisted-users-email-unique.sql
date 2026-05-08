-- Make email unique on public.admin_blacklisted_users (PostgreSQL).
-- Run after fixing any duplicate emails (see checks below).

-- 1) See duplicates (exact email string)
-- SELECT email, COUNT(*) AS n
-- FROM public.admin_blacklisted_users
-- GROUP BY email
-- HAVING COUNT(*) > 1;

-- 2) See duplicates after normalizing (case / spaces) — use if you add the expression index instead
-- SELECT LOWER(TRIM(email)) AS email_norm, COUNT(*) AS n
-- FROM public.admin_blacklisted_users
-- WHERE NULLIF(TRIM(COALESCE(email, '')), '') IS NOT NULL
-- GROUP BY 1
-- HAVING COUNT(*) > 1;

-- 3) Optional: remove duplicates, keep the smallest id per normalized email (review before run)
-- WITH d AS (
--   SELECT id,
--          ROW_NUMBER() OVER (
--            PARTITION BY LOWER(TRIM(email))
--            ORDER BY id
--          ) AS rn
--   FROM public.admin_blacklisted_users
--   WHERE NULLIF(TRIM(COALESCE(email, '')), '') IS NOT NULL
-- )
-- DELETE FROM public.admin_blacklisted_users ab
-- USING d
-- WHERE ab.id = d.id AND d.rn > 1;

-- 4a) Simple: one row per exact email value (matches app storing lower(trim) consistently)
ALTER TABLE public.admin_blacklisted_users
    ADD CONSTRAINT admin_blacklisted_users_email_unique UNIQUE (email);

-- 4b) Alternative (comment out 4a if you use this): case-insensitive unique on non-empty email
-- CREATE UNIQUE INDEX admin_blacklisted_users_email_norm_unique
--     ON public.admin_blacklisted_users ((LOWER(TRIM(email))))
--     WHERE NULLIF(TRIM(email), '') IS NOT NULL;

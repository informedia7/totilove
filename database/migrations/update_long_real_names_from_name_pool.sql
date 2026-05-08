-- Replace male real_name values containing 'chang' with unique male names from name_pool.
-- Replacement names must not already exist in users.real_name.

DO $$
DECLARE
    target_count integer;
    available_count integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM name_pool
        WHERE UPPER(TRIM(gender)) = 'MALE'
    ) THEN
        RAISE EXCEPTION 'name_pool has no MALE rows';
    END IF;

    SELECT COUNT(*)
    INTO target_count
    FROM users u
    WHERE u.real_name IS NOT NULL
      AND LOWER(TRIM(u.gender)) = 'male'
      AND LOWER(TRIM(u.real_name)) LIKE '%chang%';

    SELECT COUNT(*)
    INTO available_count
    FROM name_pool np
    WHERE UPPER(TRIM(np.gender)) = 'MALE'
      AND NOT EXISTS (
          SELECT 1
          FROM users u
          WHERE u.real_name IS NOT NULL
            AND LOWER(TRIM(u.real_name)) = LOWER(TRIM(np.name))
      );

    IF available_count < target_count THEN
        RAISE EXCEPTION 'Not enough unused MALE names in name_pool. Required: %, available: %', target_count, available_count;
    END IF;
END $$;

WITH target_users AS (
    SELECT
        u.id,
        ROW_NUMBER() OVER (ORDER BY random(), u.id) AS rn
    FROM users u
    WHERE u.real_name IS NOT NULL
      AND LOWER(TRIM(u.gender)) = 'male'
      AND LOWER(TRIM(u.real_name)) LIKE '%chang%'
),
available_names AS (
    SELECT
        np.name,
        ROW_NUMBER() OVER (ORDER BY random(), np.id) AS rn
    FROM name_pool np
    WHERE UPPER(TRIM(np.gender)) = 'MALE'
      AND NOT EXISTS (
          SELECT 1
          FROM users u
          WHERE u.real_name IS NOT NULL
            AND LOWER(TRIM(u.real_name)) = LOWER(TRIM(np.name))
      )
),
replacement_names AS (
    SELECT
        tu.id,
        an.name
    FROM target_users tu
    JOIN available_names an ON an.rn = tu.rn
)
UPDATE users u
SET real_name = rn.name,
    cleaned_name = rn.name
FROM replacement_names rn
WHERE u.id = rn.id;

-- Optional verification:
-- SELECT id, real_name, cleaned_name, gender
-- FROM users
-- WHERE LOWER(TRIM(gender)) = 'male'
--   AND LOWER(TRIM(real_name)) NOT LIKE '%chang%'
-- ORDER BY id;
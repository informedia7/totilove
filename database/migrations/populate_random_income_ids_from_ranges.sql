-- Assign every user_attributes row a per-row random valid income_id
-- from user_income_ranges.id.

WITH active_income_ids AS (
    SELECT id
    FROM user_income_ranges
    WHERE COALESCE(is_active, true) = true
),
source_income_ids AS (
    SELECT ARRAY_AGG(id ORDER BY id) AS ids
    FROM (
        SELECT id FROM active_income_ids
        UNION
        SELECT id
        FROM user_income_ranges
        WHERE NOT EXISTS (SELECT 1 FROM active_income_ids)
    ) income_pool
)
UPDATE user_attributes ua
SET income_id = source_income_ids.ids[
    1 + FLOOR(random() * array_length(source_income_ids.ids, 1))::int
]
FROM source_income_ids
WHERE array_length(source_income_ids.ids, 1) > 0;

-- Optional verification:
-- SELECT ua.user_id, ua.income_id, uir.name
-- FROM user_attributes ua
-- LEFT JOIN user_income_ranges uir ON uir.id = ua.income_id
-- ORDER BY ua.income_id, ua.user_id;

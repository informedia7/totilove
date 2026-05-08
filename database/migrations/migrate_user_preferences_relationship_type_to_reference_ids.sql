BEGIN;

WITH ref AS (
    SELECT
        id,
        LOWER(TRIM(name)) AS name_norm,
        LOWER(TRIM(COALESCE(display_name, ''))) AS display_norm
    FROM user_relationship_type_reference
    WHERE is_active = true
)
UPDATE user_preferences up
SET relationship_type = ref.id::text
FROM ref
WHERE up.relationship_type IS NOT NULL
  AND TRIM(up.relationship_type) <> ''
  AND up.relationship_type !~ '^[0-9]+$'
  AND (
      LOWER(TRIM(up.relationship_type)) = ref.name_norm
      OR LOWER(TRIM(up.relationship_type)) = ref.display_norm
  );

UPDATE user_preferences
SET relationship_type = NULL
WHERE relationship_type IS NOT NULL
  AND (
      TRIM(relationship_type) = ''
      OR LOWER(TRIM(relationship_type)) IN ('any', 'not specified', '__not_important__', 'not important', '0')
  );

COMMIT;

-- Optional validation query:
-- SELECT relationship_type, COUNT(*)
-- FROM user_preferences
-- WHERE relationship_type IS NOT NULL
--   AND TRIM(relationship_type) <> ''
--   AND TRIM(relationship_type) !~ '^[0-9]+$'
-- GROUP BY relationship_type
-- ORDER BY COUNT(*) DESC, relationship_type;

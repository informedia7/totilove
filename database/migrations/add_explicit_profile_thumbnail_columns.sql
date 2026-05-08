-- Add explicit profile thumbnail columns for strict, DB-driven thumbnail usage
-- Created: 2026-04-24

BEGIN;

ALTER TABLE user_images
    ADD COLUMN IF NOT EXISTS thumbnail_small_path VARCHAR(500),
    ADD COLUMN IF NOT EXISTS thumbnail_medium_path VARCHAR(500);

-- Backfill explicit thumbnail paths from file_name when missing.
-- Expected naming convention:
--   original: <base>.<ext>
--   small:    <base>_thumb_small.jpg
--   medium:   <base>_thumb_medium.jpg
WITH source AS (
    SELECT
        id,
        file_name,
        CASE
            WHEN file_name IS NULL OR file_name = '' THEN NULL
            WHEN file_name LIKE 'http://%' OR file_name LIKE 'https://%' THEN file_name
            ELSE '/uploads/profile_images/' || file_name
        END AS original_path,
        CASE
            WHEN file_name IS NULL OR file_name = '' THEN NULL
            WHEN file_name LIKE 'http://%' OR file_name LIKE 'https://%' THEN file_name
            ELSE '/uploads/profile_images/' || regexp_replace(file_name, '\\.[^.]+$', '') || '_thumb_small.jpg'
        END AS computed_small,
        CASE
            WHEN file_name IS NULL OR file_name = '' THEN NULL
            WHEN file_name LIKE 'http://%' OR file_name LIKE 'https://%' THEN file_name
            ELSE '/uploads/profile_images/' || regexp_replace(file_name, '\\.[^.]+$', '') || '_thumb_medium.jpg'
        END AS computed_medium
    FROM user_images
)
UPDATE user_images ui
SET
    thumbnail_small_path = COALESCE(ui.thumbnail_small_path, source.computed_small),
    thumbnail_medium_path = COALESCE(ui.thumbnail_medium_path, source.computed_medium),
    thumbnail_path = COALESCE(ui.thumbnail_path, source.computed_medium, source.computed_small, source.original_path)
FROM source
WHERE ui.id = source.id
  AND (
      ui.thumbnail_small_path IS NULL
      OR ui.thumbnail_medium_path IS NULL
      OR ui.thumbnail_path IS NULL
  );

COMMIT;

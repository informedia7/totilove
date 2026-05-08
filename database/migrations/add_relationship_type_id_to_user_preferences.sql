ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS relationship_type_id integer;

UPDATE public.user_preferences
SET relationship_type_id = CAST(TRIM(relationship_type) AS integer)
WHERE relationship_type_id IS NULL
  AND relationship_type IS NOT NULL
  AND TRIM(relationship_type) ~ '^[0-9]+$';

UPDATE public.user_preferences up
SET relationship_type_id = ref.id
FROM public.user_relationship_type_reference ref
WHERE up.relationship_type_id IS NULL
  AND up.relationship_type IS NOT NULL
  AND TRIM(up.relationship_type) <> ''
  AND LOWER(TRIM(up.relationship_type)) NOT IN ('any', 'not specified', '__not_important__', 'not important', '0')
  AND (
      LOWER(TRIM(up.relationship_type)) = LOWER(TRIM(ref.name))
      OR LOWER(TRIM(up.relationship_type)) = LOWER(TRIM(COALESCE(ref.display_name, '')))
  );
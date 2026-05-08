-- Sync users.real_name from users.cleaned_name only when cleaned_name exists and is different.
UPDATE users
SET real_name = cleaned_name
WHERE cleaned_name IS NOT NULL
  AND real_name IS DISTINCT FROM cleaned_name;

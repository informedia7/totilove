-- Set income_id based on occupation and education rules.
-- Rule 1: University education -> every 6th row gets income_id = 10,
-- otherwise random income_id from 4 to 7
-- Rule 2: Postgraduate education -> income_id = 6
-- Rule 3: Student occupation -> income_id = 1
-- The Student rule is applied last so it overrides education when both match.

WITH ranked_university_rows AS (
  SELECT
    ua.user_id,
    ROW_NUMBER() OVER (ORDER BY ua.user_id) AS row_num
  FROM user_attributes ua
  JOIN user_education_levels edu ON ua.education_id = edu.id
  WHERE LOWER(TRIM(edu.name)) = 'university'
),
university_income_updates AS (
  SELECT
    user_id,
    CASE
      WHEN row_num % 6 = 0 THEN 10
      ELSE FLOOR(random() * 4)::int + 4
    END AS income_id
  FROM ranked_university_rows
)
UPDATE user_attributes ua
SET income_id = uiu.income_id
FROM university_income_updates uiu
WHERE ua.user_id = uiu.user_id;

UPDATE user_attributes ua
SET income_id = 6
FROM user_education_levels edu
WHERE ua.education_id = edu.id
  AND LOWER(TRIM(edu.name)) = 'postgraduate';

UPDATE user_attributes ua
SET income_id = 1
FROM user_occupation_categories occ
WHERE ua.occupation_category_id = occ.id
  AND LOWER(TRIM(occ.name)) = 'student';

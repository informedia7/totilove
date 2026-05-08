-- Update user_attributes.weight_kg from user_attributes.height_cm using BMI.
-- Formula: weight_kg = ROUND(BMI * (height_cm / 100)^2)
-- Example with BMI 24.9: 170 cm -> ROUND(24.9 * 1.70^2) = 72 kg

BEGIN;

WITH bmi_config AS (
    SELECT 24.9::numeric AS target_bmi
)
UPDATE user_attributes ua
SET weight_kg = CASE
  WHEN ua.height_cm IS NULL OR ua.height_cm <= 0 THEN NULL
  ELSE ROUND(
    (SELECT target_bmi FROM bmi_config) * POWER(ua.height_cm::numeric / 100.0, 2)
  )::integer
END;

COMMIT;

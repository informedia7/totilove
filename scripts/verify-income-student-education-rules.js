const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'totilove1',
  user: process.env.PGUSER || process.env.DB_USER || 'postgres',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'password'
});

async function run() {
  try {
    const result = await pool.query(`
      WITH ranked_rows AS (
        SELECT
          ua.user_id,
          ua.income_id,
          LOWER(TRIM(COALESCE(occ.name, ''))) AS occupation_name,
          LOWER(TRIM(COALESCE(edu.name, ''))) AS education_name,
          CASE
            WHEN LOWER(TRIM(COALESCE(edu.name, ''))) = 'university'
            THEN ROW_NUMBER() OVER (
              PARTITION BY LOWER(TRIM(COALESCE(edu.name, '')))
              ORDER BY ua.user_id
            )
          END AS university_row_num
        FROM user_attributes ua
        LEFT JOIN user_occupation_categories occ ON occ.id = ua.occupation_category_id
        LEFT JOIN user_education_levels edu ON edu.id = ua.education_id
      )
      SELECT
        COUNT(*) FILTER (
          WHERE occupation_name = 'student' AND income_id <> 1
        )::int AS student_wrong,
        COUNT(*) FILTER (
          WHERE education_name = 'university'
            AND occupation_name <> 'student'
            AND university_row_num % 6 = 0
            AND income_id <> 10
        )::int AS university_6th_wrong,
        COUNT(*) FILTER (
          WHERE education_name = 'university'
            AND occupation_name <> 'student'
            AND university_row_num % 6 <> 0
            AND income_id NOT IN (4, 5, 6, 7)
        )::int AS university_non_6th_wrong,
        COUNT(*) FILTER (
          WHERE education_name = 'postgraduate'
            AND occupation_name <> 'student'
            AND income_id <> 6
        )::int AS postgraduate_wrong,
        COUNT(*) FILTER (
          WHERE occupation_name = 'student' AND income_id = 1
        )::int AS student_correct,
        COUNT(*) FILTER (
          WHERE education_name = 'university'
            AND occupation_name <> 'student'
            AND university_row_num % 6 = 0
            AND income_id = 10
        )::int AS university_6th_correct,
        COUNT(*) FILTER (
          WHERE education_name = 'university'
            AND occupation_name <> 'student'
            AND university_row_num % 6 <> 0
            AND income_id IN (4, 5, 6, 7)
        )::int AS university_non_6th_correct,
        COUNT(*) FILTER (
          WHERE education_name = 'postgraduate'
            AND occupation_name <> 'student'
            AND income_id = 6
        )::int AS postgraduate_correct,
        COUNT(*) FILTER (
          WHERE education_name = 'university'
            AND occupation_name <> 'student'
            AND income_id = 4
        )::int AS university_income_4,
        COUNT(*) FILTER (
          WHERE education_name = 'university'
            AND occupation_name <> 'student'
            AND income_id = 5
        )::int AS university_income_5,
        COUNT(*) FILTER (
          WHERE education_name = 'university'
            AND occupation_name <> 'student'
            AND income_id = 6
        )::int AS university_income_6,
        COUNT(*) FILTER (
          WHERE education_name = 'university'
            AND occupation_name <> 'student'
            AND income_id = 7
        )::int AS university_income_7,
        COUNT(*) FILTER (
          WHERE education_name = 'university'
            AND occupation_name <> 'student'
            AND income_id = 10
        )::int AS university_income_10
      FROM ranked_rows
    `);

    console.log(JSON.stringify(result.rows[0], null, 2));
  } catch (error) {
    console.error('VERIFY_ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();

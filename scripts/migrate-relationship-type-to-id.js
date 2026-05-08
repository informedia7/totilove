require('dotenv').config();
const { Pool } = require('pg');

async function run() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    try {
        const refs = await client.query(
            `SELECT id, name, display_name
             FROM user_relationship_type_reference
             WHERE is_active = true
             ORDER BY id`
        );

        const values = await client.query(
            `SELECT relationship_type, COUNT(*)::int AS count
             FROM user_preferences
             WHERE relationship_type IS NOT NULL AND TRIM(relationship_type) <> ''
             GROUP BY relationship_type
             ORDER BY count DESC, relationship_type`
        );

        console.log('--- Reference Types ---');
        refs.rows.forEach((r) => {
            console.log(`${r.id}\t${r.name || ''}\t${r.display_name || ''}`);
        });

        console.log('\n--- Existing Values ---');
        values.rows.forEach((r) => {
            console.log(`${r.relationship_type}\t${r.count}`);
        });

                await client.query('BEGIN');

                await client.query(
                        `ALTER TABLE user_preferences
                         ADD COLUMN IF NOT EXISTS relationship_type_id integer`
                );

        const updateResult = await client.query(
            `WITH ref AS (
                SELECT id,
                       lower(trim(name)) AS name_norm,
                       lower(trim(COALESCE(display_name, ''))) AS display_norm
                FROM user_relationship_type_reference
                WHERE is_active = true
            )
            UPDATE user_preferences up
                        SET relationship_type_id = ref.id
            FROM ref
            WHERE up.relationship_type IS NOT NULL
              AND trim(up.relationship_type) <> ''
                            AND up.relationship_type_id IS NULL
                            AND up.relationship_type !~ '^[0-9]+$'
              AND (
                  lower(trim(up.relationship_type)) = ref.name_norm
                  OR lower(trim(up.relationship_type)) = ref.display_norm
              )`
        );

                const numericCopyResult = await client.query(
                        `UPDATE user_preferences
                         SET relationship_type_id = CAST(TRIM(relationship_type) AS integer)
                         WHERE relationship_type_id IS NULL
                             AND relationship_type IS NOT NULL
                             AND TRIM(relationship_type) ~ '^[0-9]+$'`
                );

        const clearResult = await client.query(
                        `UPDATE user_preferences
                         SET relationship_type_id = NULL
                         WHERE relationship_type_id IS NULL
                             AND relationship_type IS NOT NULL
               AND (
                    trim(relationship_type) = ''
                    OR lower(trim(relationship_type)) IN ('any', 'not specified', '__not_important__', 'not important', '0')
               )`
        );

        const unmatchedResult = await client.query(
            `SELECT relationship_type, COUNT(*)::int AS count
             FROM user_preferences
             WHERE relationship_type IS NOT NULL
               AND trim(relationship_type) <> ''
                             AND relationship_type_id IS NULL
                             AND relationship_type !~ '^[0-9]+$'
             GROUP BY relationship_type
             ORDER BY count DESC, relationship_type`
        );

        if (unmatchedResult.rows.length > 0) {
            console.log('\n--- Unmatched Values (kept as-is) ---');
            unmatchedResult.rows.forEach((r) => {
                console.log(`${r.relationship_type}\t${r.count}`);
            });
        }

        await client.query('COMMIT');

                console.log(`\nUpdated rows: ${updateResult.rowCount}`);
                console.log(`Copied numeric rows: ${numericCopyResult.rowCount}`);
                console.log(`Cleared rows: ${clearResult.rowCount}`);

        const postCheck = await client.query(
                        `SELECT COUNT(*) FILTER (WHERE relationship_type_id IS NOT NULL)::int AS total_with_id,
                                        COUNT(*) FILTER (WHERE relationship_type IS NOT NULL AND TRIM(relationship_type) <> '')::int AS total_legacy_non_null,
                                        COUNT(*) FILTER (WHERE relationship_type_id IS NULL AND relationship_type IS NOT NULL AND TRIM(relationship_type) !~ '^[0-9]+$')::int AS unresolved_legacy_count
             FROM user_preferences`
        );

        const strictUnmatched = await client.query(
            `SELECT relationship_type, COUNT(*)::int AS count
             FROM user_preferences
             WHERE relationship_type IS NOT NULL
               AND TRIM(relationship_type) <> ''
                             AND relationship_type_id IS NULL
                             AND TRIM(relationship_type) !~ '^[0-9]+$'
             GROUP BY relationship_type
             ORDER BY count DESC, relationship_type`
        );

        console.log('\n--- Post Check ---');
        console.log(postCheck.rows[0]);
        if (strictUnmatched.rows.length === 0) {
            console.log('STRICT_VALIDATION: NO_NON_NUMERIC_VALUES');
        } else {
            console.log('STRICT_VALIDATION: NON_NUMERIC_VALUES_FOUND');
            strictUnmatched.rows.forEach((r) => {
                console.log(`${r.relationship_type}\t${r.count}`);
            });
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

run();

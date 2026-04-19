/**
 * Add profile text columns to shared users table.
 *
 * Usage: node database/add-users-profile-columns.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'totilove1',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function addUsersProfileColumns() {
    const client = await pool.connect();

    try {
        console.log('Adding columns to users table: about_me, partner_preferences...');

        await client.query('BEGIN');

        const usersExists = await client.query(
            `SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'users'
            ) AS exists`
        );

        if (!usersExists.rows[0].exists) {
            throw new Error('users table does not exist in public schema');
        }

        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS about_me TEXT,
            ADD COLUMN IF NOT EXISTS partner_preferences TEXT
        `);

        const userAttributesExists = await client.query(
            `SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'user_attributes'
            ) AS exists`
        );

        if (userAttributesExists.rows[0].exists) {
            const attributeColumns = await client.query(
                `SELECT column_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'user_attributes'
                   AND column_name IN ('about_me', 'partner_preferences')`
            );

            const sourceColumns = new Set(attributeColumns.rows.map(row => row.column_name));

            if (sourceColumns.has('about_me')) {
                await client.query(`
                    UPDATE users u
                    SET about_me = ua.about_me
                    FROM user_attributes ua
                    WHERE ua.user_id = u.id
                      AND ua.about_me IS NOT NULL
                      AND ua.about_me <> ''
                      AND (u.about_me IS NULL OR u.about_me = '')
                `);
                console.log('Backfilled users.about_me from user_attributes.about_me');
            } else {
                console.log('Skipped about_me backfill (user_attributes.about_me not found)');
            }

            if (sourceColumns.has('partner_preferences')) {
                await client.query(`
                    UPDATE users u
                    SET partner_preferences = ua.partner_preferences
                    FROM user_attributes ua
                    WHERE ua.user_id = u.id
                      AND ua.partner_preferences IS NOT NULL
                      AND ua.partner_preferences <> ''
                      AND (u.partner_preferences IS NULL OR u.partner_preferences = '')
                `);
                console.log('Backfilled users.partner_preferences from user_attributes.partner_preferences');
            } else {
                console.log('Skipped partner_preferences backfill (user_attributes.partner_preferences not found)');
            }
        } else {
            console.log('Skipped backfill (user_attributes table not found)');
        }

        await client.query('COMMIT');
        console.log('Done. Columns ensured on users table and backfill attempted.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Failed to add users profile columns:', error.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

addUsersProfileColumns();

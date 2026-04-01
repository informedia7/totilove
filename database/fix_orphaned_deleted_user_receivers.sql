-- Fix orphaned records in users_deleted_receivers
-- Orphaned records are those where deleted_user_id exists in users_deleted_receivers
-- but the corresponding entry doesn't exist in users_deleted table

-- Step 1: Identify orphaned records
SELECT 
    'Orphaned records found' as status,
    udr.deleted_user_id,
    COUNT(*) as orphaned_count
FROM users_deleted_receivers udr
LEFT JOIN users_deleted ud ON udr.deleted_user_id = ud.deleted_user_id
WHERE ud.deleted_user_id IS NULL
GROUP BY udr.deleted_user_id;

-- Step 2: Check if these deleted_user_ids exist in users table (as deleted users)
-- If they exist with real_name = 'Deleted User', we can create entries in users_deleted
-- Note: Admin-deleted users are hard deleted, so they won't exist in users table
SELECT 
    'Deleted users found in users table (soft deleted)' as status,
    u.id as deleted_user_id,
    u.real_name,
    u.email,
    COUNT(udr.id) as receiver_count
FROM users u
INNER JOIN users_deleted_receivers udr ON u.id = udr.deleted_user_id
LEFT JOIN users_deleted ud ON u.id = ud.deleted_user_id
WHERE u.real_name = 'Deleted User'
  AND ud.deleted_user_id IS NULL
GROUP BY u.id, u.real_name, u.email;

-- Step 3: Create missing entries in users_deleted table for orphaned records
-- This will create entries for soft-deleted users (real_name='Deleted User') that exist in users table but not in users_deleted
-- For hard-deleted users (admin deleted), we cannot recover the real real_name/email, so those orphaned records will be deleted in Step 4
INSERT INTO users_deleted (deleted_user_id, real_name, email, deleted_by, created_at)
SELECT DISTINCT
    u.id as deleted_user_id,
    u.real_name,
    COALESCE(u.email, 'deleted_' || u.id::text || '@deleted.local') as email,
    'user' as deleted_by,  -- Soft deleted by user
    NOW() as created_at
FROM users u
INNER JOIN users_deleted_receivers udr ON u.id = udr.deleted_user_id
LEFT JOIN users_deleted ud ON u.id = ud.deleted_user_id
WHERE u.real_name = 'Deleted User'
  AND ud.deleted_user_id IS NULL
ON CONFLICT (deleted_user_id) DO UPDATE
SET real_name = EXCLUDED.real_name,
    email = EXCLUDED.email;

-- Step 4: For orphaned records where the user was hard deleted (doesn't exist in users table),
-- we cannot recover the real real_name/email, so we must delete these orphaned records
-- These are likely from admin deletions where users_deleted entry was lost or transaction failed
DELETE FROM users_deleted_receivers
WHERE deleted_user_id IN (
    SELECT DISTINCT udr.deleted_user_id
    FROM users_deleted_receivers udr
    LEFT JOIN users_deleted ud ON udr.deleted_user_id = ud.deleted_user_id
    LEFT JOIN users u ON udr.deleted_user_id = u.id
    WHERE ud.deleted_user_id IS NULL
      AND u.id IS NULL
);

-- Step 4b: Also create placeholder entries in users_deleted for hard-deleted users if we want to keep the mappings
-- (Alternative approach - uncomment if you want to keep orphaned records with placeholder data)
/*
INSERT INTO users_deleted (deleted_user_id, real_name, email, deleted_by, created_at)
SELECT DISTINCT
    udr.deleted_user_id,
    'Deleted User' as real_name,
    'deleted_' || udr.deleted_user_id::text || '@deleted.local' as email,
    'admin' as deleted_by,
    MIN(udr.created_at) as created_at
FROM users_deleted_receivers udr
LEFT JOIN users_deleted ud ON udr.deleted_user_id = ud.deleted_user_id
LEFT JOIN users u ON udr.deleted_user_id = u.id
WHERE ud.deleted_user_id IS NULL
  AND u.id IS NULL
GROUP BY udr.deleted_user_id
ON CONFLICT (deleted_user_id) DO NOTHING;
*/

-- Step 5: Verify fix - should return no orphaned records
SELECT 
    'Verification - Orphaned records after fix' as status,
    COUNT(*) as remaining_orphaned_count
FROM users_deleted_receivers udr
LEFT JOIN users_deleted ud ON udr.deleted_user_id = ud.deleted_user_id
WHERE ud.deleted_user_id IS NULL;

-- Step 6: Summary report
SELECT 
    'Summary' as report_type,
    (SELECT COUNT(*) FROM users_deleted) as total_deleted_users,
    (SELECT COUNT(*) FROM users_deleted_receivers) as total_receiver_mappings,
    (SELECT COUNT(*) FROM users_deleted_receivers WHERE cleared_at IS NOT NULL) as cleared_mappings,
    (SELECT COUNT(*) FROM users_deleted_receivers WHERE cleared_at IS NULL) as active_mappings;


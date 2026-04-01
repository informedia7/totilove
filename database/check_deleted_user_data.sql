-- Check deleted user data in database
-- This script helps diagnose issues with clear-deleted-user-conversation endpoint

-- 1. Check if deleted user exists in users_deleted table
SELECT 
    'users_deleted table' as table_name,
    deleted_user_id,
    real_name,
    email,
    deleted_by,
    created_at
FROM users_deleted
ORDER BY created_at DESC
LIMIT 10;

-- 2. Check receiver mappings in users_deleted_receivers table
SELECT 
    'users_deleted_receivers table' as table_name,
    id,
    deleted_user_id,
    receiver_id,
    created_at,
    cleared_at
FROM users_deleted_receivers
ORDER BY created_at DESC
LIMIT 20;

-- 3. Check specific deleted user and receiver combination
-- Replace :deleted_user_id and :receiver_id with actual values
-- Example: Check if deleted user 123 has receiver mapping for user 456
/*
SELECT 
    'Specific mapping check' as check_type,
    ud.deleted_user_id,
    ud.real_name,
    ud.email,
    udr.receiver_id,
    udr.created_at,
    udr.cleared_at,
    CASE 
        WHEN udr.id IS NULL THEN 'MAPPING MISSING - This is the problem!'
        WHEN udr.cleared_at IS NOT NULL THEN 'Already cleared'
        ELSE 'Mapping exists and not cleared'
    END as status
FROM users_deleted ud
LEFT JOIN users_deleted_receivers udr 
    ON ud.deleted_user_id = udr.deleted_user_id 
    AND udr.receiver_id = :receiver_id  -- Replace with actual receiver_id
WHERE ud.deleted_user_id = :deleted_user_id;  -- Replace with actual deleted_user_id
*/

-- 4. Count records per deleted user
SELECT 
    'Count by deleted_user_id' as summary,
    deleted_user_id,
    COUNT(*) as receiver_count
FROM users_deleted_receivers
GROUP BY deleted_user_id
ORDER BY receiver_count DESC
LIMIT 10;

-- 5. Check for orphaned records (deleted_user_id exists but no entry in users_deleted)
SELECT 
    'Orphaned receivers' as issue_type,
    udr.deleted_user_id,
    COUNT(*) as orphaned_count
FROM users_deleted_receivers udr
LEFT JOIN users_deleted ud ON udr.deleted_user_id = ud.deleted_user_id
WHERE ud.deleted_user_id IS NULL
GROUP BY udr.deleted_user_id;

-- 6. Check for missing receiver mappings (exists in users_deleted but no receivers)
SELECT 
    'Missing receiver mappings' as issue_type,
    ud.deleted_user_id,
    ud.real_name,
    COUNT(udr.id) as receiver_count
FROM users_deleted ud
LEFT JOIN users_deleted_receivers udr ON ud.deleted_user_id = udr.deleted_user_id
GROUP BY ud.deleted_user_id, ud.real_name
HAVING COUNT(udr.id) = 0;













































































































































































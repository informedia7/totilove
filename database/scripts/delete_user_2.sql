-- SQL Script to delete user with id 2 (real_name: "Deleted User")
-- WARNING: This will permanently delete the user and all associated data
-- Make sure to backup data if needed before running this script
-- 
-- NOTE: This script follows the same deletion order as userManagementService.js
-- File deletions (images, attachments) must be handled separately via file system

BEGIN;

-- Step 1: Verify the user exists and get user info
DO $$
DECLARE
    user_exists BOOLEAN;
    user_real_name VARCHAR(255);
    user_email VARCHAR(255);
BEGIN
    SELECT EXISTS(SELECT 1 FROM users WHERE id = 2) INTO user_exists;
    
    IF NOT user_exists THEN
        RAISE EXCEPTION 'User with id 2 does not exist';
    END IF;
    
    SELECT real_name, email INTO user_real_name, user_email FROM users WHERE id = 2;
    
    RAISE NOTICE 'Deleting user: id=2, real_name=%, email=%', user_real_name, user_email;
END $$;

-- Step 2: Store deleted user info in users_deleted (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users_deleted') THEN
        INSERT INTO users_deleted (deleted_user_id, real_name, email, created_at)
        SELECT id, real_name, email, NOW()
        FROM users
        WHERE id = 2
        ON CONFLICT (deleted_user_id) DO UPDATE
        SET real_name = EXCLUDED.real_name, email = EXCLUDED.email;
        
        RAISE NOTICE 'Added user to users_deleted table';
    END IF;
END $$;

-- Step 3: Store receiver mappings in users_deleted_receivers (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users_deleted_receivers') THEN
        INSERT INTO users_deleted_receivers (deleted_user_id, receiver_id, created_at)
        SELECT DISTINCT
            2 as deleted_user_id,
            CASE 
                WHEN sender_id = 2 THEN receiver_id
                ELSE sender_id
            END as receiver_id,
            NOW()
        FROM user_messages
        WHERE (sender_id = 2 OR receiver_id = 2)
        AND CASE 
            WHEN sender_id = 2 THEN receiver_id
            ELSE sender_id
        END != 2
        ON CONFLICT (deleted_user_id, receiver_id) DO NOTHING;
        
        RAISE NOTICE 'Added receiver mappings to users_deleted_receivers table';
    END IF;
END $$;

-- Step 4: Delete message attachments (database records only - files must be deleted separately)
DELETE FROM user_message_attachments 
WHERE message_id IN (SELECT id FROM user_messages WHERE sender_id = 2 OR receiver_id = 2);

-- Step 5: Delete all messages (both sent and received)
DELETE FROM user_messages WHERE sender_id = 2 OR receiver_id = 2;

-- Step 6: Delete all likes (both given and received)
DELETE FROM users_likes WHERE liked_by = 2 OR liked_user_id = 2;

-- Step 7: Delete all profile views (both as viewer and viewed)
DELETE FROM users_profile_views WHERE viewer_id = 2 OR viewed_user_id = 2;

-- Step 8: Delete user profile images (database records only - files must be deleted separately)
DELETE FROM user_images WHERE user_id = 2;

-- Step 9: Delete favorites
DELETE FROM users_favorites WHERE favorited_by = 2 OR favorited_user_id = 2;

-- Step 10: Delete blocked relationships
DELETE FROM users_blocked_by_users WHERE blocker_id = 2 OR blocked_id = 2;

-- Step 11: Delete user attributes
DELETE FROM user_attributes WHERE user_id = 2;

-- Step 12: Delete user preferences
DELETE FROM user_preferences WHERE user_id = 2;

-- Step 13: Delete user sessions
DELETE FROM user_sessions WHERE user_id = 2;

-- Step 14: Delete matches
DELETE FROM user_matches WHERE user1_id = 2 OR user2_id = 2;

-- Step 15: Delete passes (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_passes') THEN
        DELETE FROM user_passes WHERE passed_by = 2 OR passed_user_id = 2;
    END IF;
END $$;


-- Step 18: Delete user activity (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_activity') THEN
        DELETE FROM user_activity WHERE user_id = 2 OR target_user_id = 2;
    END IF;
END $$;

-- Step 19: Delete user reports (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_reports') THEN
        DELETE FROM user_reports WHERE reporter_id = 2 OR reported_user_id = 2;
    END IF;
END $$;

-- Step 21: Delete from users_deleted_receivers where this user was a receiver
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users_deleted_receivers') THEN
        DELETE FROM users_deleted_receivers WHERE receiver_id = 2;
    END IF;
END $$;

-- Step 22: Delete optional settings tables
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profile_settings') THEN
        DELETE FROM user_profile_settings WHERE user_id = 2;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_measurement_preferences') THEN
        DELETE FROM user_measurement_preferences WHERE user_id = 2;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_contact_countries') THEN
        DELETE FROM user_contact_countries WHERE user_id = 2;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_languages') THEN
        DELETE FROM user_languages WHERE user_id = 2;
    END IF;
END $$;

-- Step 23: Delete location history
DELETE FROM user_location_history WHERE user_id = 2;

-- Step 24: Finally, delete the user record itself
DELETE FROM users WHERE id = 2;

-- Step 25: Verify deletion
DO $$
DECLARE
    user_still_exists BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM users WHERE id = 2) INTO user_still_exists;
    
    IF user_still_exists THEN
        RAISE EXCEPTION 'User deletion failed - user still exists';
    ELSE
        RAISE NOTICE 'User with id 2 has been successfully deleted';
    END IF;
END $$;

-- Commit the transaction
-- IMPORTANT: Review all deletions above before committing
-- To commit, uncomment the next line:
COMMIT;

-- To rollback instead, uncomment the next line and comment out COMMIT:
-- ROLLBACK;


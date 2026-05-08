# Query Logic for Deleted Users (After Removing receiver_id)

## Problem
After removing `receiver_id` from `users_deleted` table, we need a way to determine which deleted users should appear in each user's conversation list.

## Solution
Use the `messages` table to determine if a user had conversations with a deleted user.

## Query Logic for elladavis173 (User ID 6) to see Deleted User 2:

### Step 1: Get all deleted users (global list)
```sql
SELECT 
    deleted_user_id,
    real_name,
    email,
    created_at
FROM users_deleted
```

### Step 2: Check if elladavis173 had messages with deleted users
```sql
SELECT DISTINCT
    ud.deleted_user_id as other_user_id,
    ud.real_name as other_real_name,
    ud.email as other_email,
    '/assets/images/account_deactivated.svg' as profile_image,
    MAX(m.timestamp) as last_message_time,
    0 as unread_count,
    true as is_deleted_user
FROM users_deleted ud
INNER JOIN messages m ON (
    (m.sender_id = 6 AND m.receiver_id = ud.deleted_user_id)
    OR
    (m.sender_id = ud.deleted_user_id AND m.receiver_id = 6)
)
WHERE m.deleted_by_receiver = false
  AND m.recall_type = 'none'
  AND m.message_type != 'like'
GROUP BY ud.deleted_user_id, ud.real_name, ud.email
```

### Step 3: Combine with active conversations
```sql
WITH active_conversations AS (
    -- Existing active conversations query
    SELECT DISTINCT 
        CASE 
            WHEN m.sender_id = 6 THEN m.receiver_id
            ELSE m.sender_id
        END as other_user_id,
        u.real_name as other_real_name,
        u.email as other_email,
        COALESCE(ui.file_name, NULL) as profile_image,
        MAX(m.timestamp) as last_message_time,
        COUNT(CASE 
            WHEN m.receiver_id = 6 
            AND m.read_at IS NULL 
            AND COALESCE(m.deleted_by_receiver, false) = false
            AND COALESCE(m.recall_type, 'none') = 'none'
            AND COALESCE(m.message_type, 'text') != 'like'
            THEN 1 
        END) as unread_count,
        false as is_deleted_user
    FROM messages m
    JOIN users u ON (
        CASE 
            WHEN m.sender_id = 6 THEN m.receiver_id
            ELSE m.sender_id
        END = u.id
    )
    LEFT JOIN user_images ui ON ui.user_id = u.id AND ui.is_profile = 1
    WHERE (m.sender_id = 6 OR m.receiver_id = 6)
    AND COALESCE(m.deleted_by_receiver, false) = false
    AND COALESCE(m.recall_type, 'none') = 'none'
    AND COALESCE(m.message_type, 'text') != 'like'
    -- Exclude deleted users from active conversations
    AND NOT EXISTS (
        SELECT 1 FROM users_deleted ud 
        WHERE ud.deleted_user_id = CASE 
            WHEN m.sender_id = 6 THEN m.receiver_id
            ELSE m.sender_id
        END
    )
    GROUP BY 
        CASE 
            WHEN m.sender_id = 6 THEN m.receiver_id
            ELSE m.sender_id
        END,
        u.real_name, 
        u.email, 
        ui.file_name
),
deleted_users_conversations AS (
    SELECT DISTINCT
        ud.deleted_user_id as other_user_id,
        ud.real_name as other_real_name,
        ud.email as other_email,
        '/assets/images/account_deactivated.svg' as profile_image,
        MAX(m.timestamp) as last_message_time,
        0 as unread_count,
        true as is_deleted_user
    FROM users_deleted ud
    INNER JOIN messages m ON (
        (m.sender_id = 6 AND m.receiver_id = ud.deleted_user_id)
        OR
        (m.sender_id = ud.deleted_user_id AND m.receiver_id = 6)
    )
    WHERE COALESCE(m.deleted_by_receiver, false) = false
      AND COALESCE(m.recall_type, 'none') = 'none'
      AND COALESCE(m.message_type, 'text') != 'like'
    GROUP BY ud.deleted_user_id, ud.real_name, ud.email
)
SELECT 
    other_user_id,
    other_real_name,
    other_email,
    profile_image,
    last_message_time,
    unread_count,
    is_deleted_user
FROM active_conversations
UNION ALL
SELECT 
    other_user_id,
    other_real_name,
    other_email,
    profile_image,
    last_message_time,
    unread_count,
    is_deleted_user
FROM deleted_users_conversations
ORDER BY last_message_time DESC
```

## Key Points:

1. **users_deleted is now a global list** - no receiver_id column
2. **Use messages table to link** - Check if user 6 had messages with deleted user 2
3. **INNER JOIN with messages** - Only show deleted users if messages exist
4. **Exclude from active_conversations** - Use NOT EXISTS to prevent duplicates
5. **UNION ALL** - Combine active and deleted user conversations

## For elladavis173 to see deleted user 2:
- User 2 must exist in `users_deleted` table
- There must be messages between user 6 and user 2 in the `messages` table
- The messages must not be deleted/recalled



































































































































































































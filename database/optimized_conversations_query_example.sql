-- OPTIMIZED VERSION: Using LEFT JOIN LATERAL
-- This gets the last message content in a single query instead of N+1 queries

WITH active_conversations AS (
    SELECT DISTINCT 
        CASE 
            WHEN m.sender_id = $1 THEN m.receiver_id
            ELSE m.sender_id
        END as other_user_id,
        u.real_name as other_real_name,
        u.email as other_email,
        COALESCE(ui.file_name, NULL) as profile_image,
        MAX(m.timestamp) as last_message_time,
        COUNT(CASE 
            WHEN m.receiver_id = $1 
            AND m.read_at IS NULL 
            AND COALESCE(m.deleted_by_receiver, false) = false
            AND COALESCE(m.recall_type, 'none') = 'none'
            AND COALESCE(m.message_type, 'text') != 'like'
            THEN 1 
        END) as unread_count,
        CASE 
            WHEN ud.deleted_user_id IS NOT NULL THEN true
            ELSE false
        END as is_deleted_user
    FROM messages m
    JOIN users u ON (
        CASE 
            WHEN m.sender_id = $1 THEN m.receiver_id
            ELSE m.sender_id
        END = u.id
    )
    LEFT JOIN user_images ui ON ui.user_id = u.id AND ui.is_profile = 1
    LEFT JOIN users_deleted ud ON ud.deleted_user_id = (
        CASE 
            WHEN m.sender_id = $1 THEN m.receiver_id
            ELSE m.sender_id
        END
    )
    WHERE (m.sender_id = $1 OR m.receiver_id = $1)
    AND COALESCE(m.deleted_by_receiver, false) = false
    AND COALESCE(m.recall_type, 'none') = 'none'
    AND COALESCE(m.message_type, 'text') != 'like'
    GROUP BY 
        CASE 
            WHEN m.sender_id = $1 THEN m.receiver_id
            ELSE m.sender_id
        END,
        u.real_name, 
        u.email, 
        ui.file_name,
        ud.deleted_user_id
),
deleted_users_cte AS (
    SELECT DISTINCT
        ud.deleted_user_id as other_user_id,
        ud.real_name as other_real_name,
        ud.email as other_email,
        '/assets/images/account_deactivated.svg' as profile_image,
        ud.created_at as last_message_time,
        0 as unread_count,
        true as is_deleted_user
    FROM users_deleted ud
    INNER JOIN users_deleted_receivers udr ON (
        udr.deleted_user_id = ud.deleted_user_id
        AND udr.receiver_id = $1
    )
)
SELECT 
    final.other_user_id,
    final.other_real_name,
    final.other_email,
    final.profile_image,
    final.last_message_time,
    final.unread_count,
    final.is_deleted_user,
    -- OPTIMIZATION: Get last message content in the same query using LATERAL
    CASE 
        WHEN final.is_deleted_user = true THEN 'Account Deactivated'
        WHEN last_msg.message IS NULL THEN 'No messages yet'
        WHEN last_msg.sender_id = $1 THEN 'You: ' || last_msg.message
        ELSE last_msg.message
    END as last_message_content,
    last_msg.sender_id as last_message_sender_id
FROM (
    SELECT 
        ac.other_user_id,
        ac.other_real_name,
        ac.other_email,
        CASE 
            WHEN ac.is_deleted_user = true THEN '/assets/images/account_deactivated.svg'
            ELSE ac.profile_image
        END as profile_image,
        ac.last_message_time,
        ac.unread_count,
        ac.is_deleted_user
    FROM active_conversations ac
    LEFT JOIN deleted_users_cte duc ON duc.other_user_id = ac.other_user_id
    WHERE duc.other_user_id IS NULL
    UNION ALL
    SELECT 
        duc.other_user_id,
        duc.other_real_name,
        duc.other_email,
        duc.profile_image,
        duc.last_message_time,
        duc.unread_count,
        true as is_deleted_user
    FROM deleted_users_cte duc
) final
-- KEY OPTIMIZATION: LEFT JOIN LATERAL gets the last message for each conversation
LEFT JOIN LATERAL (
    SELECT message, sender_id
    FROM messages 
    WHERE (sender_id = $1 AND receiver_id = final.other_user_id) 
       OR (sender_id = final.other_user_id AND receiver_id = $1)
    AND COALESCE(deleted_by_receiver, false) = false
    AND COALESCE(recall_type, 'none') = 'none'
    AND COALESCE(message_type, 'text') != 'like'
    ORDER BY timestamp DESC 
    LIMIT 1
) last_msg ON true
ORDER BY final.last_message_time DESC;

-- WHAT THIS DOES:
-- 1. The LATERAL subquery runs ONCE per conversation row
-- 2. It can reference 'final.other_user_id' from the outer query
-- 3. Gets the last message for that specific conversation
-- 4. All in ONE database query instead of N+1 queries
-- 
-- PERFORMANCE BENEFIT:
-- - Before: 1 query + N queries (where N = number of conversations)
-- - After: 1 query total
-- - Example: 20 conversations = 21 queries → 1 query (95% reduction!)



















































































































































































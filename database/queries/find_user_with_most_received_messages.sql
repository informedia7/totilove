-- Query to find which user received the most messages from a SINGLE user (specific sender-receiver pair)
-- This query groups messages by sender_id and receiver_id to find the conversation with most messages

SELECT 
    sender.id AS sender_id,
    sender.real_name AS sender_name,
    sender.email AS sender_email,
    receiver.id AS receiver_id,
    receiver.real_name AS receiver_name,
    receiver.email AS receiver_email,
    COUNT(*) AS total_messages_received,
    COUNT(CASE WHEN um.read_at IS NULL THEN 1 END) AS unread_messages,
    COUNT(CASE WHEN um.read_at IS NOT NULL THEN 1 END) AS read_messages,
    MIN(um.timestamp) AS first_message_received,
    MAX(um.timestamp) AS last_message_received
FROM user_messages um
JOIN users sender ON um.sender_id = sender.id
JOIN users receiver ON um.receiver_id = receiver.id
WHERE COALESCE(um.deleted_by_receiver, false) = false
  AND COALESCE(um.message_type, 'text') != 'like'  -- Exclude like messages if needed
GROUP BY sender.id, sender.real_name, sender.email, receiver.id, receiver.real_name, receiver.email
ORDER BY total_messages_received DESC
LIMIT 10;  -- Show top 10 sender-receiver pairs

-- Alternative: If you want to see ALL pairs (not just top 10), remove the LIMIT clause
-- ORDER BY total_messages_received DESC;

-- To get just the single pair with the most messages:
-- SELECT 
--     sender.id AS sender_id,
--     sender.real_name AS sender_name,
--     receiver.id AS receiver_id,
--     receiver.real_name AS receiver_name,
--     COUNT(*) AS total_messages_received
-- FROM user_messages um
-- JOIN users sender ON um.sender_id = sender.id
-- JOIN users receiver ON um.receiver_id = receiver.id
-- WHERE COALESCE(um.deleted_by_receiver, false) = false
--   AND COALESCE(um.message_type, 'text') != 'like'
-- GROUP BY sender.id, sender.real_name, receiver.id, receiver.real_name
-- ORDER BY total_messages_received DESC
-- LIMIT 1;


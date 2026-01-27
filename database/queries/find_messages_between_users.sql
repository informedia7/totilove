-- Query to find messages from Bobby to Norah (using user names)
-- No replacements needed - just run the query

SELECT 
    um.id,
    um.sender_id,
    s.real_name AS sender_name,
    s.email AS sender_email,
    um.receiver_id,
    r.real_name AS receiver_name,
    r.email AS receiver_email,
    um.message,
    um.timestamp,
    um.read_at,
    um.status,
    um.message_type,
    um.attachment_count,
    CASE 
        WHEN um.read_at IS NULL THEN false
        ELSE true
    END AS is_read,
    CASE 
        WHEN COALESCE(um.deleted_by_receiver, false) = true THEN true
        ELSE false
    END AS is_deleted_by_receiver
FROM user_messages um
JOIN users s ON um.sender_id = s.id
JOIN users r ON um.receiver_id = r.id
WHERE s.real_name = 'Bobby'
  AND r.real_name = 'Norah'
  AND COALESCE(um.deleted_by_receiver, false) = false
  AND COALESCE(um.message_type, 'text') != 'like'
ORDER BY um.timestamp ASC;

-- To count total messages from Bobby to Norah:
SELECT COUNT(*) AS total_messages
FROM user_messages um
JOIN users s ON um.sender_id = s.id
JOIN users r ON um.receiver_id = r.id
WHERE s.real_name = 'Bobby'
  AND r.real_name = 'Norah'
  AND COALESCE(um.deleted_by_receiver, false) = false
  AND COALESCE(um.message_type, 'text') != 'like';


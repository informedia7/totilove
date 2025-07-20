const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'postgres',
    port: 5432,
});

async function debugConversations() {
    try {
        console.log('Testing conversations query for user 20...');
        
        // First, let's check what messages exist for user 20
        console.log('\n1. Messages involving user 20:');
        const messagesResult = await pool.query(`
            SELECT sender_id, receiver_id, content, timestamp 
            FROM messages 
            WHERE sender_id = 20 OR receiver_id = 20 
            ORDER BY timestamp DESC 
            LIMIT 10
        `);
        console.log('Found messages:', messagesResult.rows);
        
        // Test the actual conversations query
        console.log('\n2. Testing full conversations query:');
        const conversationsResult = await pool.query(`
            SELECT DISTINCT
                CASE 
                    WHEN m.sender_id = $1 THEN m.receiver_id 
                    ELSE m.sender_id 
                END as userId,
                u.username,
                CASE 
                    WHEN last_msg.content IS NOT NULL THEN last_msg.content
                    ELSE NULL
                END as lastMessage,
                EXTRACT(EPOCH FROM MAX(m.timestamp)) * 1000 as lastMessageTime,
                0 as unreadCount,
                COALESCE(os.is_online, false) as isOnline
            FROM messages m
            JOIN users u ON (
                CASE 
                    WHEN m.sender_id = $1 THEN m.receiver_id 
                    ELSE m.sender_id 
                END = u.id
            )
            LEFT JOIN LATERAL (
                SELECT content 
                FROM messages m2 
                WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id) 
                   OR (m2.sender_id = u.id AND m2.receiver_id = $1)
                ORDER BY m2.timestamp DESC 
                LIMIT 1
            ) last_msg ON true
            LEFT JOIN online_status os ON u.id = os.user_id
            WHERE m.sender_id = $1 OR m.receiver_id = $1
            GROUP BY 
                CASE 
                    WHEN m.sender_id = $1 THEN m.receiver_id 
                    ELSE m.sender_id 
                END,
                u.username, last_msg.content, os.is_online
            HAVING last_msg.content IS NOT NULL
            ORDER BY MAX(m.timestamp) DESC
        `, [20]);
        
        console.log('Conversations result:', conversationsResult.rows);
        
        // Let's try a simpler query
        console.log('\n3. Testing simpler conversations query:');
        const simpleResult = await pool.query(`
            SELECT DISTINCT
                CASE 
                    WHEN m.sender_id = $1 THEN m.receiver_id 
                    ELSE m.sender_id 
                END as userId,
                u.username,
                MAX(m.timestamp) as lastMessageTime
            FROM messages m
            JOIN users u ON (
                CASE 
                    WHEN m.sender_id = $1 THEN m.receiver_id 
                    ELSE m.sender_id 
                END = u.id
            )
            WHERE m.sender_id = $1 OR m.receiver_id = $1
            GROUP BY 
                CASE 
                    WHEN m.sender_id = $1 THEN m.receiver_id 
                    ELSE m.sender_id 
                END,
                u.username
            ORDER BY MAX(m.timestamp) DESC
        `, [20]);
        
        console.log('Simple conversations result:', simpleResult.rows);
        
    } catch (error) {
        console.error('Error testing conversations:', error);
    } finally {
        await pool.end();
    }
}

debugConversations();

// Add test messages to user_id 20
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432,
});

async function addTestMessages() {
    try {
        console.log('🔄 Adding test messages to user_id 20...');
        
        // Sample messages from different users to user_id 20
        const messages = [
            { senderId: 3, receiverId: 20, message: 'Hey there! How are you doing?' },
            { senderId: 20, receiverId: 3, message: 'Hi! I\'m doing great, thanks for asking!' },
            { senderId: 3, receiverId: 20, message: 'That\'s awesome! What are you up to today?' },
            { senderId: 20, receiverId: 3, message: 'Just working on some projects. How about you?' },
            { senderId: 4, receiverId: 20, message: 'Hello! Nice to meet you!' },
            { senderId: 20, receiverId: 4, message: 'Nice to meet you too! 😊' },
            { senderId: 5, receiverId: 20, message: 'Are you free this weekend?' },
            { senderId: 20, receiverId: 5, message: 'Yes, I should be free. What did you have in mind?' },
            { senderId: 6, receiverId: 20, message: 'I saw your profile and wanted to say hi!' },
            { senderId: 20, receiverId: 6, message: 'Thank you! That\'s very sweet of you to say.' },
            { senderId: 3, receiverId: 20, message: 'Do you want to grab coffee sometime?' },
            { senderId: 20, receiverId: 3, message: 'I\'d love to! When works for you?' },
            { senderId: 7, receiverId: 20, message: 'Hope you\'re having a great day!' },
            { senderId: 20, receiverId: 7, message: 'Thank you! You too! ☀️' },
            { senderId: 8, receiverId: 20, message: 'What\'s your favorite hobby?' },
            { senderId: 20, receiverId: 8, message: 'I love reading and hiking. What about you?' },
            { senderId: 9, receiverId: 20, message: 'You seem really interesting!' },
            { senderId: 20, receiverId: 9, message: 'Thank you! I\'d love to get to know you better too.' },
            { senderId: 3, receiverId: 20, message: 'Good morning! Ready for the day?' },
            { senderId: 20, receiverId: 3, message: 'Good morning! Absolutely ready! 🌅' }
        ];
        
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            
            await pool.query(`
                INSERT INTO messages (sender_id, receiver_id, message, timestamp, status)
                VALUES ($1, $2, $3, NOW() - INTERVAL '${i * 15} minutes', 'sent')
            `, [msg.senderId, msg.receiverId, msg.message]);
            
            console.log(`✅ Added message: "${msg.message.substring(0, 30)}..." from user ${msg.senderId} to ${msg.receiverId}`);
        }
        
        console.log(`🎉 Successfully added ${messages.length} test messages!`);
        
        // Show summary of messages for user_id 20
        const result = await pool.query(`
            SELECT 
                CASE 
                    WHEN sender_id = 20 THEN 'Sent'
                    ELSE 'Received'
                END as direction,
                COUNT(*) as count
            FROM messages 
            WHERE sender_id = 20 OR receiver_id = 20
            GROUP BY 
                CASE 
                    WHEN sender_id = 20 THEN 'Sent'
                    ELSE 'Received'
                END
        `);
        
        console.log('\n📊 Message summary for user_id 20:');
        result.rows.forEach(row => {
            console.log(`${row.direction}: ${row.count} messages`);
        });
        
    } catch (error) {
        console.error('❌ Error adding messages:', error);
    } finally {
        await pool.end();
    }
}

addTestMessages();

# 🏗️ Totilove System Architecture & Data Flow

## 📊 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          TOTILOVE DATING PLATFORM                              │
│                         Real-Time Chat System                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser #1    │    │   Browser #2    │    │   Browser #N    │
│  (User A)       │    │  (User B)       │    │  (User N)       │
│                 │    │                 │    │                 │
│ • Login Form    │    │ • Chat UI       │    │ • Mobile View   │
│ • Chat Interface│    │ • Messages      │    │ • Notifications │
│ • Real-time UI  │    │ • Typing Ind.   │    │ • Profile       │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     LOAD BALANCER       │
                    │   (Optional/Future)     │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────▼───────────────────────┐
         │              NODE.JS SERVER                   │
         │          (Express + Socket.IO)               │
         │                                              │
         │  ┌─────────────┐  ┌──────────────────────┐   │
         │  │   REST API  │  │   WEBSOCKET SERVER   │   │
         │  │             │  │                      │   │
         │  │ • /login    │  │ • Real-time msgs     │   │
         │  │ • /messages │  │ • Online status      │   │
         │  │ • /users    │  │ • Typing indicators  │   │
         │  │ • /sessions │  │ • Connection mgmt    │   │
         │  └─────────────┘  └──────────────────────┘   │
         │                                              │
         │  ┌─────────────────────────────────────────┐ │
         │  │         MIDDLEWARE LAYER                │ │
         │  │                                         │ │
         │  │ • Authentication (requireAuth)          │ │
         │  │ • Session Validation                    │ │
         │  │ • CORS Headers                          │ │
         │  │ • Error Handling                        │ │
         │  │ • Request Logging                       │ │
         │  └─────────────────────────────────────────┘ │
         └───────┬───────────────────────┬───────────────┘
                 │                       │
       ┌─────────▼─────────┐   ┌─────────▼─────────┐
       │      REDIS        │   │   POSTGRESQL      │
       │   (In-Memory)     │   │   (Persistent)    │
       │                   │   │                   │
       │ • Sessions        │   │ • Users           │
       │ • Recent Messages │   │ • Messages        │
       │ • Online Users    │   │ • User Sessions   │
       │ • Conversations   │   │ • Profiles        │
       │ • Typing Status   │   │ • Relationships   │
       │ • Cache Layer     │   │ • System Logs     │
       │                   │   │                   │
       │ ⚡ Ultra Fast     │   │ 💾 Permanent      │
       │ 🔄 Volatile       │   │ 🔒 ACID           │
       └───────────────────┘   └───────────────────┘
```

## 🔄 Data Flow Explanation

### 1. **User Authentication Flow**
```
User Login → Express Server → PostgreSQL (verify credentials) 
          → Session Service → Redis (store session) 
          → Return JWT Token → User Authenticated
```

### 2. **Real-Time Messaging Flow**
```
User Types Message → Frontend → REST API (/api/messages/send)
                             → Message Service → PostgreSQL (store permanently)
                             → Redis (cache recent messages)
                             → WebSocket Broadcast → All Connected Users
                             → Real-time UI Update
```

### 3. **Message Retrieval Flow**
```
Load Chat History → REST API (/api/messages/:userId/:otherUserId)
                  → Redis (check cache first) → Return if found
                  → PostgreSQL (fallback) → Cache in Redis → Return to User
```

### 4. **Online Status Flow**
```
User Connects → WebSocket Authentication → Redis (mark online)
             → Broadcast to other users → Real-time status update
User Disconnects → Remove from Redis → Broadcast offline status
```

## 💾 Redis Data Structure

```
Redis Keys:
├── session:{token}                 → User session data
├── user_sessions:{userId}          → User's active session token
├── chat:{userId1}:{userId2}:messages → Recent messages (last 100)
├── user:{userId}:conversations     → User's conversation list
├── user:{userId}:online            → Online status
├── typing:{userId}:{partnerId}     → Typing indicators
└── online_users                    → Set of currently online users

Sample Redis Data:
session:abc123... = {
  "userId": 20,
  "username": "2@hotmail.co",
  "lastActivity": 1752898000000,
  "isActive": true
}

chat:20:106:messages = [
  {"id": 1, "senderId": 20, "content": "Hello!", "timestamp": 1752898001000},
  {"id": 2, "senderId": 106, "content": "Hi there!", "timestamp": 1752898002000}
]
```

## 🗄️ PostgreSQL Database Schema

```sql
-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'sent',
    created_at TIMESTAMP DEFAULT NOW()
);

-- User Sessions table
CREATE TABLE user_sessions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    last_activity TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_messages_conversation ON messages(sender_id, receiver_id, timestamp);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_sessions_activity ON user_sessions(last_activity);
```

## 📈 Performance Characteristics

| Component | Purpose | Speed | Persistence | Scalability |
|-----------|---------|-------|-------------|-------------|
| **Redis** | Cache, Sessions, Real-time | ⚡ < 1ms | 🔄 Volatile | ⬆️ Horizontal |
| **PostgreSQL** | Permanent Storage | 💾 < 10ms | 💎 Permanent | ⬆️ Vertical |
| **WebSocket** | Real-time Communication | ⚡ < 5ms | ❌ No | ⬆️ Horizontal |
| **Express API** | Business Logic | 🚀 < 50ms | ❌ No | ⬆️ Horizontal |

## 🔄 Why This Architecture Works

### **Redis Benefits:**
- ⚡ **Ultra-fast** access for real-time features
- 🔄 **Pub/Sub** for WebSocket message broadcasting  
- 💨 **Session caching** for quick authentication
- 📊 **Online user tracking** in real-time

### **PostgreSQL Benefits:**
- 💾 **Permanent storage** for critical data
- 🔒 **ACID compliance** for data integrity
- 🔍 **Complex queries** for user matching
- 📈 **Backup and recovery** capabilities

### **Hybrid Approach:**
- 🚀 **Best of both worlds**: Speed + Reliability
- 🔄 **Automatic fallback**: Redis → PostgreSQL
- 📊 **Data consistency**: Critical data in both
- ⚡ **Performance optimization**: Hot data in Redis

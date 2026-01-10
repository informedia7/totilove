# Admin Messages Dashboard

## Overview
This admin system provides complete database management for all messages in the Totilove application. It's designed to be a powerful tool for administrators to view, update, delete, and manage messages with full data visibility.

## Features

### 🔍 **Message Management**
- **View All Messages**: Complete database view with pagination
- **Advanced Filtering**: Search by content, sender, receiver, status, recall status
- **Real-time Updates**: Live data from the database
- **Bulk Operations**: Export to CSV, toggle recall status

### 📊 **Statistics Dashboard**
- Total message count
- Recalled messages count
- Unread messages count
- Saved messages count
- Messages with attachments count

### ✏️ **Message Operations**
- **Edit Messages**: Modify sender, receiver, content, status, recall settings
- **Delete Messages**: Complete removal from database
- **Add Messages**: Create new messages between users
- **Toggle Recall**: Enable/disable message recall status

### 🔧 **Technical Features**
- **Responsive Design**: Works on desktop and mobile
- **Real-time Search**: Instant filtering with debounced input
- **Export Functionality**: Download data as CSV
- **Pagination**: Handle large datasets efficiently

## Access

### Dashboard URL
```
http://localhost:3000/api/admin/dashboard
```

### API Endpoints
```
GET    /api/admin/messages          - Get all messages with filtering
POST   /api/admin/messages          - Add new message
PUT    /api/admin/messages/:id      - Update existing message
DELETE /api/admin/messages/:id      - Delete message
POST   /api/admin/messages/:id/toggle-recall - Toggle recall status
GET    /api/admin/messages/stats    - Get message statistics
```

## Usage

### 1. **View Messages**
- Navigate to the dashboard
- Use search filters to find specific messages
- Sort by timestamp, ID, sender, or receiver
- Navigate through pages for large datasets

### 2. **Edit Messages**
- Click the ✏️ button on any message
- Modify sender ID, receiver ID, content, status
- Toggle recall and saved status
- Save changes

### 3. **Delete Messages**
- Click the 🗑️ button on any message
- Confirm deletion (permanent)
- Message is completely removed from database

### 4. **Toggle Recall**
- Click the ⏹️/🔄 button to toggle recall status
- Automatically switches between recalled and normal
- Updates recall metadata in database

### 5. **Add New Messages**
- Click the ➕ Add Message button
- Fill in sender ID, receiver ID, content, status
- Create messages between any users

### 6. **Export Data**
- Click the 📊 Export CSV button
- Download filtered results as CSV file
- Includes all message data and metadata

## Security Notes

⚠️ **Important**: This admin system currently has no authentication for demo purposes. In production:

1. **Add Authentication**: Implement proper admin login system
2. **Role-based Access**: Restrict access to authorized administrators only
3. **Audit Logging**: Log all admin actions for security tracking
4. **Rate Limiting**: Prevent abuse of admin endpoints
5. **Input Validation**: Sanitize all user inputs

## Database Schema

The system works with the following `messages` table structure:

```sql
- id: Primary key
- sender_id: User ID who sent the message
- receiver_id: User ID who received the message
- message: Message content (never modified for recalls)
- timestamp: When message was sent
- status: Message status (sent, delivered, read)
- read_at: When message was read (NULL if unread)
- recalled: Boolean flag for recall status
- recall_type: Type of recall (none, soft, hard)
- attachment_count: Number of attachments
- saved: Boolean flag for saved status
```

## File Structure

```
admin/
├── controllers/
│   └── adminMessageController.js    # Backend logic
├── routes/
│   ├── adminRoutes.js              # Main admin routes
│   └── adminMessageRoutes.js       # Message-specific routes
├── views/
│   └── messages-dashboard.html     # Frontend dashboard
└── README.md                       # This file
```

## Development

### Adding New Features
1. **Backend**: Add methods to `adminMessageController.js`
2. **Routes**: Add endpoints to `adminMessageRoutes.js`
3. **Frontend**: Update the HTML dashboard with new UI elements

### Testing
- Test all CRUD operations
- Verify database integrity
- Check error handling
- Test with large datasets

## Support

For issues or questions about the admin system:
1. Check the server logs for error messages
2. Verify database connectivity
3. Ensure all required tables exist
4. Check file permissions for the admin folder

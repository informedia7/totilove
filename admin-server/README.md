# Totilove Admin Server

Standalone admin server for managing Totilove users, statistics, and system configuration.

## Features

- ✅ Separate server on port 3003 (independent from main app)
- ✅ Admin authentication system
- ✅ Session management
- ✅ Audit logging
- ✅ Security middleware (helmet, rate limiting)
- ✅ Database connection (shared PostgreSQL)
- ✅ Redis support (optional, for sessions)
- ✅ User Management (Phase 2 - Complete)
- ✅ Payment Management (Complete)
- ✅ Subscription Control (Complete)

## Setup

### 1. Install Dependencies

```bash
cd admin-server
npm install
```

### 2. Configure Environment

Create `.env` file with your settings:

```env
ADMIN_PORT=3003
DB_HOST=localhost
DB_PORT=5432
DB_NAME=totilove
DB_USER=your_db_user
DB_PASSWORD=your_db_password
ADMIN_SESSION_SECRET=your_random_secret
```

### 3. Setup Database Tables

**IMPORTANT:** Run this before starting the server for the first time:

```bash
npm run setup-db
```

Or manually:
```bash
node database/setup-admin-database.js
```

This will create all necessary admin tables:
- `admin_users` - Admin user accounts
- `admin_sessions` - Admin sessions
- `admin_actions` - Audit log
- `admin_activity_log` - Activity log
- `admin_analytics` - Analytics data
- `admin_system_settings` - System configuration settings

### 4. Create Admin User

```bash
node setup-admin-user.js admin admin@example.com yourpassword
```

### 5. Start Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server will start on `http://localhost:3003`

## Database Tables Required

The admin server requires the following tables (created by `npm run setup-db`):

### Core Admin Tables
- ✅ `admin_users` - Admin user accounts
- ✅ `admin_sessions` - Admin user sessions  
- ✅ `admin_actions` - Audit log of admin actions
- ✅ `admin_activity_log` - Activity logging
- ✅ `admin_analytics` - Analytics data storage
- ✅ `admin_system_settings` - System configuration (with UNIQUE constraint on `setting_key`)

### Shared Tables (from main app)
The admin server also uses these existing tables (created by the main app):
- ✅ `users` - User accounts (required for JOINs)
- ✅ `subscriptions` - Subscription records (required for Payment/Subscription Management)
  - Required columns: `id`, `user_id`, `subscription_type`, `payment_status`, `start_date`, `end_date`
- ✅ `payments` - Payment records (required for Payment Management)
  - Required columns: `id`, `user_id`, `amount`, `payment_date`, `payment_method`, `payment_status`
- `user_attributes` - User profile data
- `user_images` - User photos (with `approval_status` column added automatically)
- `messages` - Messages
- `likes` - User likes
- `users_blocked_by_users` - Blocked users
- `reports` / `user_reports` - User reports
- `users_profile_views` - Profile views (optional)
- And other user-related tables

**Note:** To verify shared tables exist and have required columns, run:
```bash
npm run verify-tables
```

## Access

- **Login:** http://localhost:3003/login
- **Dashboard:** http://localhost:3003/dashboard
- **User Management:** http://localhost:3003/users
- **Message Management:** http://localhost:3003/messages
- **Payment Management:** http://localhost:3003/payments
- **Subscription Control:** http://localhost:3003/subscription-control
- **Blocked & Reported:** http://localhost:3003/blocked-reported
- **Image Approval:** http://localhost:3003/image-approval
- **Statistics:** http://localhost:3003/statistics
- **Configuration:** http://localhost:3003/configuration
- **Export/Import:** http://localhost:3003/export-import
- **Health Check:** http://localhost:3003/health

## API Endpoints

### Authentication
- `GET /login` - Login page
- `POST /login` - Login handler
- `POST /logout` - Logout handler
- `GET /dashboard` - Dashboard (protected)

### User Management
- `GET /api/users` - List users with filters
- `GET /api/users/:id` - Get user details
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `POST /api/users/:id/ban` - Ban user
- `DELETE /api/users/:id/ban` - Unban user
- `POST /api/users/:id/verify/email` - Verify email
- `DELETE /api/users/:id/verify/email` - Unverify email
- `POST /api/users/:id/verify/profile` - Verify profile
- `DELETE /api/users/:id/verify/profile` - Unverify profile
- `POST /api/users/bulk` - Bulk operations

### Payment Management
- `GET /api/payments` - List payments
- `GET /api/payments/:id` - Get payment details
- `PUT /api/payments/:id` - Update payment
- `GET /api/payments/stats` - Payment statistics
- `GET /api/payments/subscriptions` - List subscriptions
- `GET /api/payments/subscriptions/:id` - Get subscription details
- `PUT /api/payments/subscriptions/:id` - Update subscription
- `POST /api/payments/subscriptions/:id/cancel` - Cancel subscription
- `POST /api/payments/subscriptions/:id/extend` - Extend subscription
- `GET /api/payments/subscriptions/stats` - Subscription statistics

### Subscription Control
- `GET /api/subscription-control/settings` - Get subscription control settings
- `PUT /api/subscription-control/settings` - Update subscription control settings
- `GET /api/subscription-control/check/:userId` - Check if user requires subscription

### Statistics (Phase 3)
- `GET /api/stats/dashboard` - Dashboard statistics
- `GET /api/stats/users` - User statistics
- `GET /api/stats/activity` - Activity statistics

### Configuration (Phase 4)
- `GET /api/config` - Get all settings
- `PUT /api/config` - Update settings

## Subscription Control Features

The subscription control system allows you to:

1. **Free Join Settings:**
   - Allow all users to join for free
   - Allow specific gender (e.g., women) to join for free
   - Set free period for new users (e.g., 7 days free trial)

2. **Contact Restrictions:**
   - Require subscription to contact users
   - Allow free users to contact (with daily limits)
   - Set daily contact limit for free users

3. **Message Restrictions:**
   - Require subscription to send messages
   - Allow free users to send messages (with daily limits)
   - Set daily message limit for free users

4. **Like Restrictions:**
   - Require subscription to like profiles
   - Allow free users to like (with daily limits)
   - Set daily like limit for free users

5. **Profile View Restrictions:**
   - Require subscription to view full profiles

## Integration with Main App

The main app can check subscription requirements by calling:

```javascript
// Check if user needs subscription to send message
const response = await fetch('http://localhost:3003/api/subscription-control/check/123?action=message');
const data = await response.json();

if (data.requiresSubscription) {
    // Show subscription prompt
    showSubscriptionPrompt();
} else if (!data.dailyLimit.allowed) {
    // Show daily limit reached message
    showDailyLimitMessage(data.dailyLimit);
} else {
    // Allow action
    sendMessage();
}
```

## Project Structure

```
admin-server/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── middleware/      # Express middleware
├── routes/          # Route definitions
├── services/        # Business logic
├── utils/           # Utility functions
├── views/           # HTML templates
├── public/          # Static assets
├── server.js        # Main entry point
└── package.json     # Dependencies
```

## Security

- All admin routes require authentication
- Session-based authentication
- Rate limiting on API endpoints
- Helmet.js for security headers
- IP whitelisting support (optional)
- Audit logging for all actions

## Development Status

- ✅ **Phase 1:** Foundation & Authentication (Complete)
- ✅ **Phase 2:** User Management (Complete)
- ✅ **Payment Management:** Complete
- ✅ **Subscription Control:** Complete
- ⏳ **Phase 3:** Statistics & Analytics
- ⏳ **Phase 4:** System Configuration
- ⏳ **Phase 5:** Export/Import & Polish

## Notes

- This server is completely separate from the main application
- It connects to the same PostgreSQL database
- Redis is optional but recommended for session storage
- All admin actions are logged to `admin_actions` table
- Subscription control settings are stored in `admin_system_settings` table





















































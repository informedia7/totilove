# User Delete Account Flow

## Overview
This document shows the complete flow of what happens when a user deletes their account, from the user's perspective and from the system's perspective.

---

## Step-by-Step Flow

### 1. User Initiates Account Deletion

**Location:** `app/pages/account.html` - "Delete Account" button

**User Action:**
- User clicks "Delete Account" button in the Data Management section
- Button is styled with warning colors (yellow/orange background)

**System Response:**
- Shows first confirmation dialog:
  ```
  "Are you sure you want to delete your account? 
   This action cannot be undone."
  ```
- If user clicks "Cancel" → Process stops
- If user clicks "OK" → Shows second confirmation

**Second Confirmation:**
- User must type "DELETE" to confirm
- If user doesn't type exactly "DELETE" → Process stops
- If user types "DELETE" → Proceeds to API call

---

### 2. API Call to Delete Account

**Endpoint:** `DELETE /api/account/delete?token={sessionToken}`

**Request:**
```javascript
fetch(`/api/account/delete?token=${sessionToken}`, {
    method: 'DELETE',
    headers: {
        'Content-Type': 'application/json'
    }
})
```

**Backend Processing:**
1. Validates user authentication via token
2. Gets user ID from token
3. Calls `userManagementService.deleteUser(userId)`

---

### 3. Account Anonymization (Backend)

**File:** `services/userManagementService.js` - `deleteUser(userId)` method

**What Happens:**

#### 3.1. Anonymize User Account
```sql
UPDATE users SET 
    real_name = 'Deleted User',
    email = 'deleted_' || id || '@deleted.local',
    password = NULL
WHERE id = $1
```
**Result:**
- ✅ Username changed to "Deleted User"
- ✅ Email anonymized (e.g., `deleted_123@deleted.local`)
- ✅ Password set to NULL (user cannot log in)
- ✅ User record still exists in database

#### 3.2. Delete Profile Images
```sql
DELETE FROM user_images WHERE user_id = $1
```
**Result:**
- ✅ All profile photos deleted from database
- ✅ Image files remain on server (can be cleaned up later)
- ✅ No profile images associated with user

#### 3.3. Delete User Data (Doesn't Affect Messages)
```sql
DELETE FROM users_likes WHERE liked_by = $1 OR liked_user_id = $1
DELETE FROM users_favorites WHERE favorited_by = $1 OR favorited_user_id = $1
DELETE FROM users_blocked_by_users WHERE blocker_id = $1 OR blocked_id = $1
DELETE FROM user_attributes WHERE user_id = $1
DELETE FROM user_preferences WHERE user_id = $1
DELETE FROM user_sessions WHERE user_id = $1
DELETE FROM user_matches WHERE user1_id = $1 OR user2_id = $1
DELETE FROM user_passes WHERE passed_by = $1 OR passed_user_id = $1
DELETE FROM friends WHERE user_id = $1 OR friend_id = $1
DELETE FROM notifications WHERE user_id = $1
DELETE FROM user_activity WHERE user_id = $1 OR target_user_id = $1
DELETE FROM user_profile_settings WHERE user_id = $1
DELETE FROM user_measurement_preferences WHERE user_id = $1
DELETE FROM user_contact_countries WHERE user_id = $1
DELETE FROM user_languages WHERE user_id = $1
```
**Result:**
- ✅ All user preferences, settings, and social connections deleted
- ✅ User's likes, favorites, blocks removed
- ✅ All active sessions invalidated

#### 3.4. Messages Are NOT Deleted
**Important:** Messages are preserved! They remain in the database with:
- `sender_id` or `receiver_id` pointing to the deleted user
- Message content intact
- Timestamps preserved
- `deleted_by_receiver` remains `false` (unless receiver clears conversation later)

**Result:**
- ✅ Messages from deleted user remain visible to receivers (but blurred)
- ✅ Messages to deleted user remain in database
- ✅ Conversation history preserved

#### 3.5. Clear Cache
```javascript
await this.redis.del(`user:${userId}`);
await this.redis.del('users:*');
```
**Result:**
- ✅ User cache cleared
- ✅ User list cache cleared

---

### 4. API Response

**Success Response:**
```json
{
    "success": true,
    "message": "Account deleted successfully"
}
```

**Error Response:**
```json
{
    "success": false,
    "error": "Error message"
}
```

---

### 5. Frontend Response to Deletion

**File:** `app/pages/account.html`

**On Success:**
```javascript
if (data.success) {
    alert('Your account has been deleted. You will be logged out.');
    window.location.href = '/login.html';
}
```

**What Happens:**
1. ✅ Shows success message
2. ✅ Redirects to login page
3. ✅ User is logged out (session invalidated)

---

### 6. What Other Users See

#### 6.1. In Conversation List
**Location:** Talk page conversation sidebar

**Before Deletion:**
- Shows normal conversation with user's name and profile image
- Last message preview visible

**After Deletion:**
- ✅ Shows "Account Deactivated" or "Deleted User" as name
- ✅ Shows account_deactivated.svg as profile image
- ✅ Last message preview is **blurred** (filter: blur(2px))
- ✅ Conversation item has orange border indicator
- ✅ Clicking conversation opens "Account Deactivated" modal (doesn't load messages)

#### 6.2. In Message History
**Location:** Talk page message area

**Before Deletion:**
- Messages display normally with sender's name and profile image
- Full message content visible

**After Deletion:**
- ✅ Sender name shows as "Account Deactivated"
- ✅ Profile image shows account_deactivated.svg
- ✅ **Messages are blurred** (filter: blur(3px), opacity: 0.6)
- ✅ Messages are clickable
- ✅ Hovering reduces blur slightly (filter: blur(1px), opacity: 0.8)
- ✅ Clicking on blurred message or deleted user's name opens modal

#### 6.3. In Activity Feed
**Location:** Activity page - "New Messages" section

**Before Deletion:**
- Message card shows sender's name, profile image, and message preview

**After Deletion:**
- ✅ Sender name shows as "Account Deactivated"
- ✅ Profile image shows account_deactivated.svg
- ✅ Message preview is **blurred**
- ✅ "Reply" button is **disabled** (or hidden)
- ✅ Clicking message card opens "Account Deactivated" modal

#### 6.4. In Search Results
**Location:** Search/Results page

**After Deletion:**
- ✅ Deleted user does NOT appear in search results
- ✅ Query filters: `WHERE real_name != 'Deleted User'`

---

### 7. Account Deactivated Modal

**Triggered When:**
- User clicks on deleted user's name/profile in conversation list
- User clicks on deleted user's name/profile in message area
- User clicks on blurred message from deleted user
- User clicks on deleted user's message card in activity feed

**Modal Content:**
```
⚠️ Account Deactivated

This user's account has been deactivated. 
Their messages are blurred for privacy.

[Clear Conversation] [Close]
```

**Actions:**
1. **Clear Conversation Button:**
   - Shows confirmation: "Are you sure you want to clear all messages with 'Account Deactivated'? This will hide all messages from this deactivated account. You can't undo this action."
   - If confirmed → Calls API: `POST /api/messages/clear-deleted-user-conversation`
   - Sets `deleted_by_receiver = true` for all messages from deleted user
   - Hides conversation from receiver's view
   - Data still exists in database

2. **Close Button:**
   - Closes modal
   - Returns to previous view

---

### 8. Clear Conversation Flow

**When User Clicks "Clear Conversation":**

#### 8.1. API Call
**Endpoint:** `POST /api/messages/clear-deleted-user-conversation`

**Request Body:**
```json
{
    "token": "session_token",
    "deletedUserId": 123
}
```

#### 8.2. Backend Processing
**File:** `controllers/messageController.js` - `clearDeletedUserConversation()`

**What Happens:**
```sql
UPDATE user_messages 
SET deleted_by_receiver = true
WHERE sender_id = $1 AND receiver_id = $2 AND deleted_by_receiver = false
```

**Result:**
- ✅ All messages from deleted user marked as `deleted_by_receiver = true`
- ✅ Messages remain in database
- ✅ Messages hidden from receiver's view

#### 8.3. Frontend Update
**After API Success:**
- ✅ Modal closes
- ✅ Conversation removed from conversation list
- ✅ Messages no longer visible in message area
- ✅ Conversation no longer appears in activity feed
- ✅ User sees success message: "Conversation cleared successfully"

---

### 9. Database State After Deletion

#### User Record:
```sql
users table:
- id: 123 (unchanged)
- real_name: 'Deleted User'
- email: 'deleted_123@deleted.local'
- password: NULL
- All other fields: unchanged or NULL
```

#### Messages:
```sql
messages table:
- All messages remain unchanged
- sender_id: 123 (points to deleted user)
- receiver_id: other_user_id
- message: "Original message content" (preserved)
- deleted_by_receiver: false (unless receiver clears conversation)
- All timestamps preserved
```

#### After Receiver Clears Conversation:
```sql
messages table:
- deleted_by_receiver: true (for messages from deleted user)
- All other data unchanged
- Messages still in database, just hidden from receiver
```

---

### 10. User Cannot Log In

**Attempted Login:**
- User tries to log in with old email/password
- System checks: `real_name = 'Deleted User'` OR `password IS NULL`
- Login fails with: "Invalid email or password"
- User cannot access account

---

## Visual Summary

### Before Deletion:
```
Conversation List:
┌─────────────────────────┐
│ 👤 John Doe             │
│ "Hey, how are you?"     │
└─────────────────────────┘

Message Area:
┌─────────────────────────┐
│ 👤 John Doe   10:30 AM  │
│ Hey, how are you?       │
└─────────────────────────┘
```

### After Deletion (Before Clearing):
```
Conversation List:
┌─────────────────────────┐
│ ⚠️ Account Deactivated  │
│ [blurred preview...]    │ ← Blurred
└─────────────────────────┘

Message Area:
┌─────────────────────────┐
│ ⚠️ Account Deactivated   │
│ [blurred message...]    │ ← Blurred, clickable
└─────────────────────────┘
```

### After Clearing Conversation:
```
Conversation List:
┌─────────────────────────┐
│ (Conversation removed)  │ ← Not visible
└─────────────────────────┘

Message Area:
┌─────────────────────────┐
│ (No messages shown)     │ ← Hidden
└─────────────────────────┘
```

---

## Key Points

✅ **User Data:**
- Username anonymized to "Deleted User"
- Email anonymized
- Password removed (cannot log in)
- Profile images deleted
- All preferences/settings deleted

✅ **Messages:**
- **Preserved in database** (not deleted)
- **Visible to receivers** (but blurred)
- **Can be cleared by receiver** (sets deleted_by_receiver = true)
- **After clearing, hidden from receiver** (but still in database)

✅ **Other Users Experience:**
- See "Account Deactivated" instead of real_name
- See account_deactivated.svg instead of profile image
- See blurred messages
- Can click to see "Account Deactivated" notice
- Can choose to clear conversation
- After clearing, conversation disappears from their view

✅ **Database:**
- User record exists (anonymized)
- All messages exist
- Data preserved for compliance/legal reasons
- No hard deletes of messages

---

## Timeline

```
T+0:   User clicks "Delete Account"
T+1:   Confirmation dialogs shown
T+2:   API call made
T+3:   Account anonymized (real_name, email, password)
T+4:   Profile images deleted
T+5:   User data deleted (likes, favorites, etc.)
T+6:   Sessions invalidated
T+7:   User redirected to login
T+8:   Other users see blurred messages
T+9:   (Optional) Receiver clears conversation
T+10:  Conversation hidden from receiver (data still in DB)
```

---

## Security & Privacy

✅ **User Privacy:**
- Personal information removed/anonymized
- Cannot log in after deletion
- Profile not searchable

✅ **Other Users Privacy:**
- Can see conversation history (blurred)
- Can choose to clear conversation
- Messages preserved for their reference

✅ **Data Compliance:**
- Data anonymized, not completely removed
- Messages preserved (may be required for legal reasons)
- User can request complete deletion (future enhancement)


























































































































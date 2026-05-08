# User Deletion Logic - Technical Guide

## Overview

This document explains how user account deletion works in the system. Use this guide to understand, debug, and fix deletion-related issues.

---

## Architecture

### Two Implementations

The deletion logic exists in **two locations** with identical logic:

1. **Main Server**: `services/userManagementService.js` - `deleteUser(userId)`
2. **Admin Server**: `admin-server/services/userManagementService.js` - `deleteUser(userId)`

**Important**: When fixing deletion issues, you must update **both files** to keep them in sync.

---

## Deletion Process Flow

### Step-by-Step Execution

```
1. Validate Database Connection
   ↓
2. Begin Database Transaction
   ↓
3. Get User Info (BEFORE deletion)
   ↓
4. Find Conversation Partners
   ↓
5. Create Deletion Tracking Records
   ↓
6. Delete Physical Files (images, attachments)
   ↓
7. Delete Database Records (24+ tables)
   ↓
8. Commit Transaction
   ↓
9. Clear Cache
   ↓
10. Return Success
```

---

## Detailed Step Breakdown

### Step 1: Database Connection Validation

**Location**: Start of `deleteUser()` method

```javascript
// Check if database pool is available
if (!this.db) {
    throw new Error('Database connection not available');
}

// Verify pool has connect() method
if (typeof this.db.connect !== 'function') {
    throw new Error('Database pool does not have a connect() method');
}

// Get client from pool
const client = await this.db.connect();
```

**Common Issues**:
- ❌ `Database connection not available` → Database not initialized
- ❌ `Database pool does not have a connect() method` → Wrong object type passed
- ❌ `Failed to connect to database` → Pool exhausted or database down

**Fix**: Ensure `UserManagementService` is instantiated with a database pool (not DatabaseManager)

---

### Step 2: Transaction Begin

```javascript
await client.query('BEGIN');
```

**Why**: All deletions happen in a transaction. If any step fails, everything rolls back.

---

### Step 3: Get User Info (CRITICAL - Must be FIRST)

```javascript
const userInfo = await client.query(`
    SELECT id, real_name, email FROM users WHERE id = $1
`, [userId]);

if (userInfo.rows.length === 0) {
    throw new Error('User not found');
}

const { real_name, email } = userInfo.rows[0];
```

**Why First**: We need the real name and email BEFORE deleting the user record. These are stored in `users_deleted` for tracking.

**Common Issues**:
- ❌ `User not found` → User ID doesn't exist or already deleted

---

### Step 4: Find Conversation Partners

```javascript
const conversationPartners = await client.query(`
    SELECT DISTINCT
        CASE 
            WHEN sender_id = $1 THEN receiver_id
            ELSE sender_id
        END as receiver_id
    FROM user_messages
    WHERE sender_id = $1 OR receiver_id = $1
`, [userId]);
```

**Why**: We need to know who had conversations with this user so they can see "Account Deactivated" even after messages are deleted.

**Timing**: Must happen BEFORE deleting messages (Step 5b)

---

### Step 5: Create Deletion Tracking Records

#### 5a. Store in `users_deleted` (Global List)

```javascript
await client.query(`
    INSERT INTO users_deleted (deleted_user_id, real_name, email, deleted_by, created_at)
    VALUES ($1, $2, $3, 'user', NOW())
    ON CONFLICT (deleted_user_id) DO UPDATE
    SET real_name = EXCLUDED.real_name, email = EXCLUDED.email, deleted_by = 'user'
`, [userId, real_name, email]);
```

**Purpose**: One record per deleted user. Stores name/email for reference.

**`deleted_by` values**:
- `'user'` - Self-deletion (from account page)
- `'admin'` - Admin deletion (from admin panel)

#### 5b. Store in `users_deleted_receivers` (Per-Receiver Mapping)

```javascript
for (const partner of conversationPartners.rows) {
    const receiverId = partner.receiver_id;
    if (receiverId && receiverId !== userId) {
        await client.query(`
            INSERT INTO users_deleted_receivers (deleted_user_id, receiver_id, created_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (deleted_user_id, receiver_id) DO NOTHING
        `, [userId, receiverId]);
    }
}
```

**Purpose**: Maps which users should see "Account Deactivated" for this deleted user.

---

### Step 6: Hard Delete All User Data

#### 6a. Delete Message Attachments (Files + Database)

**Physical Files First**:
```javascript
// Get attachment paths
const attachmentsResult = await client.query(`
    SELECT file_path, thumbnail_path 
    FROM user_message_attachments 
    WHERE message_id IN (SELECT id FROM user_messages WHERE sender_id = $1 OR receiver_id = $1)
`, [userId]);

// Delete files using ChatImageHandler
await imageHandler.deleteImageFilesByPaths(file_path, thumbnail_path);
```

**Then Database**:
```javascript
await client.query(`
    DELETE FROM user_message_attachments 
    WHERE message_id IN (SELECT id FROM user_messages WHERE sender_id = $1 OR receiver_id = $1)
`, [userId]);
```

**Why Files First**: If database deletion fails, files are already gone (transaction rollback won't restore files).

#### 6b. Delete Messages

```javascript
await client.query('DELETE FROM user_messages WHERE sender_id = $1 OR receiver_id = $1', [userId]);
```

**Deletes**: All messages where user was sender OR receiver.

#### 6c. Delete Likes

```javascript
await client.query('DELETE FROM users_likes WHERE liked_by = $1 OR liked_user_id = $1', [userId]);
```

**Deletes**: All likes given by user OR received by user.

#### 6d. Delete Profile Views

```javascript
await client.query('DELETE FROM users_profile_views WHERE viewer_id = $1 OR viewed_user_id = $1', [userId]);
```

**Deletes**: All views where user was viewer OR viewed user.

#### 6e. Delete Profile Images (Files + Database)

**Physical Files First**:
```javascript
// Get image file names
const userImagesResult = await client.query(
    'SELECT file_name FROM user_images WHERE user_id = $1',
    [userId]
);

// Delete from filesystem
const profileImagesDir = path.join(__dirname, '..', 'app', 'uploads', 'profile_images');
for (const image of userImagesResult.rows) {
    const imagePath = path.join(profileImagesDir, image.file_name);
    await fs.unlink(imagePath);
    
    // Also delete thumbnails (various naming patterns)
    // _thumb, _thumbnail, .thumb
}
```

**Then Database**:
```javascript
await client.query('DELETE FROM user_images WHERE user_id = $1', [userId]);
```

#### 6f. Delete Other User Data (Bulk Deletions)

```javascript
// Social connections
DELETE FROM users_favorites WHERE favorited_by = $1 OR favorited_user_id = $1
DELETE FROM users_blocked_by_users WHERE blocker_id = $1 OR blocked_id = $1

// Profile data
DELETE FROM user_attributes WHERE user_id = $1
DELETE FROM user_preferences WHERE user_id = $1

// Sessions & matches
DELETE FROM user_sessions WHERE user_id = $1
DELETE FROM user_matches WHERE user1_id = $1 OR user2_id = $1

// Activity & reports
DELETE FROM user_activity WHERE user_id = $1 OR target_user_id = $1
DELETE FROM user_reports WHERE reporter_id = $1 OR reported_user_id = $1

// Cache & conversation management
DELETE FROM user_compatibility_cache WHERE user_id = $1 OR target_user_id = $1
DELETE FROM user_conversation_removals WHERE remover_id = $1 OR removed_user_id = $1
```

#### 6g. Cascade Cleanup

```javascript
// Remove orphaned records where this user was a receiver
DELETE FROM users_deleted_receivers WHERE receiver_id = $1
```

**Why**: When user is deleted, they can no longer see other deleted users.

#### 6h. Delete Optional Settings Tables

These are wrapped in try-catch because tables might not exist:

```javascript
try {
    DELETE FROM user_profile_settings WHERE user_id = $1
} catch (e) {
    // Table might not exist, ignore
}
```

**Optional Tables**:
- `user_profile_settings`
- `user_measurement_preferences`
- `user_contact_countries`
- `user_languages`
- `user_location_history`
- `user_name_change_history`

**Important**: If a table doesn't exist, deletion continues (not an error).

#### 6i. Delete User Record (FINAL STEP)

```javascript
DELETE FROM users WHERE id = $1
```

**Must be Last**: After all related data is deleted.

---

### Step 7: Commit Transaction

```javascript
await client.query('COMMIT');
```

**If any step fails**: Transaction automatically rolls back, user account remains intact.

---

### Step 8: Clear Cache

```javascript
if (this.redis && typeof this.redis.del === 'function') {
    try {
        await this.redis.del(`user:${userId}`);
    } catch (e) {
        // Ignore cache errors
    }
}
```

**Why**: Remove cached user data from Redis.

---

### Step 9: Release Database Client

```javascript
finally {
    client.release();
}
```

**Always executes**: Even if deletion fails, client is released back to pool.

---

## Tables Deleted From (24 Tables)

### Core Tables (Always Deleted)
1. `users` - Main user record (LAST)
2. `user_attributes` - Profile attributes
3. `user_preferences` - Preferences
4. `user_images` - Profile images
5. `user_sessions` - Sessions
6. `user_messages` - Messages
7. `user_message_attachments` - Message attachments
8. `users_likes` - Likes
9. `users_profile_views` - Profile views
10. `users_favorites` - Favorites
11. `user_matches` - Matches
12. `users_blocked_by_users` - Blocks
13. `user_reports` - Reports
14. `user_activity` - Activity
15. `user_compatibility_cache` - Compatibility cache
16. `user_conversation_removals` - Conversation removals
17. `users_deleted_receivers` - Deleted user receiver mappings

### Optional Tables (Try-Catch Wrapped)
18. `user_profile_settings`
19. `user_measurement_preferences`
20. `user_contact_countries`
21. `user_languages`
22. `user_location_history`
23. `user_name_change_history`

### Tables That Should NOT Be Deleted
- ❌ `activity_logs` - **REMOVED** (table doesn't exist)
- ❌ `users_deleted` - **CREATED** (not deleted, stores deletion record)

---

## Tables Created (For Tracking)

### `users_deleted`
**Purpose**: Global list of deleted users
**Fields**:
- `deleted_user_id` (PK)
- `real_name` - Preserved from before deletion
- `email` - Preserved from before deletion
- `deleted_by` - 'user' or 'admin'
- `created_at` - Deletion timestamp

### `users_deleted_receivers`
**Purpose**: Maps which users should see deleted users
**Fields**:
- `deleted_user_id` (FK)
- `receiver_id` (FK)
- `created_at`

---

## Physical Files Deleted

### Profile Images
- **Location**: `app/uploads/profile_images/`
- **Files**: All images uploaded by user
- **Thumbnails**: Deleted with patterns: `_thumb`, `_thumbnail`, `.thumb`

### Message Attachments
- **Location**: Server storage (handled by ChatImageHandler)
- **Files**: All attachment files and thumbnails

**Note**: File deletion happens BEFORE database deletion. If transaction rolls back, files are already gone (this is intentional - files can't be rolled back).

---

## Error Handling

### Transaction Rollback

```javascript
try {
    // ... all deletion steps ...
    await client.query('COMMIT');
} catch (error) {
    await client.query('ROLLBACK');
    throw error;
} finally {
    client.release();
}
```

**If any error occurs**:
1. Transaction rolls back
2. All database changes are undone
3. User account remains intact
4. Error is re-thrown for logging

### Optional Table Handling

```javascript
try {
    await client.query('DELETE FROM optional_table WHERE user_id = $1', [userId]);
} catch (e) {
    // Table might not exist, ignore
}
```

**Why**: Some tables might not exist in all database schemas. Deletion continues if table is missing.

---

## Common Issues & Fixes

### Issue 1: "relation 'activity_logs' does not exist"

**Error**: `DatabaseError: relation "activity_logs" does not exist`

**Cause**: Code tries to delete from non-existent table.

**Fix**: Remove the deletion line:
```javascript
// REMOVE THIS:
await client.query('DELETE FROM activity_logs WHERE user_id = $1', [userId]);
```

**Files to Update**:
- `services/userManagementService.js`
- `admin-server/services/userManagementService.js`

---

### Issue 2: "Database pool does not have a connect() method"

**Error**: `Database pool does not have a connect() method`

**Cause**: `UserManagementService` was instantiated with wrong object type.

**Fix**: Ensure you pass the pool, not DatabaseManager:
```javascript
// ❌ WRONG:
const userManagementService = new UserManagementService(databaseManager, redisManager);

// ✅ CORRECT:
const dbPool = databaseManager.getPool();
const userManagementService = new UserManagementService(dbPool, redisManager);
```

---

### Issue 3: "User not found"

**Error**: `User not found`

**Cause**: User ID doesn't exist or user already deleted.

**Fix**: Check if user exists before calling deleteUser:
```javascript
const user = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
if (user.rows.length === 0) {
    return { success: false, error: 'User not found' };
}
```

---

### Issue 4: Transaction Timeout

**Error**: Request hangs or times out

**Cause**: Large user with many records taking too long to delete.

**Fix**: 
1. Check database performance
2. Add indexes on foreign keys
3. Consider batch deletion for very large datasets

---

### Issue 5: Files Not Deleted

**Error**: Database records deleted but files remain

**Cause**: File deletion happens before transaction commit. If transaction fails, files are already gone.

**Fix**: This is by design. Files are deleted first because:
- File operations can't be rolled back
- If database deletion fails, user account remains (transaction rollback)
- Files are cleaned up even if database operation fails

---

## Debugging Deletion Issues

### Step 1: Check Server Logs

Look for these log messages:
```
🗑️  deleteUser called for userId: {userId}
🔗 Database type: {type}, has connect: {boolean}
🔗 Attempting to get database client from pool...
✅ Database client obtained successfully
```

### Step 2: Check Database Connection

```javascript
// In deleteAccount controller:
console.log(`🔗 Database pool obtained. Type: ${typeof dbPool}, has connect: ${typeof dbPool.connect === 'function'}`);
```

### Step 3: Check Transaction Status

Add logging before COMMIT:
```javascript
console.log('✅ All deletions completed, committing transaction...');
await client.query('COMMIT');
console.log('✅ Transaction committed successfully');
```

### Step 4: Verify Tables Exist

Use the test script:
```bash
node scripts/list-database-tables.js
```

This shows which tables exist and which are missing.

---

## Testing Deletion

### Test Script

Use the standalone test utility:
```bash
# Dry run (no changes)
node scripts/test-user-deletion.js --dry-run <user_id>

# Actual deletion
node scripts/test-user-deletion.js <user_id>
```

### Manual Testing Checklist

1. ✅ User exists in database
2. ✅ User has messages, images, likes, etc.
3. ✅ Deletion completes without errors
4. ✅ User record removed from `users` table
5. ✅ Record created in `users_deleted` table
6. ✅ All related data deleted
7. ✅ Physical files deleted
8. ✅ Other users see "Account Deactivated"

---

## Maintenance Checklist

When adding new user-related tables:

1. ✅ Add deletion to `deleteUser()` in **both** files:
   - `services/userManagementService.js`
   - `admin-server/services/userManagementService.js`

2. ✅ Decide if table is:
   - **Required**: Delete without try-catch
   - **Optional**: Wrap in try-catch

3. ✅ Update this documentation

4. ✅ Test deletion with new table

5. ✅ Update `scripts/list-database-tables.js` if needed

---

## Key Principles

1. **Transaction Safety**: All deletions in one transaction
2. **Files First**: Delete files before database (can't rollback files)
3. **User Info First**: Get name/email before deleting user record
4. **Tracking Records**: Create deletion records before deleting user
5. **Graceful Degradation**: Optional tables wrapped in try-catch
6. **Always Release**: Client always released in finally block

---

## Related Files

- **Main Implementation**: `services/userManagementService.js`
- **Admin Implementation**: `admin-server/services/userManagementService.js`
- **Controller**: `database/controllers/authController.js` - `deleteAccount()`
- **Route**: `routers/authRoutes.js` - `DELETE /api/account/delete`
- **Frontend**: `app/assets/js/account-delete.js`
- **Test Script**: `scripts/test-user-deletion.js`
- **Table List Script**: `scripts/list-database-tables.js`
- **Documentation**: `docs/ACCOUNT_DELETION_SUMMARY.md`

---

## Version History

- **2025-01-XX**: Removed `activity_logs` table deletion (table doesn't exist)
- **2025-01-XX**: Added comprehensive error handling and logging
- **2025-01-XX**: Created this documentation

---

## Quick Reference

### Delete User (Main Server)
```javascript
const UserManagementService = require('./services/userManagementService');
const dbPool = databaseManager.getPool();
const userManagementService = new UserManagementService(dbPool, redisManager);
const result = await userManagementService.deleteUser(userId);
```

### Delete User (Admin Server)
```javascript
const UserManagementService = require('./services/userManagementService');
const result = await userManagementService.deleteUser(userId);
```

### Check What Gets Deleted
```bash
node scripts/list-database-tables.js
```

### Test Deletion
```bash
node scripts/test-user-deletion.js --dry-run <user_id>
```

---

**Remember**: Always update **both** deletion implementations when making changes!






















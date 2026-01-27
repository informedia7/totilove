# Totilove Database Schema

## Overview

This document describes the complete database schema for the Totilove application, including all tables, columns, relationships, and recent table renames.

**Last Updated:** 2024  
**Note:** Several tables have been renamed to follow a consistent naming convention.

---

## Table Naming Convention

The database follows these naming conventions:
- **User relationship tables:** `users_*` (e.g., `users_likes`, `users_favorites`, `users_profile_views`)
- **User entity tables:** `user_*` (e.g., `user_messages`, `user_matches`, `user_attributes`)
- **Admin tables:** `admin_*` (e.g., `admin_users`, `admin_blacklisted_users`)

---

## Core Tables

### 1. `users`
Main user accounts table.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `real_name` (VARCHAR)
- `email` (VARCHAR)
- `password` (VARCHAR) - Hashed password
- `birthdate` (DATE)
- `gender` (VARCHAR) - 'M', 'F', or other
- `country_id` (INTEGER) - Foreign key to `country.id`
- `state_id` (INTEGER) - Foreign key to `state.id`
- `city_id` (INTEGER) - Foreign key to `city.id`
- `date_joined` (TIMESTAMP)
- `last_login` (TIMESTAMP)
- `last_seen_at` (TIMESTAMP WITH TIME ZONE) - Last activity timestamp used for presence history
- `previous_login` (TIMESTAMP) - Previous login timestamp (before last_login)
- `email_verified` (BOOLEAN) - Email verification status
- `profile_verified` (BOOLEAN) - Profile verification status
- `is_banned` (BOOLEAN)
- `banned_reason` (TEXT)
- `banned_at` (TIMESTAMP)
- `status` (VARCHAR) - User status

**Key Relationships:**
- References `country`, `state`, `city` tables
- Referenced by all user-related tables via `user_id` foreign keys

---

### 2. `users_profile_views`
Stores profile view relationships between users.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `viewer_id` (INTEGER) - Foreign key to `users.id` (who viewed)
- `viewed_user_id` (INTEGER) - Foreign key to `users.id` (who was viewed)
- `viewed_at` (TIMESTAMP) - When the profile was viewed

**Constraints:**
- Unique constraint on `(viewer_id, viewed_user_id)`
- Foreign keys with CASCADE delete

**Indexes:**
- `idx_users_profile_views_viewer_id`
- `idx_users_profile_views_viewed_user_id`
- `idx_users_profile_views_viewed_at`
- `idx_users_profile_views_viewed_user_viewed_at`

**Note:** Previously named `profile_views`. Renamed for consistency.

---

### 3. `users_favorites`
Stores favorite relationships between users.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `favorited_by` (INTEGER) - Foreign key to `users.id` (who favorited)
- `favorited_user_id` (INTEGER) - Foreign key to `users.id` (who was favorited)
- `favorited_date` (TIMESTAMP) - When the favorite was added

**Constraints:**
- Unique constraint on `(favorited_by, favorited_user_id)`
- Foreign keys with CASCADE delete

**Indexes:**
- `idx_users_favorites_favorited_by`
- `idx_users_favorites_favorited_user_id`
- `idx_users_favorites_favorited_date`

**Note:** Previously named `favorites`. Renamed for consistency.

---

### 4. `users_favorites_backup`
Backup table for favorites before deletion during user blocking.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `favorited_by` (INTEGER)
- `favorited_user_id` (INTEGER)
- `favorited_date` (TIMESTAMP)
- `blocked_at` (TIMESTAMP)
- `blocker_id` (INTEGER)
- `blocked_id` (INTEGER)

**Note:** Previously named `favorites_backup`. Renamed for consistency.

---

### 5. `users_likes`
Stores like relationships between users.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `liked_by` (INTEGER) - Foreign key to `users.id` (who liked)
- `liked_user_id` (INTEGER) - Foreign key to `users.id` (who was liked)
- `created_at` (TIMESTAMP) - When the like was created

**Constraints:**
- Unique constraint on `(liked_by, liked_user_id)`
- Foreign keys with CASCADE delete

**Indexes:**
- `idx_users_likes_liked_by`
- `idx_users_likes_liked_user_id`
- `idx_users_likes_created_at`

**Note:** Previously named `likes`. Renamed for consistency.

---

### 6. `users_likes_backup`
Backup table for likes before deletion during user blocking.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `liked_by` (INTEGER)
- `liked_user_id` (INTEGER)
- `created_at` (TIMESTAMP)
- `blocked_at` (TIMESTAMP)
- `blocker_id` (INTEGER)
- `blocked_id` (INTEGER)

**Note:** Previously named `likes_backup`. Renamed for consistency.

---

### 7. `user_matches`
Stores mutual like relationships (matches) between users.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user1_id` (INTEGER) - Foreign key to `users.id`
- `user2_id` (INTEGER) - Foreign key to `users.id`
- `match_date` (TIMESTAMP) - When the match occurred
- `status` (VARCHAR) - Match status (e.g., 'active', 'inactive')

**Constraints:**
- Unique constraint on `(user1_id, user2_id)`
- Foreign keys with CASCADE delete

**Indexes:**
- `idx_user_matches_user1_id`
- `idx_user_matches_user2_id`
- `idx_user_matches_match_date`

**Note:** Previously named `matches`. Renamed for consistency.

---

### 8. `user_messages`
Stores messages between users.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `sender_id` (INTEGER) - Foreign key to `users.id`
- `receiver_id` (INTEGER) - Foreign key to `users.id`
- `message` (TEXT) - Message content
- `timestamp` (TIMESTAMP WITH TIME ZONE) - When message was sent
- `status` (VARCHAR) - Message status ('sent', 'delivered', 'read')
- `read_at` (TIMESTAMP WITH TIME ZONE) - When message was read
- `recall_type` (VARCHAR) - Recall type ('none', 'soft', 'hard')
- `recalled_at` (TIMESTAMP WITH TIME ZONE) - When message was recalled
- `attachment_count` (INTEGER) - Number of attachments
- `saved` (BOOLEAN) - Legacy saved flag
- `saved_by_sender` (BOOLEAN) - Saved by sender flag
- `saved_by_receiver` (BOOLEAN) - Saved by receiver flag
- `deleted_by_sender` (BOOLEAN) - Soft delete flag for sender
- `deleted_by_receiver` (BOOLEAN) - Soft delete flag for receiver
- `deleted_at` (TIMESTAMP WITH TIME ZONE) - When message was deleted
- `is_read` (BOOLEAN) - Read status flag
- `message_type` (VARCHAR) - Message type ('text', 'image', 'like')
- `reply_to_id` (INTEGER) - Foreign key to `user_messages.id` (self-referencing)
- `reply_to_text` (TEXT) - Snapshot of replied message text
- `reply_to_sender` (INTEGER) - Foreign key to `users.id` (original sender)

**Constraints:**
- Foreign keys to `users` with CASCADE delete
- Self-referencing foreign key on `reply_to_id` with SET NULL on delete

**Indexes:**
- `idx_user_messages_sender_id`
- `idx_user_messages_receiver_id`
- `idx_user_messages_timestamp`
- `idx_user_messages_sender_receiver`
- `idx_user_messages_status`
- `idx_user_messages_message_type`
- `idx_user_messages_reply_to_id`
- `idx_user_messages_read_at`
- `idx_user_messages_deleted_by_sender`
- `idx_user_messages_deleted_by_receiver`

**Note:** Previously named `messages`. Renamed for consistency.

---

### 9. `user_message_attachments`
Stores attachments (images, files) associated with messages.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `message_id` (INTEGER) - Foreign key to `user_messages.id`
- `attachment_type` (VARCHAR) - Type of attachment ('image', 'file')
- `original_filename` (VARCHAR) - Original filename
- `stored_filename` (VARCHAR) - Filename as stored on server
- `file_path` (VARCHAR) - Path to file
- `thumbnail_path` (VARCHAR) - Path to thumbnail (if image)
- `file_size` (INTEGER) - File size in bytes
- `mime_type` (VARCHAR) - MIME type
- `width` (INTEGER) - Image width (if image)
- `height` (INTEGER) - Image height (if image)
- `uploaded_at` (TIMESTAMP) - When attachment was uploaded
- `uploaded_by` (INTEGER) - Foreign key to `users.id`
- `is_deleted` (BOOLEAN) - Soft delete flag
- `is_missing` (BOOLEAN) - Flag if file is missing from disk
- `last_verified` (TIMESTAMP) - Last time file existence was verified

**Constraints:**
- Foreign key to `user_messages.id` with CASCADE delete
- Foreign key to `users.id` with CASCADE delete

**Indexes:**
- `idx_user_message_attachments_message_id`
- `idx_user_message_attachments_uploaded_by`
- `idx_user_message_attachments_is_deleted`

**Note:** Previously named `message_attachments`. Renamed for consistency.

---

### 10. `users_blocked_by_users`
Stores users who have blocked other users.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `blocker_id` (INTEGER) - Foreign key to `users.id` (who blocked)
- `blocked_id` (INTEGER) - Foreign key to `users.id` (who was blocked)
- `blocked_at` (TIMESTAMP) - When the block occurred
- `block_reason` (TEXT) - Reason for blocking (optional)

**Constraints:**
- Unique constraint on `(blocker_id, blocked_id)`
- Foreign keys with CASCADE delete

**Indexes:**
- `idx_users_blocked_by_users_blocker_id`
- `idx_users_blocked_by_users_blocked_id`
- `idx_users_blocked_by_users_unique_block`

**Note:** Previously named `blocked_users`. Renamed to clarify relationship direction.

---

### 11. `user_location_history`
Tracks all location changes made by users.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER) - Foreign key to `users.id`
- `old_country_id` (INTEGER) - Previous country ID (NULL on first set)
- `old_state_id` (INTEGER) - Previous state ID (NULL if no state)
- `old_city_id` (INTEGER) - Previous city ID (NULL if no city)
- `new_country_id` (INTEGER) - New country ID (required)
- `new_state_id` (INTEGER) - New state ID (NULL if no state)
- `new_city_id` (INTEGER) - New city ID (NULL if no city)
- `changed_at` (TIMESTAMP) - When location was changed
- `ip_address` (VARCHAR) - IP address from which change was made
- `user_agent` (TEXT) - User agent string from browser

**Constraints:**
- Foreign key to `users.id` with CASCADE delete
- Foreign keys to `country`, `state`, `city` tables

**Indexes:**
- `idx_user_location_history_user_id`
- `idx_user_location_history_changed_at`
- `idx_user_location_history_user_changed_at`

**Purpose:**
- Audit trail for location changes
- Rate limiting (max 1 change per 30 days)
- Security tracking

---

### 12. `email_verification_tokens`
Stores email verification tokens and codes.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER) - Foreign key to `users.id`
- `token` (VARCHAR) - Unique verification token (32-byte hex)
- `verification_code` (VARCHAR) - 6-digit verification code
- `expires_at` (TIMESTAMP) - Token expiration (24 hours)
- `created_at` (TIMESTAMP) - Token creation timestamp
- `used_at` (TIMESTAMP) - When token was used (NULL if unused)

**Constraints:**
- Unique constraint on `token`
- Foreign key to `users.id` with CASCADE delete

**Indexes:**
- `idx_email_verification_tokens_token`
- `idx_email_verification_tokens_user_id`
- `idx_email_verification_tokens_expires_at`

---

### 13. `admin_blacklisted_users`
Stores users who have been blacklisted/banned by administrators.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER) - Foreign key to `users.id`
- `email` (VARCHAR) - Email at time of blacklisting
- `admin_id` (INTEGER) - Foreign key to `admin_users.id`
- `reason` (TEXT) - Reason for blacklisting
- `status` (VARCHAR) - Status: 'active' or 'removed'
- `ip_address` (VARCHAR) - IP from admin action
- `user_ip_address` (VARCHAR) - IP of blacklisted user
- `user_agent` (TEXT) - User agent string
- `notes` (TEXT) - Internal admin notes
- `blacklisted_at` (TIMESTAMP) - When user was blacklisted
- `removed_at` (TIMESTAMP) - When blacklist was removed
- `removed_by` (INTEGER) - Foreign key to `admin_users.id`
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Constraints:**
- Foreign key to `users.id` with CASCADE delete
- Foreign key to `admin_users.id` with SET NULL on delete
- Unique constraint on `(user_id)` WHERE `status = 'active'`

**Indexes:**
- `idx_admin_blacklisted_users_user_id`
- `idx_admin_blacklisted_users_email`
- `idx_admin_blacklisted_users_admin_id`
- `idx_admin_blacklisted_users_status`
- `idx_admin_blacklisted_users_user_status`
- `idx_admin_blacklisted_users_user_ip`

**Note:** Permanent blacklisting (no expiration columns).

---

### 14. `user_images`
Stores user profile and gallery images.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER) - Foreign key to `users.id`
- `file_name` (VARCHAR) - Filename
- `is_profile` (BOOLEAN) - Is profile image flag
- `uploaded_at` (TIMESTAMP) - Upload timestamp
- `order` (INTEGER) - Display order

**Constraints:**
- Foreign key to `users.id` with CASCADE delete

---

### 15. `user_attributes`
Stores additional user profile attributes.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER) - Foreign key to `users.id`
- `about_me` (TEXT) - User bio/about section
- `height_cm` (INTEGER) - Height in centimeters
- `weight_kg` (INTEGER) - Weight in kilograms
- Various preference IDs (smoking, drinking, exercise, etc.)

**Constraints:**
- Foreign key to `users.id` with CASCADE delete

---

### 16. `user_preferences`
Stores user preferences and settings.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER) - Foreign key to `users.id`
- Various preference settings
- `relationship_type` (VARCHAR) - Relationship preference

**Constraints:**
- Foreign key to `users.id` with CASCADE delete

---

### 17. `user_sessions`
Stores user session information.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER) - Foreign key to `users.id`
- `session_token` (VARCHAR) - Session token
- `is_active` (BOOLEAN) - Whether session is currently active
- `last_activity` (TIMESTAMP) - Last activity timestamp (used for online status)
- `created_at` (TIMESTAMP)
- `expires_at` (TIMESTAMP)
- `ip_address` (VARCHAR)
- `user_agent` (TEXT)

**Constraints:**
- Foreign key to `users.id` with CASCADE delete

**Indexes:**
- Indexes on `user_id`, `session_token`, `is_active`, `last_activity` for performance

---

### 18. `users_deleted`
Global list of deleted users (no receiver_id).

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `deleted_user_id` (INTEGER) - Unique identifier for deleted user
- `real_name` (VARCHAR) - Username at time of deletion
- `email` (VARCHAR) - Email at time of deletion
- `deleted_by` (VARCHAR(20)) - Who deleted the user: 'admin' or 'user'
- `created_at` (TIMESTAMP) - When user was deleted

**Constraints:**
- Unique constraint on `deleted_user_id`

**Indexes:**
- `idx_users_deleted_deleted_user`

**Purpose:** Allows users to see "Account Deactivated" for deleted users in their conversation lists.

---

### 19. `users_deleted_receivers`
Maps deleted users to receivers who should see them.

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `deleted_user_id` (INTEGER) - Reference to deleted user
- `receiver_id` (INTEGER) - Foreign key to `users.id` (who should see deleted user)
- `created_at` (TIMESTAMP)

**Constraints:**
- Unique constraint on `(deleted_user_id, receiver_id)`
- Foreign key to `users.id` with CASCADE delete

**Purpose:** Tracks which users should see "Account Deactivated" for specific deleted users.

---

## Reference Tables

### Geographic Tables

- `country` - Country names and codes
- `state` - State/province names (references `country`)
- `city` - City names (references `state`)

### Preference Tables

- `body_type` - Body type options
- `eye_color` - Eye color options
- `hair_color` - Hair color options
- `ethnicity` - Ethnicity options
- `religion` - Religion options
- `education` - Education level options
- `occupation` - Occupation options
- `income` - Income range options
- `lifestyle` - Lifestyle options
- `living_situation` - Living situation options
- `marital_status` - Marital status options
- `relationship_types` - Relationship type options

---

## Table Renaming Summary

The following tables were renamed for consistency:

| Old Name | New Name | Migration File |
|----------|----------|----------------|
| `blocked_users` | `users_blocked_by_users` | `rename_blocked_users_to_users_blocked_by_users.sql` |
| `profile_views` | `users_profile_views` | `rename_profile_views_to_users_profile_views.sql` |
| `favorites` | `users_favorites` | `rename_favorites_to_users_favorites.sql` |
| `favorites_backup` | `users_favorites_backup` | `rename_favorites_backup_to_users_favorites_backup.sql` |
| `likes` | `users_likes` | `rename_likes_to_users_likes.sql` |
| `likes_backup` | `users_likes_backup` | `rename_likes_backup_to_users_likes_backup.sql` |
| `matches` | `user_matches` | `rename_matches_to_user_matches.sql` |
| `message_attachments` | `user_message_attachments` | `rename_message_attachments_to_user_message_attachments.sql` |
| `messages` | `user_messages` | `rename_messages_to_user_messages.sql` |

**Important:** All code references have been updated to use the new table names. If you encounter any errors, check for remaining references to old table names.

---

## Foreign Key Relationships

### Users → Related Tables (CASCADE DELETE)

When a user is deleted, the following are automatically deleted:
- `users_profile_views` (where viewer_id or viewed_user_id = user.id)
- `users_favorites` (where favorited_by or favorited_user_id = user.id)
- `users_likes` (where liked_by or liked_user_id = user.id)
- `user_matches` (where user1_id or user2_id = user.id)
- `user_messages` (where sender_id or receiver_id = user.id)
- `user_message_attachments` (via user_messages cascade)
- `users_blocked_by_users` (where blocker_id or blocked_id = user.id)
- `user_location_history` (where user_id = user.id)
- `email_verification_tokens` (where user_id = user.id)
- `user_images` (where user_id = user.id)
- `user_attributes` (where user_id = user.id)
- `user_preferences` (where user_id = user.id)
- `user_sessions` (where user_id = user.id)
- `users_deleted_receivers` (where receiver_id = user.id)

### User Messages → Message Attachments (CASCADE DELETE)

When a message is deleted, all its attachments are automatically deleted.

---

## Indexes

All tables have appropriate indexes for:
- Primary keys (automatic)
- Foreign keys
- Frequently queried columns (timestamps, user IDs, status flags)
- Composite indexes for common query patterns

---

## Constraints

### Unique Constraints

- `users_blocked_by_users`: `(blocker_id, blocked_id)`
- `users_profile_views`: `(viewer_id, viewed_user_id)`
- `users_favorites`: `(favorited_by, favorited_user_id)`
- `users_likes`: `(liked_by, liked_user_id)`
- `user_matches`: `(user1_id, user2_id)`
- `users_deleted`: `(deleted_user_id)`
- `users_deleted_receivers`: `(deleted_user_id, receiver_id)`
- `email_verification_tokens`: `(token)`
- `admin_blacklisted_users`: `(user_id)` WHERE `status = 'active'`

### Check Constraints

- `admin_blacklisted_users.status`: Must be 'active' or 'removed'

---

## Migration Files

All table renames have corresponding migration files in `database/migrations/`. These migrations:
- Check if new table exists (skip if yes)
- Check if old table exists (rename if yes)
- Create new table if neither exists
- Rename indexes
- Update foreign key constraints
- Add proper indexes

Run migrations in order if setting up a new database.

---

## Notes

1. **Soft Deletes:** Several tables use soft delete flags (`deleted_by_sender`, `deleted_by_receiver`, `is_deleted`) instead of hard deletes.

2. **Cascade Deletes:** Most user-related tables use CASCADE delete to ensure data consistency when users are deleted.

3. **Audit Trails:** Tables like `user_location_history` and `admin_blacklisted_users` maintain audit trails with IP addresses and timestamps.

4. **Backup Tables:** `users_favorites_backup` and `users_likes_backup` are used to restore data when users unblock each other.

5. **Status Flags:** Many tables use status flags (`status`, `is_*`, `*_by_*`) for flexible state management without hard deletes.

---

## Query Examples

### Get user's message count
```sql
SELECT COUNT(*) 
FROM user_messages 
WHERE sender_id = $1 OR receiver_id = $1;
```

### Get user's like count
```sql
SELECT COUNT(*) 
FROM users_likes 
WHERE liked_user_id = $1;
```

### Get user's profile views
```sql
SELECT COUNT(*) 
FROM users_profile_views 
WHERE viewed_user_id = $1;
```

### Get user's matches
```sql
SELECT * 
FROM user_matches 
WHERE user1_id = $1 OR user2_id = $1;
```

---

**Document Version:** 1.0  
**Last Updated:** 2024



























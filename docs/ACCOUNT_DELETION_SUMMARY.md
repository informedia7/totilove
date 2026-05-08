# Account Deletion Summary

## What Gets Deleted When a User Deletes Their Account

This document lists all data that is permanently deleted when a user deletes their account.

---

## Deletion Process Overview

The deletion process follows these steps:
1. **Preserve user info** - Store user's name and email before deletion
2. **Track conversation partners** - Identify who had conversations with this user
3. **Create deletion records** - Store records so others can see "Account Deactivated"
4. **Hard delete all user data** - Permanently remove all user-related data
5. **Delete physical files** - Remove uploaded images and attachments
6. **Final cleanup** - Remove the user record itself

---

## Tables with Data Deleted

### 1. Message Data
- **`user_message_attachments`** - All message attachments (files and thumbnails)
  - Deletes: All attachments for messages where user was sender or receiver
  - Physical files: Also deleted from server storage
  
- **`user_messages`** - All messages
  - Deletes: All messages where user was sender OR receiver
  - Note: This removes the entire conversation history

### 2. Social Interactions
- **`users_likes`** - All likes
  - Deletes: All likes given by user OR received by user
  
- **`users_profile_views`** - All profile views
  - Deletes: All views where user was viewer OR viewed user
  
- **`users_favorites`** - All favorites
  - Deletes: All favorites where user favorited someone OR was favorited
  
- **`user_matches`** - All matches
  - Deletes: All matches where user is user1_id OR user2_id

### 3. User Profile Data
- **`user_images`** - All profile images
  - Deletes: All profile photos uploaded by user
  - Physical files: Also deleted from `app/uploads/profile_images/` directory
  - Thumbnails: Also deleted (with various naming patterns)

- **`user_attributes`** - User profile attributes
  - Deletes: All attribute data for the user

- **`user_preferences`** - User preferences
  - Deletes: All preference settings

### 4. Account & Session Data
- **`user_sessions`** - All active sessions
  - Deletes: All session records for the user
  
- **`users`** - User account record
  - Deletes: The main user record (FINAL STEP)

### 5. Blocking & Reporting
- **`users_blocked_by_users`** - All blocking relationships
  - Deletes: All blocks where user blocked someone OR was blocked
  
- **`user_reports`** - All reports
  - Deletes: All reports where user reported someone OR was reported

### 6. Activity & Analytics
- **`user_activity`** - All activity records
  - Deletes: All activity where user was actor OR target
  
- **`user_compatibility_cache`** - Compatibility calculations
  - Deletes: All cached compatibility data for the user

### 7. Conversation Management
- **`user_conversation_removals`** - Conversation removal records
  - Deletes: All records where user removed conversations OR had conversations removed

### 8. Deleted User Tracking
- **`users_deleted_receivers`** - Receiver mappings for deleted users
  - Deletes: All records where this user was a receiver (they can no longer see deleted users)

### 9. Optional Settings Tables (Gracefully Handled)
These tables are deleted if they exist, but deletion continues if they don't:
- **`user_profile_settings`** - Additional profile settings
- **`user_measurement_preferences`** - Measurement unit preferences
- **`user_contact_countries`** - Contact country preferences
- **`user_languages`** - Language preferences
- **`user_location_history`** - Location history
- **`user_name_change_history`** - Name change history

---

## Data That is CREATED (Not Deleted)

### Deletion Tracking Tables
- **`users_deleted`** - Creates a record with:
  - `deleted_user_id` - The user's ID
  - `real_name` - User's name (preserved)
  - `email` - User's email (preserved)
  - `deleted_by` - Set to 'user' (self-deletion)
  - `created_at` - Timestamp of deletion

- **`users_deleted_receivers`** - Creates records for each conversation partner:
  - `deleted_user_id` - The deleted user's ID
  - `receiver_id` - ID of user who had conversations with deleted user
  - `created_at` - Timestamp

**Purpose**: These records allow other users to see "Account Deactivated" in their conversation list even after all messages are deleted.

---

## Physical Files Deleted

### Profile Images
- Location: `app/uploads/profile_images/`
- Files deleted:
  - All profile image files
  - All thumbnail files (various naming patterns: `_thumb`, `_thumbnail`, `.thumb`)

### Message Attachments
- Location: Server storage (handled by ChatImageHandler)
- Files deleted:
  - All attachment files
  - All thumbnail files for attachments

---

## What Happens to Other Users

### Conversation Partners
- Other users will see "Account Deactivated" in their conversation list
- They cannot send new messages to the deleted account
- Historical messages are removed (both sides)

### Matches
- All matches with the deleted user are removed
- Other users will no longer see the deleted user in their matches

### Likes
- All likes (given and received) are removed
- Other users' like counts may decrease

---

## Transaction Safety

All deletions happen within a database transaction:
- If any step fails, **all changes are rolled back**
- User account remains intact if deletion fails
- Ensures data consistency

---

## Summary Statistics

**Total Tables with Hard Deletes**: 24+ tables
**Physical Files Deleted**: Profile images + Message attachments
**Records Created**: 2 tables (for tracking deleted users)
**Transaction Protected**: Yes

---

## Notes

- The deletion is **permanent** and **irreversible**
- No data recovery is possible after deletion
- The user's ID is preserved in `users_deleted` for reference
- Other users can still see that they had conversations with this user (as "Account Deactivated")






















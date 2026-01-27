# Database Schema Notes for Image Routes

## Current Schema Status

### Documented Schema (from `database/DATABASE_SCHEMA.md`)
The `user_images` table is documented as having:
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER)
- `file_name` (VARCHAR)
- `is_profile` (BOOLEAN)
- `uploaded_at` (TIMESTAMP)
- `order` (INTEGER)

### Actual Code Usage
The code uses these columns:
- ✅ `id` - Required
- ✅ `user_id` - Required
- ✅ `file_name` - Required
- ✅ `is_profile` - Required
- ✅ `uploaded_at` - Required
- ⚠️ `featured` - **Used but not documented** (needs migration)
- ⚠️ `metadata` - **Used but not documented** (needs migration)

## Migration Required

### Run This Migration
Execute the SQL file to add missing columns:
```bash
psql -d your_database -f database/migrations/add_featured_and_metadata_to_user_images.sql
```

Or manually run:
```sql
-- Add featured column
ALTER TABLE user_images 
ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;

-- Add metadata column
ALTER TABLE user_images 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add thumbnail_path column (optional)
ALTER TABLE user_images 
ADD COLUMN IF NOT EXISTS thumbnail_path VARCHAR(500);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_user_images_featured 
ON user_images(featured) WHERE featured = true;

CREATE INDEX IF NOT EXISTS idx_user_images_metadata 
ON user_images USING GIN (metadata);
```

## Code Compatibility

### ✅ Works Without Migration
The code has **graceful fallbacks** and will work even if columns don't exist:

1. **If `featured` column doesn't exist:**
   - INSERT will fallback to basic columns
   - UPDATE will return error (but won't crash)
   - SELECT will work (featured will be undefined/false)

2. **If `metadata` column doesn't exist:**
   - INSERT will fallback to columns without metadata
   - Metadata will still be extracted and returned in API response
   - Just won't be stored in database

### Recommended Schema

For full functionality, the `user_images` table should have:

```sql
CREATE TABLE user_images (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    is_profile BOOLEAN DEFAULT false,
    featured BOOLEAN DEFAULT false,           -- NEW
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER DEFAULT 0,
    metadata JSONB,                            -- NEW
    thumbnail_path VARCHAR(500)               -- NEW (optional)
);

-- Indexes
CREATE INDEX idx_user_images_user_id ON user_images(user_id);
CREATE INDEX idx_user_images_is_profile ON user_images(is_profile);
CREATE INDEX idx_user_images_featured ON user_images(featured) WHERE featured = true;
CREATE INDEX idx_user_images_metadata ON user_images USING GIN (metadata);
```

## Testing

### Test Without Migration
The code should work with the basic schema:
- ✅ Image uploads work
- ✅ Image deletion works
- ✅ Profile image setting works
- ⚠️ Featured image setting will fail gracefully (returns error)
- ✅ Metadata is extracted and returned (just not stored)

### Test With Migration
After running migration:
- ✅ All features work
- ✅ Featured images work
- ✅ Metadata is stored in database
- ✅ Better query performance with indexes

## Migration File

See: `database/migrations/add_featured_and_metadata_to_user_images.sql`

This migration:
- ✅ Checks if columns exist before adding (safe to run multiple times)
- ✅ Adds indexes for performance
- ✅ Uses DO blocks for PostgreSQL compatibility
- ✅ Provides feedback messages

## Summary

**Current Status:**
- Code works with existing schema ✅
- Code has fallbacks for missing columns ✅
- Migration file created ✅
- Recommended to run migration for full functionality ⚠️

**Action Required:**
1. Review the migration file
2. Run migration on your database
3. Test featured image functionality
4. Verify metadata storage

The code is **production-ready** and will work with or without the migration, but running the migration enables all features.






























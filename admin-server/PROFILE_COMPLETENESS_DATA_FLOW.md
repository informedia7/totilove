# Profile Completeness Data Flow

## Overview
The "Avg Profile Completeness" metric shows the average percentage of profile completion across all users in the system.

## Data Flow Path

### 1. Frontend Display
**File:** `admin-server/public/js/admin-statistics.js`
- **Function:** `loadQualityMetrics()` (line 914)
- **API Call:** `GET /api/stats/quality`
- **Display:** `renderQualityStats()` (line 933)
  - Shows: `${stats.avgCompleteness.toFixed(1)}%`

### 2. API Route
**File:** `admin-server/routes/statsRoutes.js`
- **Route:** `GET /api/stats/quality` (line 16)
- **Handler:** `statisticsController.getQualityMetrics()`

### 3. Controller
**File:** `admin-server/controllers/statisticsController.js`
- **Method:** `getQualityMetrics()` (line 90)
- **Action:** Calls `statisticsService.getQualityMetrics()`

### 4. Service Layer
**File:** `admin-server/services/statisticsService.js`
- **Method:** `getQualityMetrics()` (line 510)
- **Location:** Lines 533-556

## Database Query

### Tables Used:
1. **`users`** table - Main user records
2. **`user_attributes`** table - Extended user profile data
3. **`user_images`** table - User uploaded images

### SQL Query:
```sql
SELECT 
    AVG(
        CASE WHEN ua.about_me IS NOT NULL AND ua.about_me != '' THEN 1 ELSE 0 END +
        CASE WHEN (SELECT COUNT(*) FROM user_images WHERE user_id = u.id) > 0 THEN 1 ELSE 0 END +
        CASE WHEN ua.height_cm IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN ua.body_type_id IS NOT NULL THEN 1 ELSE 0 END
    ) / 4.0 * 100 as avg_completeness
FROM users u
LEFT JOIN user_attributes ua ON u.id = ua.user_id
```

## Fields Checked (4 total, each worth 25%):

1. **About Me** (`user_attributes.about_me`)
   - Checks: Field is NOT NULL and NOT empty string
   - Weight: 25% (1 out of 4 points)

2. **User Images** (`user_images` table)
   - Checks: User has at least 1 image uploaded
   - Query: `SELECT COUNT(*) FROM user_images WHERE user_id = u.id`
   - Weight: 25% (1 out of 4 points)

3. **Height** (`user_attributes.height_cm`)
   - Checks: Field is NOT NULL
   - Weight: 25% (1 out of 4 points)

4. **Body Type** (`user_attributes.body_type_id`)
   - Checks: Field is NOT NULL
   - Weight: 25% (1 out of 4 points)

## Calculation Logic:

1. For each user, calculate a score (0-4):
   - 0 = No fields filled
   - 1 = 1 field filled (25%)
   - 2 = 2 fields filled (50%)
   - 3 = 3 fields filled (75%)
   - 4 = All fields filled (100%)

2. Calculate average across all users:
   - `AVG(score)` = Average score (0-4 range)

3. Normalize to percentage:
   - Divide by 4.0 to get 0-1 range
   - Multiply by 100 to get 0-100% range
   - Formula: `AVG(score) / 4.0 * 100`

4. Safety cap:
   - JavaScript: `Math.min(100, Math.max(0, value))`
   - Ensures result is always between 0% and 100%

## Example Calculation:

If you have 3 users:
- User 1: Has all 4 fields = 4 points
- User 2: Has 2 fields (about_me, images) = 2 points
- User 3: Has 1 field (height) = 1 point

Average = (4 + 2 + 1) / 3 = 2.33 points
Percentage = (2.33 / 4.0) * 100 = 58.25%

## Why 153.5% Was Showing (Before Fix):

**The Bug:**
- The query was calculating: `AVG(score) * 100`
- Without dividing by 4.0 first
- So if average was 1.535 points, it showed: 1.535 * 100 = 153.5%

**The Fix:**
- Changed to: `AVG(score) / 4.0 * 100`
- Now: 1.535 / 4.0 * 100 = 38.375% ✅

## Database Schema Reference:

### `users` table:
- `id` (PRIMARY KEY)

### `user_attributes` table:
- `user_id` (FOREIGN KEY to users.id)
- `about_me` (TEXT) - User's bio/description
- `height_cm` (INTEGER) - User's height in centimeters
- `body_type_id` (INTEGER) - Reference to body type

### `user_images` table:
- `user_id` (FOREIGN KEY to users.id)
- `id` (PRIMARY KEY)
- Other image metadata fields

## Cache:
- Results are cached in Redis for 5 minutes (300 seconds)
- Cache key: `quality_metrics`
- Location: `statisticsService.js` line 512-515

## Error Handling:
- If query fails, returns 0% as default
- Error is logged but doesn't break the page
- Location: `statisticsService.js` line 551-555




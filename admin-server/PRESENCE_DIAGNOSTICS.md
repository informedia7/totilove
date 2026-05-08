# Presence Diagnostics

## Overview

The Presence Diagnostics system runs automated health checks to ensure all critical components of the presence tracking infrastructure are operational. This feature replaces the previous CLI-based diagnostic scripts with an integrated API-based solution.

## Features

- **Automated Health Checks**: Runs 4 comprehensive tests to verify system health
- **Real-time Results**: Provides immediate feedback on system status
- **Detailed Reporting**: Returns structured data with timestamps and durations
- **API Integration**: Accessible via `/api/presence-tests/run` endpoint
- **Audit Logging**: All diagnostic runs are logged for compliance tracking

## Diagnostic Tests

### 1. Database Connectivity ✅
- **Purpose**: Verifies that PostgreSQL is reachable and responding
- **Test**: Issues a lightweight `SELECT NOW()` query
- **Expected Duration**: 1-50ms (depending on network and load)
- **Pass Condition**: Successfully executes SQL query and receives current timestamp
- **Failure Handling**: Logs error and returns failure status

```json
{
  "id": "database-connectivity",
  "label": "Database connectivity",
  "status": "pass",
  "durationMs": 30,
  "details": {
    "timestamp": "2026-04-26T01:43:41.465Z"
  }
}
```

### 2. Redis Status ✅
- **Purpose**: Validates Redis server availability (if enabled)
- **Test**: Sends PING command to Redis
- **Expected Duration**: 0-5ms
- **Pass Condition**: Receives PONG response or reports as disabled
- **Configuration**: Respects `REDIS_ENABLED` environment variable

```json
{
  "id": "redis-status",
  "label": "Redis status",
  "status": "pass",
  "durationMs": 0,
  "details": {
    "enabled": false,
    "message": "Redis disabled via configuration."
  }
}
```

### 3. Uploads Visibility ✅
- **Purpose**: Ensures admin server can access upload directories
- **Test**: Attempts to locate and verify read access to `uploads/profile_images`
- **Paths Searched**:
  - Environment variable `UPLOADS_PATH`
  - Relative paths in admin-server
  - Relative paths in parent directories
  - Main app directory structure

```json
{
  "id": "uploads-visibility",
  "label": "Uploads visibility",
  "status": "pass",
  "durationMs": 1,
  "details": {
    "uploadsPath": "C:\\Totilove1\\app\\uploads",
    "profileImagesPath": "C:\\Totilove1\\app\\uploads\\profile_images"
  }
}
```

### 4. Presence Assets Signatures ✅
- **Purpose**: Scans `page-analysis-report.json` for known presence asset references
- **Required Assets**: `presence-engine.js` (must be present)
- **Optional Assets**: `presence-refresh.js` (warns if missing)
- **Report Location**: `data/page-analysis-report.json`

```json
{
  "id": "presence-assets-signature",
  "label": "Presence assets signatures",
  "status": "pass",
  "durationMs": 1,
  "details": {
    "file": "C:\\Totilove1\\admin-server\\data\\page-analysis-report.json",
    "required": ["presence-engine.js"],
    "optional": ["presence-refresh.js"],
    "missingOptional": ["presence-refresh.js"],
    "fileSizeBytes": 89677
  }
}
```

## API Endpoints

### Run Diagnostics
```http
GET /api/presence-tests/run
Authorization: Bearer <admin_token>
```

**Response (Success - 200)**:
```json
{
  "success": true,
  "timestamp": "2026-04-26T01:43:41.465Z",
  "summary": {
    "total": 4,
    "passing": 4,
    "failing": 0,
    "usersTested": null,
    "usersPassing": null
  },
  "tests": [
    {
      "id": "database-connectivity",
      "label": "Database connectivity",
      "description": "Issues a lightweight SQL query to confirm PostgreSQL is reachable.",
      "status": "pass",
      "durationMs": 30,
      "details": {
        "timestamp": "2026-04-26T01:43:41.465Z"
      }
    },
    // ... more tests
  ]
}
```

**Response (Failure - 500)**:
```json
{
  "success": false,
  "error": "Failed to connect to database"
}
```

### List Endpoints
```http
GET /api/presence-tests/
Authorization: Bearer <admin_token>
```

## Usage

### Via API

```bash
# Run diagnostics
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3003/api/presence-tests/run

# List endpoints
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3003/api/presence-tests/
```

### Via Node.js

```javascript
const presenceTestService = require('./services/presenceTestService');

const diagnostics = await presenceTestService.runPresenceDiagnostics();
console.log(`Tests passed: ${diagnostics.summary.passed}/${diagnostics.summary.total}`);
```

### Via CLI Script

```bash
cd admin-server
node test-diagnostics.js
```

## Integration

### With Admin Dashboard

The diagnostics can be integrated into the admin dashboard UI to display:
- Real-time system health status
- Test results with pass/fail indicators
- Duration metrics for performance monitoring
- Detailed error messages for troubleshooting

### Scheduled Runs

To run diagnostics automatically on an interval:

```javascript
setInterval(async () => {
  const diagnostics = await presenceTestService.runPresenceDiagnostics();
  if (diagnostics.summary.failed > 0) {
    logger.warn('Diagnostics failed', diagnostics);
    // Send alert/notification
  }
}, 5 * 60 * 1000); // Every 5 minutes
```

## Troubleshooting

### Database Connectivity Fails
- Check PostgreSQL is running
- Verify `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` in `.env`
- Check network connectivity to database server
- Verify admin server has database permissions

### Redis Status Fails (when enabled)
- Check Redis server is running
- Verify `REDIS_HOST` and `REDIS_PORT` in `.env`
- Check Redis authentication if enabled
- Review Redis connection logs

### Uploads Visibility Fails
- Verify `UPLOADS_PATH` environment variable is set correctly
- Check read permissions on upload directories
- Verify path exists on filesystem
- Check for symbolic link issues

### Presence Assets Signatures Fails
- Run `npm run analyze-pages` to regenerate `page-analysis-report.json`
- Verify presence-engine.js is referenced in at least one HTML page
- Check `page-analysis-report.json` file integrity
- Review page analysis logs for errors

## Monitoring

### Key Metrics to Monitor
- **Average Duration**: Track test execution time trends
- **Failure Rate**: Monitor increase in failed tests
- **Missing Assets**: Track optional assets being added/removed
- **Path Changes**: Monitor uploads directory relocations

### Alerts to Configure
- Any test failing (severity: HIGH)
- Optional assets missing (severity: LOW)
- Slow database response (>100ms) (severity: MEDIUM)
- Redis unavailable when enabled (severity: HIGH)

## Future Enhancements

- [ ] User presence sampling (check active sessions)
- [ ] Performance metrics collection
- [ ] Comparative analysis (current vs. baseline)
- [ ] Automated remediation recommendations
- [ ] Historical trend data
- [ ] Configurable test thresholds
- [ ] Custom diagnostic plugins

## Related Files

- Controller: [presenceTestController.js](../controllers/presenceTestController.js)
- Service: [presenceTestService.js](../services/presenceTestService.js)
- Routes: [presenceTestRoutes.js](../routes/presenceTestRoutes.js)
- Test Script: [test-diagnostics.js](../test-diagnostics.js)
- Page Analyzer: [scripts/analyze-pages.js](../scripts/analyze-pages.js)
- Report Data: [data/page-analysis-report.json](../data/page-analysis-report.json)

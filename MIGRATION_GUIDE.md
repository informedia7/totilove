# Migration Guide

## Current Status: Phase 0 - Setup Complete ✅

### What's Been Set Up

1. ✅ Feature flags system (config/featureFlags.js)
2. ✅ New directory structure (parallel to old)
3. ✅ Empty template files ready for migration
4. ✅ Backup directories created

### Next Steps

#### Phase 1: CSS Extraction (Weeks 2-4)

1. **Week 2: Extract Tokens**
   - Populate app/assets/css/new/00-tokens.css
   - Extract colors, spacing, typography from existing CSS
   - Test: No visual changes expected

2. **Week 3: Extract UserCard Component**
   - Extract UserCard styles to app/assets/css/new/02-components/_user-card.css
   - Test: UserCard should look identical

3. **Week 4: Extract More Components**
   - Modals, Forms, Buttons
   - Test each component individually

#### Phase 2: JavaScript Extraction (Weeks 5-8)

1. Extract core utilities
2. Extract UserCard JavaScript
3. Extract API client logic

#### Phase 3: HTML Refactoring (Weeks 9-12)

1. Add mobile-only/desktop-only structure
2. Test one page at a time
3. Enable with feature flags

### Safety Checklist

Before making ANY change:
- [ ] Git commit current state
- [ ] Database backup created
- [ ] Feature flag ready
- [ ] Rollback plan ready
- [ ] Test on staging first

### Rollback

If something breaks:
1. Disable feature flags: `USE_NEW_CSS=false`
2. Comment out new CSS/JS in HTML
3. Git revert if needed

See ARCHITECTURE_RECOMMENDATIONS.md for full details.

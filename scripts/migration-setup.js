#!/usr/bin/env node

/**
 * Migration Setup Script
 * 
 * Sets up the new architecture directory structure
 * without touching existing files.
 * 
 * Usage: node scripts/migration-setup.js
 */

const fs = require('fs');
const path = require('path');

const directories = [
  // New CSS structure
  'app/assets/css/new',
  'app/assets/css/new/base',
  'app/assets/css/new/components',
  'app/assets/css/new/layouts',
  'app/assets/css/new/pages',
  
  // Old CSS backup location (will move existing files here)
  'app/assets/css/old',
  
  // New JavaScript structure
  'app/assets/js/new',
  'app/assets/js/new/core',
  'app/assets/js/new/components',
  'app/assets/js/new/pages',
  'app/assets/js/new/utils',
  
  // Old JS backup location
  'app/assets/js/old',
  
  // Migration backups
  'migration-backups',
  'migration-backups/css',
  'migration-backups/js',
  'migration-backups/html'
];

const files = [
  // CSS token file (empty, ready to populate)
  {
    path: 'app/assets/css/new/00-tokens.css',
    content: `/**
 * Design Tokens
 * 
 * Single source of truth for colors, spacing, typography, etc.
 * Mobile-first values (desktop enhancements in responsive.css)
 */

:root {
  /* Colors */
  --primary: #667eea;
  --secondary: #764ba2;
  --accent: #e74c3c;
  --success: #00b894;
  --danger: #d63031;
  --warning: #fdcb6e;
  
  /* Spacing (mobile-first) */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  
  /* Border Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  
  /* Typography */
  --font-sm: 0.875rem;
  --font-md: 1rem;
  --font-lg: 1.125rem;
  --font-xl: 1.25rem;
  
  /* Touch Targets (mobile) */
  --touch-target: 44px;
  
  /* Transitions */
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
`
  },
  
  // Base CSS file (mobile-first)
  {
    path: 'app/assets/css/new/01-base.css',
    content: `/**
 * Base Styles (Mobile-First)
 * 
 * NO media queries here - this IS mobile CSS
 * Desktop enhancements go in 04-responsive.css
 */

/* Mobile-first reset and base styles will go here */
`
  },
  
  // Components CSS (will be split into component files)
  {
    path: 'app/assets/css/new/02-components/components.css',
    content: `/**
 * Component Styles (Mobile-First)
 * 
 * Import component files here
 * Will be split into: _user-card.css, _modals.css, etc.
 */

/* Component styles will go here */
`
  },
  
  // Layout CSS
  {
    path: 'app/assets/css/new/03-layout.css',
    content: `/**
 * Layout Styles (Mobile-First)
 * 
 * Grids, containers, headers, footers
 */

/* Layout styles will go here */
`
  },
  
  // Responsive CSS (desktop enhancements)
  {
    path: 'app/assets/css/new/04-responsive.css',
    content: `/**
 * Responsive Styles (Desktop Enhancements)
 * 
 * ONLY desktop enhancements via media queries
 * Mobile styles are in base.css
 */

/* Desktop enhancements will go here */
@media (min-width: 769px) {
  /* Desktop-only styles */
}
`
  },
  
  // Core JavaScript utilities
  {
    path: 'app/assets/js/new/core/utils.js',
    content: `/**
 * Core Utilities
 * 
 * Shared utility functions used across all pages
 */

export function formatDate(date) {
  // TODO: Extract from existing code
}

export function debounce(func, wait) {
  // TODO: Extract from existing code
}

export function throttle(func, limit) {
  // TODO: Extract from existing code
}
`
  },
  
  // API Client
  {
    path: 'app/assets/js/new/core/api-client.js',
    content: `/**
 * API Client
 * 
 * Centralized API calls with CSRF token handling
 */

export class ApiClient {
  constructor() {
    this.baseURL = '/api';
    this.csrfToken = this.getCSRFToken();
  }
  
  getCSRFToken() {
    // TODO: Extract CSRF token logic
    return document.querySelector('meta[name="csrf-token"]')?.content;
  }
  
  async get(url) {
    // TODO: Implement GET request
  }
  
  async post(url, data) {
    // TODO: Implement POST request with CSRF
  }
  
  async put(url, data) {
    // TODO: Implement PUT request
  }
  
  async delete(url) {
    // TODO: Implement DELETE request
  }
}
`
  },
  
  // README for migration
  {
    path: 'MIGRATION_GUIDE.md',
    content: `# Migration Guide

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
1. Disable feature flags: \`USE_NEW_CSS=false\`
2. Comment out new CSS/JS in HTML
3. Git revert if needed

See ARCHITECTURE_RECOMMENDATIONS.md for full details.
`
  }
];

console.log('🚀 Starting Migration Setup...\n');

// Create directories
console.log('📁 Creating directory structure...');
directories.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`   ✅ Created: ${dir}`);
  } else {
    console.log(`   ⚠️  Already exists: ${dir}`);
  }
});

// Create files
console.log('\n📄 Creating template files...');
files.forEach(file => {
  const fullPath = path.join(process.cwd(), file.path);
  const dir = path.dirname(fullPath);
  
  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, file.content, 'utf8');
    console.log(`   ✅ Created: ${file.path}`);
  } else {
    console.log(`   ⚠️  Already exists: ${file.path}`);
  }
});

console.log('\n✅ Migration setup complete!');
console.log('\n📋 Next Steps:');
console.log('   1. Review the new structure in app/assets/css/new/');
console.log('   2. Review feature flags in config/featureFlags.js');
console.log('   3. Read MIGRATION_GUIDE.md for next steps');
console.log('   4. Start Phase 1: Extract CSS tokens');
console.log('\n🛡️  Remember: Old files are untouched - safe to experiment!');


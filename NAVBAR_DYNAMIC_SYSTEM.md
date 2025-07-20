# Dynamic Navbar System Documentation

## Overview
The dynamic navbar system replaces hardcoded navbar HTML in individual pages with a modular, reusable component that can be dynamically loaded via JavaScript.

## Benefits
✅ **No Code Duplication**: Single navbar component used across all pages  
✅ **Consistent Styling**: Unified design and behavior  
✅ **Easy Maintenance**: Update navbar once, affects all pages  
✅ **Authentication Aware**: Automatically adapts based on user login status  
✅ **Performance Optimized**: Fast loading with visual feedback  
✅ **Mobile Responsive**: Works seamlessly on all devices  

## Files Structure
```
/public/components/
├── navbar.html          # Navbar HTML template
├── navbar.css           # Navbar styles (already existing)
├── navbar.js            # Navbar functionality (enhanced)
└── navbar-loader.js     # Dynamic loading system (NEW)
```

## Quick Start

### 1. Basic Implementation
Add these scripts to any page where you want the navbar:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Your Page</title>
    <!-- Include session manager if you have one -->
    <script src="/js/session.js"></script>
    
    <!-- Include navbar loader and functionality -->
    <script src="/components/navbar-loader.js"></script>
    <script src="/components/navbar.js"></script>
</head>
<body>
    <!-- Navbar will automatically load here -->
    
    <main>
        Your page content...
    </main>
</body>
</html>
```

### 2. Manual Control
If you want to control when/where the navbar loads:

```html
<script>
    // Disable auto-loading
    window.disableAutoNavbar = true;
    
    document.addEventListener('DOMContentLoaded', function() {
        // Load navbar manually into specific element
        window.navbarLoader.loadNavbar('.header-container', 'afterbegin');
    });
</script>
```

### 3. Authentication Integration
Setup your session manager for navbar authentication:

```javascript
// Define session manager before navbar loads
window.sessionManager = {
    isAuthenticated: () => {
        // Your authentication logic
        return localStorage.getItem('authToken') !== null;
    },
    logout: () => {
        // Your logout logic
        localStorage.removeItem('authToken');
        window.location.href = '/pages/login.html';
    }
};
```

## API Reference

### NavbarLoader Class

#### `loadNavbar(targetSelector, insertPosition)`
- **targetSelector** (string): CSS selector for where to insert navbar (default: 'body')
- **insertPosition** (string): Where to insert ('afterbegin', 'afterend', etc.) (default: 'afterbegin')

#### `refreshAuthState()`
Updates navbar authentication state without reloading

#### `setupAuthenticationNavbar()`
Configures navbar based on current authentication status

### Global Functions

#### `window.handleLogout(event)`
Global logout handler used by navbar logout button

#### `window.toggleMobileMenu()`
Toggle mobile menu visibility

## Examples

### Example 1: Home Page
```html
<!DOCTYPE html>
<html>
<head>
    <title>Home - Totilove</title>
    <script src="/components/navbar-loader.js"></script>
    <script src="/components/navbar.js"></script>
</head>
<body>
    <!-- Navbar loads automatically here -->
    
    <main style="padding-top: 80px;">
        <h1>Welcome to Totilove</h1>
    </main>
</body>
</html>
```

### Example 2: Profile Page (Authenticated)
```html
<!DOCTYPE html>
<html>
<head>
    <title>Profile - Totilove</title>
    <script src="/js/session.js"></script>
    <script src="/components/navbar-loader.js"></script>
    <script src="/components/navbar.js"></script>
</head>
<body>
    <!-- Navbar loads automatically with auth state -->
    
    <main style="padding-top: 80px;">
        <h1>My Profile</h1>
    </main>
    
    <script>
        // Setup session manager for authenticated user
        window.sessionManager = {
            isAuthenticated: () => true,
            logout: () => {
                localStorage.clear();
                window.location.href = '/pages/login.html';
            }
        };
    </script>
</body>
</html>
```

### Example 3: Custom Navbar Placement
```html
<!DOCTYPE html>
<html>
<head>
    <title>Custom Layout</title>
    <script>
        // Disable auto-loading
        window.disableAutoNavbar = true;
    </script>
    <script src="/components/navbar-loader.js"></script>
</head>
<body>
    <header id="site-header">
        <!-- Navbar will be inserted here -->
    </header>
    
    <main>
        Content here...
    </main>
    
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // Load navbar into custom location
            window.navbarLoader.loadNavbar('#site-header');
        });
    </script>
</body>
</html>
```

## Migration Guide

### Converting Existing Pages

1. **Remove hardcoded navbar HTML**:
   ```html
   <!-- DELETE THIS -->
   <nav class="navbar">
       <div class="container">
           <!-- ... navbar content ... -->
       </div>
   </nav>
   ```

2. **Remove navbar CSS link** (if standalone):
   ```html
   <!-- DELETE THIS (loader handles it) -->
   <link rel="stylesheet" href="/components/navbar.css">
   ```

3. **Replace navbar.js include**:
   ```html
   <!-- REPLACE THIS -->
   <script src="/components/navbar.js"></script>
   
   <!-- WITH THESE -->
   <script src="/components/navbar-loader.js"></script>
   <script src="/components/navbar.js"></script>
   ```

4. **Setup authentication** (if needed):
   ```javascript
   // ADD THIS for authenticated pages
   window.sessionManager = {
       isAuthenticated: () => /* your auth check */,
       logout: () => /* your logout logic */
   };
   ```

## Configuration Options

### Disable Auto-Loading
```javascript
// Set before navbar-loader.js loads
window.disableAutoNavbar = true;
```

### Custom Session Manager
```javascript
window.sessionManager = {
    isAuthenticated: () => boolean,
    logout: () => void,
    user: object // optional user data
};
```

### Custom Logout Handler
```javascript
window.handleLogout = function(event) {
    event.preventDefault();
    // Your custom logout logic
    console.log('Custom logout');
};
```

## Troubleshooting

### Navbar Not Loading
1. Check console for errors
2. Ensure navbar-loader.js is included before use
3. Verify navbar.html exists at `/components/navbar.html`

### Authentication Not Working
1. Check that sessionManager is defined before navbar loads
2. Verify isAuthenticated() returns boolean
3. Call `window.navbarLoader.refreshAuthState()` after auth changes

### Styling Issues
1. Ensure your page has `padding-top: 80px` or similar for sticky navbar
2. Check that navbar.css is loading properly
3. Verify CSS variables are defined in your page

### Mobile Menu Not Working
1. Check that navbar.js is loading after navbar.html
2. Verify toggleMobileMenu function is available
3. Ensure Font Awesome icons are loaded

## Demo Pages

- `/public/demo-dynamic-navbar.html` - Basic demo with test controls
- `/public/users/profile-dynamic.html` - Profile page example

## Best Practices

1. **Always include session.js first** if you have authentication
2. **Set up sessionManager before** navbar loads
3. **Use consistent padding-top** (80px) for sticky navbar
4. **Test both authenticated and public states**
5. **Include Font Awesome** for icons
6. **Call refreshAuthState()** after login/logout events

## Future Enhancements

- [ ] Navbar themes/customization options
- [ ] Animation configurations
- [ ] Multiple navbar templates
- [ ] Advanced caching strategies
- [ ] Integration with routing libraries

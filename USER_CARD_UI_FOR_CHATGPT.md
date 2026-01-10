# User Card UI Component - Complete CSS & HTML Structure

## Overview
This is a modern, responsive user card component designed for a dating application. It features rounded images, hover effects, quick actions, and responsive column layouts (3-6 columns per row).

---

## Complete CSS Styles

```css
/* ===== USER CARD COMPONENT STYLES ===== */

/* User Card Base */
.results-grid .online-user-card,
.online-users-grid .online-user-card {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(31, 38, 135, 0.08);
    transition: transform 0.2s;
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    cursor: pointer;
    box-sizing: border-box;
    padding: 0;
    margin: 0;
    contain: layout paint; /* Performance optimization */
}

.online-user-card:focus {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
}

.online-user-card:focus:not(:focus-visible) {
    outline: none;
}

.results-grid .online-user-card:hover,
.online-users-grid .online-user-card:hover {
    transform: translateY(-2px);
}

/* Columns-3 specific overrides */
.results-grid.columns-3 .online-user-card {
    border-radius: 15px;
    box-shadow: 0 5px 25px rgba(0, 0, 0, 0.1);
    transition: transform 0.3s ease;
    min-height: 400px;
}

.results-grid.columns-3 .online-user-card:hover {
    transform: translateY(-5px);
}

.results-grid.columns-3 .online-user-card .user-image-container {
    border-radius: 15px 15px 0 0;
}

.results-grid.columns-3 .online-user-card .user-avatar,
.results-grid.columns-3 .online-user-card .user-avatar.loading,
.results-grid.columns-3 .online-user-card .user-avatar.loaded {
    border-radius: 15px 15px 0 0;
}

.results-grid.columns-3 .online-user-card .user-avatar:before {
    border-radius: 15px 15px 0 0;
}

.results-grid.columns-3 .online-user-card .user-info {
    flex-shrink: 0;
    position: relative;
    z-index: 1;
}

.results-grid.columns-3 .user-info {
    align-items: center;
    text-align: center;
    flex: 1;
    min-height: 0;
    overflow: visible;
}

/* Action button sizes for different columns */
.results-grid.columns-3 .user-actions {
    gap: 0.39rem;
    flex-wrap: nowrap;
    justify-content: center;
    overflow: hidden;
}

.results-grid.columns-3 .icon-action {
    font-size: 1.04rem;
    padding: 0.39rem;
    min-width: 31px;
    min-height: 31px;
    max-width: 31px;
    max-height: 31px;
    flex-shrink: 1;
}

.results-grid.columns-4 .user-actions {
    gap: 0.3rem;
    flex-wrap: nowrap;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    display: flex;
    width: 100%;
}

.results-grid.columns-4 .icon-action {
    font-size: 0.8rem;
    padding: 0.3rem;
    min-width: 24px;
    min-height: 24px;
    max-width: 24px;
    max-height: 24px;
    flex-shrink: 1;
}

.results-grid.columns-5 .user-actions {
    gap: 0.2rem;
    flex-wrap: nowrap;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    display: flex;
    width: 100%;
}

.results-grid.columns-6 .user-actions {
    gap: 0.11rem;
    flex-wrap: nowrap;
    justify-content: center;
    align-items: center;
    overflow: visible;
    display: flex;
    width: 100%;
    padding: 0 0.2rem;
    box-sizing: border-box;
}

.results-grid.columns-5 .icon-action,
.results-grid.columns-6 .icon-action {
    font-size: 0.7rem;
    padding: 0.25rem;
    min-width: 20px;
    min-height: 20px;
    max-width: 20px;
    max-height: 20px;
    flex-shrink: 1;
    box-sizing: border-box;
}

.results-grid.columns-6 .user-info {
    padding: 0.8rem 0.4rem;
}

/* ===== IMAGE CONTAINER ===== */
.user-image-container {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1.25; /* Ideal dating app ratio (4:5) */
    overflow: hidden;
    border-radius: 12px 12px 0 0;
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    cursor: pointer;
    transition: all 0.3s ease;
}

.online-users-grid .user-image-container {
    aspect-ratio: unset;
    /* height will be set by column-specific styles or JavaScript */
}

/* Hover Zoom Effect */
.user-image-container:hover {
    transform: scale(1.02);
}

.user-image-container:hover .user-avatar {
    transform: scale(1.05);
}

/* Base Image Styling - ROUNDED CORNERS */
.user-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center center;
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    display: block;
    border-radius: 12px 12px 0 0; /* Rounded top corners */
    will-change: transform; /* GPU hint for smooth zoom */
}

/* Image Fallback (replaces ::before on img which isn't reliable) */
.avatar-fallback {
    position: absolute;
    inset: 0;
    display: none;
    place-items: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 2rem;
    border-radius: 12px 12px 0 0;
    z-index: 1;
}

.user-avatar:not([src]),
.user-avatar[src=""],
.user-avatar[src="undefined"] {
    display: none;
}

.user-avatar:not([src]) + .avatar-fallback,
.user-avatar[src=""] + .avatar-fallback {
    display: grid;
}

/* Fallback for broken images */
.user-avatar:before {
    content: '\f007'; /* Font Awesome user icon */
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: 'Font Awesome 6 Free';
    font-weight: 900;
    font-size: 2rem;
    border-radius: 12px 12px 0 0;
}

/* Image Loading States */
.user-avatar.loading {
    filter: blur(10px);
    transform: scale(1.1);
    border-radius: 12px 12px 0 0;
}

.user-avatar.loaded {
    filter: blur(0);
    transform: scale(1);
    animation: fadeIn 0.5s ease;
    border-radius: 12px 12px 0 0;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

/* ===== SMART IMAGE OVERLAYS & INDICATORS ===== */
.online-indicator {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 12px;
    height: 12px;
    background: #00b894;
    border: 2px solid white;
    border-radius: 50%;
    z-index: 2;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(0, 184, 148, 0.4); }
    70% { box-shadow: 0 0 0 8px rgba(0, 184, 148, 0); }
    100% { box-shadow: 0 0 0 0 rgba(0, 184, 148, 0); }
}

.new-match-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    background: linear-gradient(135deg, #ff9a00 0%, #ff6a00 100%);
    color: white;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 600;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 3px 10px rgba(255, 106, 0, 0.3);
    backdrop-filter: blur(5px);
}

.verified-badge {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    font-size: 0.8rem;
    backdrop-filter: blur(5px);
}

.photo-count {
    position: absolute;
    bottom: 10px;
    left: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 4px 8px;
    border-radius: 15px;
    font-size: 0.7rem;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 4px;
    backdrop-filter: blur(5px);
}

.image-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
    z-index: 1;
    pointer-events: none;
}

.compatibility-overlay {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    z-index: 2;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    display: flex;
    align-items: center;
    gap: 4px;
}

/* ===== INTERACTIVE FEATURES ===== */
.quick-actions {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 3;
    border-radius: 12px 12px 0 0;
}

.results-grid.columns-3 .quick-actions {
    border-radius: 15px 15px 0 0;
}

/* Desktop: Show on hover | Mobile: Show when tapped (.show-actions class) */
.user-image-container:hover .quick-actions,
.user-image-container.show-actions .quick-actions {
    opacity: 1;
}

.quick-action-btn {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    cursor: pointer;
    transition: all 0.3s ease;
    transform: translateY(20px);
    opacity: 0;
}

.user-image-container:hover .quick-action-btn,
.user-image-container.show-actions .quick-action-btn {
    transform: translateY(0);
    opacity: 1;
}

.quick-action-btn.like {
    background: #00b894;
    color: white;
    animation-delay: 0.1s;
}

.quick-action-btn.message {
    background: #0984e3;
    color: white;
    animation-delay: 0.2s;
}

.quick-action-btn.favorite {
    background: #e74c3c;
    color: white;
    animation-delay: 0.3s;
}

.quick-action-btn:hover {
    transform: scale(1.1);
}

/* Loading Skeleton */
.image-skeleton {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
    border-radius: 12px 12px 0 0;
}

@keyframes loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

/* ===== RESPONSIVE ===== */
@media (min-width: 1200px) {
    .online-users-grid.columns-3 .user-image-container {
        aspect-ratio: 1 / 1.3;
    }
    .online-users-grid.columns-4 .user-image-container {
        aspect-ratio: 1 / 1.25;
    }
    .online-users-grid.columns-5 .user-image-container,
    .online-users-grid.columns-6 .user-image-container {
        aspect-ratio: 1 / 1.2;
    }
}

@media (max-width: 768px) {
    .user-image-container {
        aspect-ratio: 1 / 1.2;
    }
    .quick-actions {
        gap: 10px;
    }
    .quick-action-btn {
        width: 40px;
        height: 40px;
        font-size: 1rem;
    }
}

/* ===== USER INFO SECTION ===== */
.user-info {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    flex-grow: 1;
    justify-content: space-between;
}

.user-info h4 {
    color: #00b894;
    margin-bottom: 0.25rem;
    font-size: 1.08rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
}

.gender-icon {
    font-size: 0.9rem;
}

.gender-icon.male {
    color: #3498db;
}

.gender-icon.female {
    color: #e91e63;
}

.age-badge {
    margin-left: 0.5rem;
    padding: 0.2rem 0.6rem;
    font-size: 0.8rem;
    font-weight: 500;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    background: #f5f6fa;
    color: #636e72;
    cursor: default;
}

.user-interests {
    margin-bottom: 0.5rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
}

.user-interests span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.5rem;
    background: #f5f6fa;
    border-radius: 8px;
    font-size: 0.8rem;
    color: #636e72;
}

.user-about {
    font-size: 0.9rem;
    color: #636e72;
    margin-bottom: 1rem;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: 4.5em;
    line-height: 1.4;
}

/* User Actions */
.user-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: auto;
    flex-wrap: nowrap;
    overflow: hidden;
}

.icon-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    color: var(--primary-color);
    cursor: pointer;
    transition: color 0.18s, transform 0.18s;
    padding: 0.5rem;
    border-radius: 50%;
    background: rgba(108, 92, 231, 0.1);
    min-width: 32px;
    min-height: 32px;
    flex-shrink: 0;
}

.icon-action:hover {
    color: var(--danger-color);
    transform: scale(1.1);
    background: rgba(214, 48, 49, 0.1);
}

.icon-like i { color: #f39c12; }
.icon-message i { color: var(--primary-color); }
.icon-favourite i { color: var(--danger-color); }
.icon-block i { color: #e74c3c; }
.icon-report i { color: #f39c12; }

/* ===== GRID LAYOUTS ===== */
.online-users-grid.columns-3 {
    grid-template-columns: repeat(3, 1fr);
}

.online-users-grid.columns-4 {
    grid-template-columns: repeat(4, 1fr);
}

.online-users-grid.columns-5 {
    grid-template-columns: repeat(5, 1fr);
}

.online-users-grid.columns-6 {
    grid-template-columns: repeat(6, 1fr);
}

/* ===== ACCESSIBILITY ===== */
/* Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
    
    .user-avatar {
        will-change: auto;
    }
}
```

---

## HTML Structure Example

```html
<div class="online-user-card" 
     data-profile-card 
     data-view-profile="123" 
     tabindex="0" 
     role="button" 
     aria-label="View profile of John Doe">
    <div class="user-image-container">
        <img src="/uploads/profile_images/user.jpg"
             class="user-avatar loading"
             loading="lazy"
             alt="John Doe">
        
        <!-- Image Fallback (shown when image fails to load or is missing) -->
        <div class="avatar-fallback">
            <i class="fas fa-user"></i>
        </div>
        
        <!-- Optional Overlays -->
        <div class="online-indicator" title="Online Now"></div>
        <div class="new-match-badge"><i class="fas fa-bolt"></i> NEW</div>
        <div class="compatibility-overlay"><i class="fas fa-heart"></i> 95%</div>
        <div class="verified-badge" title="Verified Profile"><i class="fas fa-check"></i></div>
        <div class="photo-count"><i class="fas fa-camera"></i> 5</div>
        <div class="image-overlay"></div>
        
        <!-- Quick Actions (appears on hover desktop / tap mobile) -->
        <div class="quick-actions">
            <button class="quick-action-btn like" title="Like" data-action="like" data-profile-id="123">
                <i class="fas fa-heart"></i>
            </button>
            <button class="quick-action-btn message" title="Message" data-action="message" data-username="John Doe">
                <i class="fas fa-comment"></i>
            </button>
            <button class="quick-action-btn favorite" title="Add to Favorites" data-action="favorite" data-profile-id="123">
                <i class="fas fa-star"></i>
            </button>
        </div>
    </div>
    
    <div class="user-info">
        <div class="user-name">
            John Doe
            <i class="fas fa-mars gender-icon male"></i>
            <span class="age-badge">28</span>
        </div>
        <div class="user-location">
            <i class="fas fa-map-marker-alt"></i> New York, USA
        </div>
        <div class="user-seeking">
            Seeking: Female, 25-35
        </div>
        
        <div class="user-interests">
            <span><i class="fas fa-music"></i>Music</span>
            <span><i class="fas fa-hiking"></i>Hiking</span>
        </div>
        
        <p class="user-about">
            Love traveling, photography, and good food. Looking for someone to share adventures with!
        </p>
        
        <div class="user-actions">
            <span class="icon-action icon-message" title="Message">
                <i class="fas fa-envelope"></i>
            </span>
            <span class="icon-action icon-like" title="Like">
                <i class="fas fa-thumbs-up"></i>
            </span>
            <span class="icon-action icon-favourite" title="Add to Favourite">
                <i class="fas fa-heart"></i>
            </span>
        </div>
    </div>
</div>
```

---

## Key Features

### 1. **Rounded Images**
- Images have `border-radius: 12px 12px 0 0` (rounded top corners)
- Columns-3 cards use `border-radius: 15px 15px 0 0` for larger radius
- `object-fit: cover` ensures images fill container properly

### 2. **Responsive Columns**
- Supports 3, 4, 5, or 6 columns per row
- Action buttons scale automatically based on column count
- Image heights adjust: 250px for 3 columns, 140px for 4-6 columns

### 3. **Interactive Features**
- Hover zoom effect on images
- Quick action buttons appear on hover (like, message, favorite)
- Smooth transitions and animations
- Loading states with blur effect

### 4. **Visual Indicators**
- Online status dot (green pulsing indicator)
- New match badge
- Compatibility score overlay
- Verified badge
- Photo count indicator
- Gradient overlay at bottom

### 5. **User Information**
- Name with gender icon and age badge
- Location display
- Seeking preferences
- Interests tags
- About section (clamped to 3 lines)
- Action buttons (message, like, favorite, block, report)

---

## Color Palette

```css
/* Primary Colors */
--primary-color: #667eea;
--secondary-color: #764ba2;
--danger-color: #e74c3c;
--success-color: #00b894;

/* Status Colors */
Online: #00b894
Male: #3498db
Female: #e91e63
Like: #f39c12

/* Backgrounds */
Card: white
Badge: rgba(0, 0, 0, 0.7)
Hover overlay: rgba(0, 0, 0, 0.7)
```

---

## Usage Notes

1. **Image Sizing**: Use `object-fit: cover` (NOT `contain`) for rounded corners to work properly
2. **Container**: Must have `overflow: hidden` on `.user-image-container` for clipping
3. **Border Radius**: Applied to both container AND image element for best compatibility
4. **JavaScript**: Inline styles should set `object-fit: cover`, not `contain`
5. **Responsive**: Column-specific styles override base styles for different layouts

---

## Critical Fixes Implemented

### ✅ 1. Mobile Hover Fix
**Problem**: Quick actions only worked on hover, breaking on mobile devices.

**Solution**: Added tap-to-toggle support that works alongside hover:
```css
.user-image-container:hover .quick-actions,
.user-image-container.show-actions .quick-actions {
    opacity: 1;
}
```

```javascript
document.addEventListener('click', (e) => {
    const card = e.target.closest('.user-image-container');
    if (!card) return;
    if (e.target.closest('.quick-action-btn')) return;
    card.classList.toggle('show-actions');
});
```

### ✅ 2. CSP-Safe Image Loading
**Problem**: Inline `onload` handlers violate Content Security Policy.

**Solution**: Removed inline handlers, use event listeners:
```javascript
img.addEventListener('load', function() {
    this.classList.remove('loading');
    this.classList.add('loaded');
});
```

### ✅ 3. Reliable Image Fallback
**Problem**: `::before` on `<img>` elements is not consistently supported.

**Solution**: Use a proper fallback div element:
```html
<img class="user-avatar" ...>
<div class="avatar-fallback">
    <i class="fas fa-user"></i>
</div>
```

```css
.avatar-fallback {
    position: absolute;
    inset: 0;
    display: none;
    place-items: center;
    background: linear-gradient(...);
}

.user-avatar:not([src]) + .avatar-fallback {
    display: grid;
}
```

### ✅ 4. Prevent Accidental Card Clicks
**Problem**: Clicking action buttons triggered card navigation.

**Solution**: Stop event propagation on all action buttons:
```javascript
grid.querySelectorAll('.icon-action, .quick-action-btn').forEach(el => {
    el.addEventListener('click', (e) => e.stopPropagation());
});
```

### ✅ 5. Keyboard Accessibility
**Problem**: Cards not accessible via keyboard navigation.

**Solution**: Added `tabindex`, `role`, and Enter key support:
```html
<div class="online-user-card" tabindex="0" role="button" aria-label="View profile">
```

```javascript
card.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.viewProfile(profileId);
    }
});
```

### ✅ 6. Reduced Motion Support
**Problem**: Animations can cause motion sickness.

**Solution**: Respect user preferences:
```css
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}
```

### ✅ 7. Performance Optimizations
**Solution**: Added contain and will-change properties:
```css
.online-user-card {
    contain: layout paint; /* Improves scroll performance */
}

.user-avatar {
    will-change: transform; /* GPU hint for smooth zoom */
}
```

---

## Dependencies

- Font Awesome 6 (for icons)
- CSS Variables for theming
- Flexbox/Grid for layout

---

## JavaScript Setup Required

Add this initialization code to your page:

```javascript
// Initialize image loading handlers (CSP-safe)
document.querySelectorAll('.user-avatar').forEach(img => {
    if (img.complete && img.naturalWidth > 0) {
        img.classList.remove('loading');
        img.classList.add('loaded');
    }
    
    img.addEventListener('load', function() {
        this.classList.remove('loading');
        this.classList.add('loaded');
        const fallback = this.nextElementSibling;
        if (fallback && fallback.classList.contains('avatar-fallback')) {
            fallback.style.display = 'none';
        }
    });
    
    img.addEventListener('error', function() {
        const fallback = this.nextElementSibling;
        if (fallback && fallback.classList.contains('avatar-fallback')) {
            this.style.display = 'none';
            fallback.style.display = 'grid';
        }
    });
});

// Mobile tap-to-toggle quick actions
document.addEventListener('click', (e) => {
    const card = e.target.closest('.user-image-container');
    if (!card) {
        document.querySelectorAll('.user-image-container.show-actions').forEach(c => {
            c.classList.remove('show-actions');
        });
        return;
    }
    if (e.target.closest('.quick-action-btn')) return;
    card.classList.toggle('show-actions');
});

// Prevent accidental card clicks
document.querySelectorAll('.icon-action, .quick-action-btn').forEach(el => {
    el.addEventListener('click', (e) => e.stopPropagation());
});

// Keyboard accessibility
document.querySelectorAll('.online-user-card[tabindex]').forEach(card => {
    card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const profileId = parseInt(this.dataset.viewProfile);
            if (window.viewProfile) {
                window.viewProfile(profileId);
            }
        }
    });
});
```


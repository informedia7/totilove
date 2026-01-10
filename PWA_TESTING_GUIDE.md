# 📱 PWA Testing Guide

## What is PWA (Progressive Web App)?

A **Progressive Web App (PWA)** makes your website behave like a native mobile app:

1. **Installable** - Users can "install" it on their phone/desktop (like an app)
2. **Offline Support** - Works even without internet connection
3. **App-like Experience** - Opens in standalone window (no browser UI)
4. **Push Notifications** - Can send notifications (future feature)

---

## 🧪 Testing PWA Features

### **1. Testing Installation**

#### **On Desktop (Chrome/Edge)**

1. **Open your app** in Chrome or Edge browser
2. **Look for install icon** in the address bar (usually a "+" or "install" icon)
3. **Click "Install"** - Browser will show install prompt
4. **Confirm installation** - App will be added to your desktop/apps folder
5. **Launch installed app** - Opens in standalone window (no browser UI)

**What you'll see:**
- ✅ App opens in its own window (no browser tabs/address bar)
- ✅ App icon appears on desktop/taskbar
- ✅ Can launch from Start Menu (Windows) or Applications (Mac)

#### **On Mobile (Android)**

1. **Open your app** in Chrome browser
2. **Look for "Add to Home Screen"** prompt (appears automatically)
   - Or tap menu (3 dots) → "Add to Home Screen"
3. **Tap "Add"** - App icon appears on home screen
4. **Tap icon** - Opens in standalone mode (no browser UI)

**What you'll see:**
- ✅ App icon on home screen
- ✅ Opens fullscreen (no browser UI)
- ✅ Appears in app drawer

#### **On Mobile (iOS/Safari)**

1. **Open your app** in Safari browser
2. **Tap Share button** (square with arrow)
3. **Scroll down** → Tap "Add to Home Screen"
4. **Tap "Add"** - App icon appears on home screen
5. **Tap icon** - Opens in standalone mode

**What you'll see:**
- ✅ App icon on home screen
- ✅ Opens fullscreen (no browser UI)
- ✅ Appears like a native app

---

### **2. Testing Offline Mode**

#### **What is Offline Mode?**

When your internet connection is lost, the app should still work for basic features:
- ✅ View cached pages
- ✅ Navigate between cached pages
- ✅ View cached images
- ✅ Use previously loaded data

**Note:** API calls won't work offline (they need internet), but the UI should still function.

#### **How to Test:**

**Step 1: Load the app normally**
1. Open your app in browser
2. Navigate to a few pages (home, search, matches)
3. Let pages fully load (images, CSS, JS)

**Step 2: Go offline**
1. **Chrome DevTools Method:**
   - Press `F12` (or `Ctrl+Shift+I` / `Cmd+Option+I`)
   - Go to "Network" tab
   - Check "Offline" checkbox
   - Page will show "No internet connection"

2. **Physical Method:**
   - Turn off WiFi on your device
   - Turn off mobile data
   - Or disconnect internet cable

**Step 3: Test offline functionality**
1. **Refresh the page** - Should still load (from cache)
2. **Navigate to other pages** - Should work if cached
3. **View images** - Should display if cached
4. **Try API calls** - Will fail (expected - needs internet)

**What should work offline:**
- ✅ App shell (layout, navigation, UI)
- ✅ Cached pages you've visited
- ✅ Cached images
- ✅ Cached CSS/JS files

**What won't work offline:**
- ❌ New API calls (search, messages, etc.)
- ❌ Loading new pages you haven't visited
- ❌ Real-time updates (WebSocket connections)

---

### **3. Testing Service Worker**

#### **Check if Service Worker is Registered:**

**Chrome DevTools:**
1. Press `F12` to open DevTools
2. Go to "Application" tab
3. Click "Service Workers" in left sidebar
4. You should see:
   ```
   /assets/js/new/service-worker.js
   Status: activated and running
   ```

**What to check:**
- ✅ Service Worker is registered
- ✅ Status shows "activated and running"
- ✅ No errors in console

#### **Test Cache:**

**Chrome DevTools:**
1. Go to "Application" tab
2. Click "Cache Storage" in left sidebar
3. You should see caches:
   - `totilove-v1` (app shell cache)
   - `totilove-runtime-v1` (runtime cache)

**What's cached:**
- ✅ App shell (HTML, CSS, JS)
- ✅ Images (profile images, icons)
- ✅ Font files
- ✅ Pages you've visited

---

### **4. Testing Install Prompt**

#### **Check if Install Prompt Appears:**

**Desktop:**
- Look for install icon in address bar
- Should appear automatically (if criteria met)

**Mobile:**
- Look for "Add to Home Screen" banner
- Or check browser menu for "Install App"

#### **Manual Install Button:**

If you want a custom install button, add this to your HTML:

```html
<button id="pwa-install-button" style="display: none;">
  Install App
</button>
```

The `pwa-init.js` script will automatically show/hide this button when install is available.

---

## 🔍 Debugging PWA Issues

### **Service Worker Not Registering?**

**Check:**
1. ✅ Service worker file exists: `/assets/js/new/service-worker.js`
2. ✅ File is served over HTTPS (or localhost)
3. ✅ No console errors
4. ✅ Browser supports service workers (Chrome, Edge, Firefox, Safari)

**Common Issues:**
- ❌ Service worker file not found (404 error)
- ❌ Not served over HTTPS (service workers require HTTPS)
- ❌ Browser doesn't support service workers (very old browsers)

### **Offline Mode Not Working?**

**Check:**
1. ✅ Service worker is registered
2. ✅ Assets are being cached (check Cache Storage)
3. ✅ Pages you're testing were visited while online
4. ✅ No errors in service worker console

**Common Issues:**
- ❌ Service worker not caching assets
- ❌ Cache cleared (browser cleared cache)
- ❌ Testing pages you haven't visited yet

### **Install Prompt Not Appearing?**

**Check:**
1. ✅ Manifest file exists: `/manifest.json`
2. ✅ Manifest is valid JSON
3. ✅ Icons exist (192x192 and 512x512)
4. ✅ App meets install criteria:
   - Served over HTTPS
   - Has valid manifest
   - Has registered service worker
   - User has engaged with site (visited multiple times)

**Common Issues:**
- ❌ Manifest file missing or invalid
- ❌ Icons missing or wrong size
- ❌ Not served over HTTPS
- ❌ User hasn't engaged enough (browser requirement)

---

## 📋 Testing Checklist

### **Installation Testing**
- [ ] Install prompt appears (desktop)
- [ ] Install prompt appears (mobile)
- [ ] App installs successfully
- [ ] App icon appears on home screen/desktop
- [ ] App opens in standalone mode
- [ ] App window has no browser UI

### **Offline Testing**
- [ ] Service worker registers
- [ ] Assets are cached
- [ ] App works offline (cached pages)
- [ ] Images load from cache
- [ ] Navigation works offline
- [ ] Error handling for API calls (shows offline message)

### **PWA Features**
- [ ] Manifest file loads correctly
- [ ] Theme color applies
- [ ] App name displays correctly
- [ ] Icons display correctly
- [ ] Standalone mode works
- [ ] Safe area support (mobile)

---

## 🎯 Expected Behavior

### **When Online:**
- ✅ App loads normally
- ✅ All features work
- ✅ Service worker caches assets
- ✅ Install prompt may appear

### **When Offline:**
- ✅ App shell loads (from cache)
- ✅ Cached pages work
- ✅ Cached images display
- ✅ Navigation works (between cached pages)
- ❌ API calls fail (expected)
- ❌ New pages won't load (expected)

### **After Installation:**
- ✅ App opens in standalone window
- ✅ No browser UI visible
- ✅ App icon on home screen/desktop
- ✅ Can launch like native app
- ✅ All features work (when online)

---

## 🚀 Quick Test Commands

### **Check Service Worker Status:**
```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
    console.log('Service Workers:', registrations);
});
```

### **Check Cache:**
```javascript
// In browser console
caches.keys().then(keys => {
    console.log('Caches:', keys);
});
```

### **Force Service Worker Update:**
```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => reg.update());
});
```

### **Clear Cache:**
```javascript
// In browser console
caches.keys().then(keys => {
    keys.forEach(key => caches.delete(key));
});
```

---

## 📱 Testing on Real Devices

### **Android:**
1. Deploy app to server (or use ngrok for local testing)
2. Open in Chrome on Android
3. Test install and offline mode

### **iOS:**
1. Deploy app to server
2. Open in Safari on iOS
3. Test "Add to Home Screen"
4. Test offline mode

### **Desktop:**
1. Open in Chrome/Edge
2. Test install
3. Test offline mode (DevTools)

---

## ⚠️ Important Notes

1. **HTTPS Required**: Service workers only work over HTTPS (or localhost)
2. **Browser Support**: Not all browsers support all PWA features
3. **Cache Limits**: Browsers have cache size limits
4. **Update Strategy**: Service workers update automatically when file changes
5. **Testing**: Always test on real devices for best results

---

## 🎉 Success Indicators

You'll know PWA is working when:
- ✅ Install prompt appears
- ✅ App installs successfully
- ✅ App opens in standalone mode
- ✅ Service worker is registered
- ✅ Assets are cached
- ✅ App works offline (cached content)

---

**Need Help?** Check browser console for errors and DevTools → Application tab for service worker status.



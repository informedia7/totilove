# 🧪 Testing Checklist - Step by Step

## ✅ Step 1: Install Dependencies

```bash
npm install
```

**Expected Output:**
- Vite, PostCSS, Autoprefixer, CSSnano, Terser installed
- No errors

**Check:**
- [ ] `node_modules` folder created
- [ ] No installation errors
- [ ] Package.json updated

---

## ✅ Step 2: Test Feature Flags (One at a Time)

### **2.1 Test New CSS Only**

```bash
USE_NEW_CSS=true node server.js
```

**What to Check:**
1. Open website in browser
2. Press `F12` → Go to "Network" tab
3. Look for new CSS files loading:
   - `/assets/css/new/00-tokens.css`
   - `/assets/css/new/01-base.css`
   - `/assets/css/new/02-components/components.css`
4. Check console for: `[AssetLoader] Loaded CSS: ...`
5. Visual check: Does page look identical?

**Expected:**
- ✅ New CSS files load
- ✅ Page looks identical to before
- ✅ No console errors
- ✅ No visual regressions

**If Issues:**
- Check browser console for errors
- Verify CSS files exist in `app/assets/css/new/`
- Check feature flags are injected correctly

---

### **2.2 Test New JavaScript Only**

```bash
USE_NEW_JS=true node server.js
```

**What to Check:**
1. Open website in browser
2. Press `F12` → Go to "Network" tab
3. Look for new JS files loading:
   - `/assets/js/new/core/utils.js`
   - `/assets/js/new/core/api-client.js`
   - `/assets/js/new/core/state.js`
4. Check console for: `[AssetLoader] Loaded: ...`
5. Test functionality:
   - Does API client work?
   - Does state manager work?
   - Any JavaScript errors?

**Expected:**
- ✅ New JS files load
- ✅ No console errors
- ✅ Functionality works correctly
- ✅ Old JS still works (parallel structure)

**If Issues:**
- Check browser console for errors
- Verify JS files exist
- Check for module import errors

---

### **2.3 Test New Components**

```bash
USE_NEW_COMPONENTS=true node server.js
```

**What to Check:**
1. Open a page with UserCard (e.g., results.html)
2. Check if new UserCard component loads
3. Test UserCard functionality:
   - Renders correctly?
   - Click actions work?
   - Images load?
   - Events fire correctly?

**Expected:**
- ✅ New components load
- ✅ Components work correctly
- ✅ No conflicts with old components

---

### **2.4 Test Everything Together**

```bash
ENABLE_ALL_NEW=true node server.js
```

**What to Check:**
1. All new CSS loads
2. All new JS loads
3. All components work
4. Page functions correctly
5. No conflicts or errors

**Expected:**
- ✅ Everything loads
- ✅ Everything works
- ✅ No errors
- ✅ Performance is good

---

## ✅ Step 3: Build Assets

### **3.1 Build for Production**

```bash
npm run build
```

**What Happens:**
- Vite bundles all JavaScript
- PostCSS processes all CSS
- Files are minified and optimized
- Output goes to `dist/` folder

**Expected Output:**
```
vite v5.x.x building for production...
✓ built in X.XXs
```

**Check:**
- [ ] `dist/` folder created
- [ ] JS files in `dist/js/`
- [ ] CSS files in `dist/css/`
- [ ] Files are minified (smaller size)
- [ ] Source maps created (if enabled)

**If Issues:**
- Check `vite.config.js` for errors
- Verify entry points exist
- Check for import errors

---

### **3.2 Build for Development**

```bash
npm run build:dev
```

**What Happens:**
- Same as production but with source maps
- Easier to debug

---

### **3.3 Watch Mode (Auto-rebuild)**

```bash
npm run build:watch
```

**What Happens:**
- Watches for file changes
- Automatically rebuilds
- Useful during development

---

## ✅ Step 4: Test PWA

### **4.1 Check Service Worker Registration**

1. Open website in browser
2. Press `F12` → "Application" tab
3. Click "Service Workers" in left sidebar
4. Should see: `/assets/js/new/service-worker.js`
5. Status should be: "activated and running"

**Expected:**
- ✅ Service worker registered
- ✅ Status: activated
- ✅ No errors

---

### **4.2 Test Installation**

**Desktop (Chrome/Edge):**
1. Look for install icon in address bar
2. Click "Install"
3. App installs
4. Find app icon on desktop
5. Launch app → Opens in standalone window

**Mobile (Android):**
1. Open in Chrome
2. Look for "Add to Home Screen" prompt
3. Tap "Add"
4. Icon appears on home screen
5. Tap icon → Opens fullscreen

**Expected:**
- ✅ Install prompt appears
- ✅ App installs successfully
- ✅ Opens in standalone mode
- ✅ No browser UI visible

---

### **4.3 Test Offline Mode**

**Step 1: Load pages while online**
1. Visit your website
2. Navigate to several pages
3. Let everything load completely

**Step 2: Go offline**
- Press `F12` → "Network" tab → Check "Offline"
- Or turn off WiFi/mobile data

**Step 3: Test offline**
1. Refresh page → Should still load
2. Navigate to cached pages → Should work
3. View cached images → Should display
4. Try API call → Will fail (expected)

**Expected:**
- ✅ Cached pages load offline
- ✅ Cached images display
- ✅ Navigation works
- ✅ API calls fail gracefully

---

## ✅ Step 5: Gradual Rollout

### **5.1 Enable for One Page First**

```bash
NEW_ARCH_PAGES=results.html node server.js
```

**What Happens:**
- Only `results.html` uses new architecture
- All other pages use old architecture
- Safe way to test

**Test:**
1. Visit `/results` → Uses new architecture
2. Visit `/matches` → Uses old architecture
3. Compare functionality
4. Check for issues

---

### **5.2 Enable for Multiple Pages**

```bash
NEW_ARCH_PAGES=results.html,matches.html,talk.html node server.js
```

**Test each page:**
- [ ] results.html works correctly
- [ ] matches.html works correctly
- [ ] talk.html works correctly
- [ ] No conflicts between pages

---

### **5.3 Enable for All Pages**

```bash
ENABLE_ALL_NEW=true node server.js
```

**Test all pages:**
- [ ] Home page
- [ ] Search/Results
- [ ] Matches
- [ ] Messages/Talk
- [ ] Profile pages
- [ ] Settings
- [ ] Account

---

## 🐛 Troubleshooting

### **Feature Flags Not Working?**

**Check:**
1. Feature flags injected in HTML?
   - View page source → Look for `window.FEATURE_FLAGS`
2. Asset loader script loaded?
   - Check Network tab → `asset-loader.js` loaded?
3. Console errors?
   - Check browser console for errors

**Fix:**
- Verify `config/featureFlags.js` exists
- Check template controller injects flags
- Verify asset-loader.js path is correct

---

### **Build Fails?**

**Check:**
1. All dependencies installed?
   ```bash
   npm install
   ```
2. Entry points exist?
   - Check `vite.config.js` → input paths correct?
3. Import errors?
   - Check console for module errors

**Fix:**
- Install missing dependencies
- Create missing entry point files
- Fix import paths

---

### **PWA Not Working?**

**Check:**
1. HTTPS or localhost?
   - Service workers require HTTPS (or localhost)
2. Service worker file exists?
   - Check `/assets/js/new/service-worker.js`
3. Manifest file exists?
   - Check `/manifest.json`
4. Icons exist?
   - Check icon paths in manifest

**Fix:**
- Deploy to HTTPS server
- Verify file paths
- Create missing icon files

---

## 📊 Success Criteria

### **CSS Migration Success:**
- ✅ New CSS loads correctly
- ✅ Visual appearance identical
- ✅ No layout shifts
- ✅ Mobile responsive works
- ✅ Performance improved (smaller files)

### **JavaScript Migration Success:**
- ✅ New JS loads correctly
- ✅ Functionality works
- ✅ No console errors
- ✅ Performance improved
- ✅ Code splitting works

### **PWA Success:**
- ✅ Service worker registers
- ✅ App installs successfully
- ✅ Offline mode works
- ✅ Cache works correctly
- ✅ Install prompt appears

---

## 🎯 Recommended Testing Order

1. **Week 1:** Test CSS only (`USE_NEW_CSS=true`)
2. **Week 2:** Test JS only (`USE_NEW_JS=true`)
3. **Week 3:** Test components (`USE_NEW_COMPONENTS=true`)
4. **Week 4:** Test one page (`NEW_ARCH_PAGES=results.html`)
5. **Week 5:** Test multiple pages
6. **Week 6:** Test everything (`ENABLE_ALL_NEW=true`)
7. **Week 7:** Test PWA features
8. **Week 8:** Production rollout

---

## 📝 Testing Log Template

```
Date: ___________
Feature: ___________
Status: ✅ Pass / ❌ Fail

What I tested:
- 

What I found:
- 

Issues:
- 

Next steps:
- 
```

---

**Ready to start testing?** Follow the steps above one at a time! 🚀



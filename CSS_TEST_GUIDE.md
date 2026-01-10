# 🧪 CSS Feature Flag Testing Guide

## Quick Test Steps

### Step 1: Start Server with New CSS Enabled

**PowerShell:**
```powershell
.\START_TESTING_CSS.ps1
```

**Or manually:**
```powershell
$env:USE_NEW_CSS="true"; node server.js
```

### Step 2: Open Browser & Check Network Tab

1. Open `http://localhost:3000` in your browser
2. Press `F12` to open DevTools
3. Go to **Network** tab
4. Refresh the page (`Ctrl+R` or `F5`)

### Step 3: Verify New CSS is Loading

**Look for:**
- ✅ `/dist/css/main-[hash].css` loading (the bundled CSS)
- ✅ Status: `200 OK`
- ✅ Size: Should be minified/optimized

**In Console tab, you should see:**
- ✅ `[AssetLoader] Loaded CSS: /dist/css/main-[hash].css`
- ✅ No CSS-related errors

### Step 4: Visual Check

**Pages to test:**
1. **Results page** (`/results`) - Check UserCard display
2. **Matches page** (`/matches`) - Check layout
3. **Talk page** (`/talk`) - Check chat interface
4. **Profile page** (`/profile`) - Check forms and buttons

**What to verify:**
- ✅ Pages look **identical** to before (no visual regressions)
- ✅ Buttons work correctly
- ✅ Modals open/close properly
- ✅ Forms display correctly
- ✅ Navigation works
- ✅ Responsive design works (resize browser)

### Step 5: Check Console for Errors

**Should see:**
- ✅ No CSS-related errors
- ✅ No missing file errors
- ✅ No import errors

**If you see errors:**
- Check `dist/css/` folder exists
- Run `npm run build` again
- Check feature flags are set correctly

---

## Troubleshooting

### CSS Not Loading?
1. Check feature flag: `$env:USE_NEW_CSS` should be `"true"`
2. Check `dist/css/main-[hash].css` exists
3. Run `npm run build` to rebuild
4. Check browser console for errors

### Visual Differences?
1. Compare side-by-side with old CSS
2. Check if responsive styles are working
3. Verify design tokens are applied
4. Check browser DevTools → Elements → Computed styles

### Build Errors?
1. Run `npm install` to ensure dependencies
2. Check `vite.config.js` for correct paths
3. Check `postcss.config.js` for correct plugins

---

## Success Criteria ✅

- [ ] New CSS file loads (`/dist/css/main-[hash].css`)
- [ ] No console errors
- [ ] Pages look identical to before
- [ ] All components render correctly
- [ ] Responsive design works
- [ ] Performance is good (check Network tab timing)

---

## Next Steps After CSS Test

Once CSS testing is successful:
1. ✅ Test JavaScript migration (`USE_NEW_JS=true`)
2. ✅ Test Components (`USE_NEW_COMPONENTS=true`)
3. ✅ Test PWA features
4. ✅ Gradual rollout to production


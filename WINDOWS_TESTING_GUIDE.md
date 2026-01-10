# 🪟 Windows Testing Guide

## How to Set Environment Variables on Windows

On Windows, the syntax for setting environment variables is different from Linux/Mac.

---

## ✅ Method 1: PowerShell (Recommended)

### **Test CSS Only:**
```powershell
$env:USE_NEW_CSS="true"; node server.js
```

### **Test JavaScript Only:**
```powershell
$env:USE_NEW_JS="true"; node server.js
```

### **Test Components:**
```powershell
$env:USE_NEW_COMPONENTS="true"; node server.js
```

### **Test Everything:**
```powershell
$env:ENABLE_ALL_NEW="true"; node server.js
```

### **Test One Page:**
```powershell
$env:NEW_ARCH_PAGES="results.html"; node server.js
```

### **Test Multiple Pages:**
```powershell
$env:NEW_ARCH_PAGES="results.html,matches.html,talk.html"; node server.js
```

### **Test Multiple Flags:**
```powershell
$env:USE_NEW_CSS="true"; $env:USE_NEW_JS="true"; node server.js
```

---

## ✅ Method 2: Using cmd.exe

### **Test CSS Only:**
```cmd
cmd /c "USE_NEW_CSS=true node server.js"
```

### **Test JavaScript Only:**
```cmd
cmd /c "USE_NEW_JS=true node server.js"
```

### **Test Everything:**
```cmd
cmd /c "ENABLE_ALL_NEW=true node server.js"
```

### **Test Multiple Flags:**
```cmd
cmd /c "USE_NEW_CSS=true USE_NEW_JS=true node server.js"
```

---

## ✅ Method 3: Create a Batch File (Easiest)

Create a file `test-css.bat`:
```batch
@echo off
set USE_NEW_CSS=true
node server.js
```

Then run:
```cmd
test-css.bat
```

---

## ✅ Method 4: PowerShell Scripts

Create a file `test-css.ps1`:
```powershell
$env:USE_NEW_CSS="true"
node server.js
```

Then run:
```powershell
.\test-css.ps1
```

---

## 🎯 Quick Reference

| What to Test | PowerShell Command | cmd.exe Command |
|-------------|-------------------|-----------------|
| CSS Only | `$env:USE_NEW_CSS="true"; node server.js` | `cmd /c "USE_NEW_CSS=true node server.js"` |
| JS Only | `$env:USE_NEW_JS="true"; node server.js` | `cmd /c "USE_NEW_JS=true node server.js"` |
| Components | `$env:USE_NEW_COMPONENTS="true"; node server.js` | `cmd /c "USE_NEW_COMPONENTS=true node server.js"` |
| Everything | `$env:ENABLE_ALL_NEW="true"; node server.js` | `cmd /c "ENABLE_ALL_NEW=true node server.js"` |
| One Page | `$env:NEW_ARCH_PAGES="results.html"; node server.js` | `cmd /c "NEW_ARCH_PAGES=results.html node server.js"` |

---

## 📝 Step-by-Step: Test CSS

### **Step 1: Open PowerShell**
- Press `Windows Key + X`
- Select "Windows PowerShell" or "Terminal"

### **Step 2: Navigate to Project**
```powershell
cd C:\Totilove_split
```

### **Step 3: Set Environment Variable and Start Server**
```powershell
$env:USE_NEW_CSS="true"; node server.js
```

### **Step 4: Test in Browser**
1. Open browser → `http://localhost:3000`
2. Press `F12` → "Network" tab
3. Look for new CSS files loading
4. Check console for: `[AssetLoader] Loaded CSS: ...`

---

## 🔍 Verify Feature Flags Are Set

### **Check in Browser Console:**
1. Open your website
2. Press `F12` → "Console" tab
3. Type: `window.FEATURE_FLAGS`
4. Should see: `{useNewCSS: true, ...}`

### **Check Server Logs:**
The server should log feature flag status when it starts.

---

## ⚠️ Important Notes

1. **Environment Variable Only Lasts for That Session**
   - When you close PowerShell, the variable is gone
   - You need to set it again each time

2. **Multiple Variables:**
   ```powershell
   $env:USE_NEW_CSS="true"; $env:USE_NEW_JS="true"; node server.js
   ```

3. **To Disable:**
   - Just restart server without the variable:
   ```powershell
   node server.js
   ```

---

## 🚀 Quick Start Commands

### **Test CSS (Recommended First):**
```powershell
$env:USE_NEW_CSS="true"; node server.js
```

### **Test JavaScript:**
```powershell
$env:USE_NEW_JS="true"; node server.js
```

### **Test Everything:**
```powershell
$env:ENABLE_ALL_NEW="true"; node server.js
```

### **Normal Mode (No New Features):**
```powershell
node server.js
```

---

## 🐛 Troubleshooting

### **Variable Not Working?**
1. Check spelling: `USE_NEW_CSS` (not `USE_NEW_CSSS`)
2. Check value: Must be `"true"` (lowercase)
3. Check server logs for feature flag status

### **Server Won't Start?**
1. Check if port 3000 is available
2. Check database connection
3. Check console for errors

### **CSS Not Loading?**
1. Check browser console for errors
2. Check Network tab for 404 errors
3. Verify CSS files exist in `app/assets/css/new/`

---

## 📖 More Help

- See `TESTING_CHECKLIST.md` for detailed testing steps
- See `QUICK_START_TESTING.md` for quick reference
- See `NEXT_STEPS_COMPLETE.md` for complete guide

---

**Ready to test?** Use Method 1 (PowerShell) - it's the easiest! 🚀



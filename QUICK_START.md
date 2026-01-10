# 🚀 Quick Start - Testing New CSS

## ✅ Easiest Way: Use the Script

### **Option 1: Double-Click Batch File**
1. Open File Explorer
2. Go to `C:\Totilove_split`
3. Double-click `START_TESTING.bat`
4. Server starts automatically!

### **Option 2: Run PowerShell Script**
```powershell
cd C:\Totilove_split
.\START_TESTING_CSS.ps1
```

---

## ✅ Manual Method (If Scripts Don't Work)

### **Step 1: Open PowerShell**
- Press `Windows Key + X`
- Select "Windows PowerShell" or "Terminal"

### **Step 2: Navigate to Project**
```powershell
cd C:\Totilove_split
```

### **Step 3: Verify You're in Right Place**
```powershell
Get-Location
```
Should show: `C:\Totilove_split`

### **Step 4: Check server.js Exists**
```powershell
Test-Path server.js
```
Should show: `True`

### **Step 5: Set Variable and Start Server**
```powershell
$env:USE_NEW_CSS="true"
node server.js
```

**OR in one line:**
```powershell
$env:USE_NEW_CSS="true"; node server.js
```

---

## ✅ Alternative: Use npm start

You can also modify `package.json` temporarily, or use npm scripts:

```powershell
cd C:\Totilove_split
$env:USE_NEW_CSS="true"
npm start
```

---

## 🔍 Troubleshooting

### **Error: Cannot find module 'server.js'**

**Problem:** You're in the wrong directory

**Solution:**
```powershell
# Check current directory
Get-Location

# Navigate to project
cd C:\Totilove_split

# Verify server.js exists
Test-Path server.js

# Should return: True
```

### **Error: 'USE_NEW_CSS' is not recognized**

**Problem:** Using wrong syntax

**Solution:** Use PowerShell syntax:
```powershell
$env:USE_NEW_CSS="true"; node server.js
```

NOT cmd.exe syntax:
```cmd
USE_NEW_CSS=true node server.js  ❌
```

---

## 📝 Step-by-Step Checklist

- [ ] Open PowerShell
- [ ] Run: `cd C:\Totilove_split`
- [ ] Run: `Get-Location` (verify it shows `C:\Totilove_split`)
- [ ] Run: `Test-Path server.js` (should return `True`)
- [ ] Run: `$env:USE_NEW_CSS="true"; node server.js`
- [ ] Server should start on `http://localhost:3000`
- [ ] Open browser and test!

---

## 🎯 What Should Happen

1. Server starts
2. You see: `Server running on port 3000`
3. Open browser → `http://localhost:3000`
4. Press `F12` → "Network" tab
5. Look for new CSS files loading
6. Check console for: `[AssetLoader] Loaded CSS: ...`

---

**Need Help?** Check `WINDOWS_TESTING_GUIDE.md` for more details!

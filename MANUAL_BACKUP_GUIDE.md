# 📋 Manual Backup Guide - What to Copy by Hand

## 🎯 **CRITICAL FILES** (Must backup these!)

### **1. Redis Database** 
```
📁 Copy: C:\totilove\dump.rdb
📂 To: Your backup folder
💡 Size: ~8KB (your chat messages and sessions)
```

### **2. Main Application Files**
```
📁 Copy: C:\totilove\server.js
📂 To: Your backup folder  
💡 Main server code

📁 Copy: C:\totilove\package.json
📂 To: Your backup folder
💡 Dependencies list

📁 Copy: C:\totilove\.env
📂 To: Your backup folder
💡 Database passwords and secrets
```

### **3. Chat Interface**
```
📁 Copy: C:\totilove\public\advanced-chat.html
📂 To: Your backup folder
💡 Your main chat interface
```

### **4. Services Directory**
```
📁 Copy: C:\totilove\services\
📂 To: Your backup folder (entire folder)
💡 Message handling logic
```

## 🗄️ **DATABASE BACKUP** (PostgreSQL)

### **Export Your Database**
```powershell
# Run this to export your database
pg_dump -h localhost -U postgres -d totilove_db > C:\backup\database_backup.sql
```

## 📁 **USER UPLOADS** (If you have profile images)
```
📁 Copy: C:\totilove\public\uploads\
📂 To: Your backup folder (entire folder)
💡 User profile images
```

## ⚙️ **Quick Manual Backup Script**

Save this as `manual-backup.bat`:

```batch
@echo off
echo Starting Manual Backup...

set BACKUP_DIR=C:\totilove-backup-%date:~-4,4%-%date:~-10,2%-%date:~-7,2%
mkdir "%BACKUP_DIR%"

echo Copying critical files...
copy "C:\totilove\dump.rdb" "%BACKUP_DIR%\"
copy "C:\totilove\server.js" "%BACKUP_DIR%\"
copy "C:\totilove\package.json" "%BACKUP_DIR%\"
copy "C:\totilove\.env" "%BACKUP_DIR%\"
copy "C:\totilove\public\advanced-chat.html" "%BACKUP_DIR%\"

echo Copying directories...
xcopy "C:\totilove\services" "%BACKUP_DIR%\services\" /E /I
xcopy "C:\totilove\public\uploads" "%BACKUP_DIR%\uploads\" /E /I

echo Backup completed to: %BACKUP_DIR%
pause
```

## 🚀 **Super Simple Method**

### **Option A: Copy Entire Project** (Easiest)
```powershell
# Just copy the whole thing (except node_modules)
robocopy C:\totilove C:\totilove-backup /E /XD node_modules backups logs temp
```

### **Option B: ZIP Everything** 
```powershell
# Create a ZIP file with everything important
Compress-Archive -Path "C:\totilove\*" -DestinationPath "C:\totilove-backup-$(Get-Date -Format 'yyyy-MM-dd').zip" -Exclude "node_modules","backups","logs","temp"
```

## 📊 **File Priority List**

### **🔴 CRITICAL (Must have these!)**
1. `dump.rdb` - Your Redis data (messages, sessions)
2. `server.js` - Main application
3. `.env` - Database credentials  
4. `advanced-chat.html` - Chat interface
5. `services/` folder - Core logic

### **🟡 IMPORTANT (Should have these)**
6. `package.json` - Dependencies
7. `public/uploads/` - User images
8. Database export (PostgreSQL dump)

### **🟢 NICE TO HAVE**
9. All your test files
10. Documentation files
11. Backup scripts

## 💾 **Restore Process**

### **To restore your backup:**
1. Copy files back to `C:\totilove\`
2. Run `npm install` to restore dependencies
3. Import database: `psql -U postgres -d totilove_db < database_backup.sql`
4. Start Redis and copy `dump.rdb` back
5. Start your server: `node server.js`

## 🎯 **Minimum Backup for Working System**

If you're in a hurry, just copy these 3 things:
```
1. dump.rdb (Redis data)
2. The entire C:\totilove folder 
3. Database export
```

That's it! Your system will work with just these files. ✅

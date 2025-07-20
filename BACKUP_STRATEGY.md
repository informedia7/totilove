# 💾 Complete Backup & Recovery Strategy for Totilove

## 🎯 Backup Overview

Your Totilove platform has **two critical data stores** that need different backup strategies:

### 📊 Data Classification
```
┌─────────────────┐    ┌─────────────────┐
│     REDIS       │    │   POSTGRESQL    │
│   (Volatile)    │    │  (Persistent)   │
├─────────────────┤    ├─────────────────┤
│ • Sessions      │    │ • Users         │
│ • Online Users  │    │ • Messages      │ 
│ • Recent Msgs   │    │ • Sessions      │
│ • Cache Data    │    │ • Profiles      │
│ • Temp Status   │    │ • System Data   │
└─────────────────┘    └─────────────────┘
   🔄 Regenerable        💎 Critical Data
   ⚡ Performance         🔒 Must Backup
```

## 🗄️ PostgreSQL Backup Strategy

### 1. **Automated Daily Backups**

Create this PowerShell backup script:

```powershell
# backup-postgres.ps1
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "C:\totilove\backups\postgres"
$databaseName = "totilove_db"  # Replace with your actual DB name
$backupFile = "$backupDir\totilove_backup_$timestamp.sql"

# Create backup directory if it doesn't exist
if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force
}

# Create PostgreSQL backup
pg_dump -h localhost -U postgres -d $databaseName > $backupFile

# Compress the backup
Compress-Archive -Path $backupFile -DestinationPath "$backupFile.zip"
Remove-Item $backupFile

# Keep only last 30 days of backups
Get-ChildItem $backupDir -Filter "*.zip" | 
    Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-30)} | 
    Remove-Item

Write-Host "✅ PostgreSQL backup completed: $backupFile.zip"
```

### 2. **Complete Database Schema + Data Backup**

```bash
# Full backup with schema and data
pg_dump -h localhost -U postgres -d totilove_db --clean --create --insert > full_backup.sql

# Schema only backup
pg_dump -h localhost -U postgres -d totilove_db --schema-only > schema_backup.sql

# Data only backup
pg_dump -h localhost -U postgres -d totilove_db --data-only --inserts > data_backup.sql
```

### 3. **Specific Table Backups**

```bash
# Backup critical tables separately
pg_dump -h localhost -U postgres -d totilove_db -t users > users_backup.sql
pg_dump -h localhost -U postgres -d totilove_db -t messages > messages_backup.sql
pg_dump -h localhost -U postgres -d totilove_db -t user_sessions > sessions_backup.sql
```

## 🔄 Redis Backup Strategy

### 1. **Redis Data Persistence**

Enable Redis persistence in `redis.conf`:

```conf
# Enable RDB snapshots
save 900 1      # Save if at least 1 key changed in 900 seconds
save 300 10     # Save if at least 10 keys changed in 300 seconds  
save 60 10000   # Save if at least 10000 keys changed in 60 seconds

# RDB file location
dir C:\totilove\redis-data
dbfilename dump.rdb

# Enable AOF (Append Only File) for better durability
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
```

### 2. **Redis Backup Script**

```powershell
# backup-redis.ps1
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "C:\totilove\backups\redis"
$redisDataDir = "C:\totilove\redis-data"

# Create backup directory
if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force
}

# Save current Redis state
redis-cli BGSAVE

# Wait for background save to complete
do {
    Start-Sleep -Seconds 2
    $saveTime = redis-cli LASTSAVE
} while ($saveTime -eq $previousSaveTime)

# Copy Redis files
Copy-Item "$redisDataDir\dump.rdb" "$backupDir\dump_$timestamp.rdb"
Copy-Item "$redisDataDir\appendonly.aof" "$backupDir\appendonly_$timestamp.aof"

# Compress Redis backup
Compress-Archive -Path "$backupDir\dump_$timestamp.rdb", "$backupDir\appendonly_$timestamp.aof" -DestinationPath "$backupDir\redis_backup_$timestamp.zip"

Write-Host "✅ Redis backup completed: redis_backup_$timestamp.zip"
```

## 📁 Application Code Backup

### 1. **Git Repository Backup**

```powershell
# backup-code.ps1
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "C:\totilove\backups\code"
$projectDir = "C:\totilove"

# Create backup directory
if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force
}

# Create Git bundle (complete repository backup)
git bundle create "$backupDir\totilove_repo_$timestamp.bundle" --all

# Create ZIP backup of entire project
Compress-Archive -Path $projectDir -DestinationPath "$backupDir\totilove_project_$timestamp.zip" -Exclude @("node_modules", ".git", "backups")

Write-Host "✅ Code backup completed: totilove_project_$timestamp.zip"
```

### 2. **Critical Files Backup**

```powershell
# backup-config.ps1
$configFiles = @(
    "package.json",
    "server.js", 
    "services\messageService.js",
    "public\advanced-chat.html",
    ".env",
    "redis.conf",
    "nginx.conf"  # if using nginx
)

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "C:\totilove\backups\config"

foreach ($file in $configFiles) {
    if (Test-Path $file) {
        $destFile = "$backupDir\${timestamp}_$(Split-Path $file -Leaf)"
        Copy-Item $file $destFile
    }
}
```

## 🚀 Complete Backup Automation

### **Master Backup Script**

```powershell
# master-backup.ps1
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupRoot = "C:\totilove\backups"
$logFile = "$backupRoot\backup_log_$timestamp.txt"

Write-Host "🚀 Starting complete Totilove backup..." | Tee-Object $logFile

try {
    # 1. PostgreSQL Backup
    Write-Host "📊 Backing up PostgreSQL..." | Tee-Object $logFile -Append
    & "$PSScriptRoot\backup-postgres.ps1"
    
    # 2. Redis Backup  
    Write-Host "🔄 Backing up Redis..." | Tee-Object $logFile -Append
    & "$PSScriptRoot\backup-redis.ps1"
    
    # 3. Code Backup
    Write-Host "📁 Backing up application code..." | Tee-Object $logFile -Append
    & "$PSScriptRoot\backup-code.ps1"
    
    # 4. Config Backup
    Write-Host "⚙️ Backing up configuration files..." | Tee-Object $logFile -Append
    & "$PSScriptRoot\backup-config.ps1"
    
    # 5. Upload Images Backup
    Write-Host "🖼️ Backing up user uploads..." | Tee-Object $logFile -Append
    Compress-Archive -Path "C:\totilove\public\uploads" -DestinationPath "$backupRoot\uploads\uploads_$timestamp.zip"
    
    Write-Host "✅ Complete backup finished successfully!" | Tee-Object $logFile -Append
    
} catch {
    Write-Host "❌ Backup failed: $($_.Exception.Message)" | Tee-Object $logFile -Append
    exit 1
}
```

### **Schedule Automated Backups**

```powershell
# Create scheduled task for daily backups
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File C:\totilove\scripts\master-backup.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At "2:00 AM"
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -TaskName "TotiloveBackup" -Description "Daily backup of Totilove platform"
```

## 🔄 Recovery Procedures

### **PostgreSQL Recovery**

```bash
# 1. Drop existing database (CAUTION!)
dropdb -U postgres totilove_db

# 2. Restore from backup
psql -U postgres < full_backup.sql

# 3. Or create database first then restore
createdb -U postgres totilove_db
psql -U postgres -d totilove_db < full_backup.sql
```

### **Redis Recovery**

```bash
# 1. Stop Redis server
redis-cli SHUTDOWN

# 2. Replace Redis data files
copy backup\dump.rdb C:\totilove\redis-data\dump.rdb
copy backup\appendonly.aof C:\totilove\redis-data\appendonly.aof

# 3. Start Redis server
redis-server C:\totilove\redis.conf
```

### **Application Recovery**

```powershell
# 1. Restore code from Git bundle
git clone totilove_repo_backup.bundle totilove_restored

# 2. Install dependencies
cd totilove_restored
npm install

# 3. Restore configuration
copy backup\config\* .

# 4. Restore uploads
Expand-Archive uploads_backup.zip -DestinationPath public\uploads
```

## 📊 Backup Verification

### **Automated Backup Testing**

```powershell
# test-backups.ps1
Write-Host "🧪 Testing backup integrity..."

# Test PostgreSQL backup
$testResult = pg_restore --list latest_backup.sql
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ PostgreSQL backup is valid"
} else {
    Write-Host "❌ PostgreSQL backup is corrupted"
}

# Test Redis backup
$redisTest = redis-check-rdb backup\dump.rdb
if ($redisTest -match "RDB looks OK") {
    Write-Host "✅ Redis backup is valid"
} else {
    Write-Host "❌ Redis backup is corrupted"
}

# Test code backup
if (Test-Path "backup\package.json") {
    Write-Host "✅ Code backup contains required files"
} else {
    Write-Host "❌ Code backup missing critical files"
}
```

## 🌍 Cloud Backup Strategy

### **Upload to Cloud Storage**

```powershell
# cloud-backup.ps1
# Using AWS S3, Google Drive, or Azure Blob Storage

# Example with AWS CLI
aws s3 sync C:\totilove\backups s3://your-totilove-backups/$(Get-Date -Format "yyyy-MM-dd")

# Example with Google Drive API
# Upload using Google Drive PowerShell module
```

## 📈 Backup Monitoring

### **Backup Health Dashboard**

```powershell
# backup-status.ps1
$backupDir = "C:\totilove\backups"
$today = Get-Date

Write-Host "📊 TOTILOVE BACKUP STATUS REPORT"
Write-Host "================================"

# Check PostgreSQL backups
$latestPg = Get-ChildItem "$backupDir\postgres" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "📊 PostgreSQL: Latest backup $(($today - $latestPg.LastWriteTime).Days) days ago"

# Check Redis backups  
$latestRedis = Get-ChildItem "$backupDir\redis" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "🔄 Redis: Latest backup $(($today - $latestRedis.LastWriteTime).Days) days ago"

# Check code backups
$latestCode = Get-ChildItem "$backupDir\code" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "📁 Code: Latest backup $(($today - $latestCode.LastWriteTime).Days) days ago"

# Check disk space
$space = Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DeviceID -eq "C:"}
Write-Host "💾 Disk Space: $([math]::Round($space.FreeSpace/1GB,2))GB free"
```

## 🚨 Disaster Recovery Plan

### **Recovery Time Objectives (RTO)**
- **Database**: 15 minutes
- **Redis**: 5 minutes  
- **Application**: 10 minutes
- **Total System**: 30 minutes

### **Recovery Point Objectives (RPO)**
- **Critical Data**: Max 1 hour loss
- **Sessions**: Max 15 minutes loss
- **Messages**: Max 5 minutes loss

### **Emergency Recovery Steps**
1. 🚨 **Assess Damage** - Identify failed components
2. 🗄️ **Restore Database** - PostgreSQL from latest backup
3. 🔄 **Rebuild Redis** - Restore from snapshot + rebuild sessions
4. 📁 **Deploy Code** - Restore from Git bundle
5. 🧪 **Test System** - Verify all functionality
6. 🚀 **Go Live** - Switch traffic to restored system

This comprehensive backup strategy ensures your Totilove platform can recover from any disaster while maintaining data integrity and minimal downtime.

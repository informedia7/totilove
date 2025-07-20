# 🔄 Redis Backup Guide for Totilove

## 📋 Overview

Redis stores your Totilove platform's real-time data:
- **User sessions** - Login tokens and authentication
- **Recent messages** - Last 100 messages per conversation for instant loading
- **Online status** - Currently connected users
- **Typing indicators** - Real-time typing status
- **Conversation cache** - Fast access to chat history

## 🛠️ Redis Backup Methods

### **Method 1: RDB Snapshots (Recommended)**

RDB creates point-in-time snapshots of your Redis data.

#### **Automatic RDB Snapshots**
Add these settings to your `redis.conf`:

```conf
# Save snapshots automatically
save 900 1      # Save if at least 1 key changed in 900 seconds (15 min)
save 300 10     # Save if at least 10 keys changed in 300 seconds (5 min)
save 60 10000   # Save if at least 10000 keys changed in 60 seconds (1 min)

# RDB file location
dir C:\totilove\redis-data
dbfilename totilove_dump.rdb

# Enable compression
rdbcompression yes
rdbchecksum yes
```

#### **Manual RDB Backup**
```powershell
# Force immediate backup
redis-cli BGSAVE

# Check when last save occurred
redis-cli LASTSAVE

# Wait for background save to complete
do {
    Start-Sleep -Seconds 2
    $currentSave = redis-cli LASTSAVE
} while ($currentSave -eq $previousSave)

# Copy the RDB file
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
Copy-Item "C:\totilove\redis-data\totilove_dump.rdb" "C:\totilove\backups\redis\dump_$timestamp.rdb"
```

### **Method 2: AOF (Append Only File)**

AOF logs every write operation for better durability.

#### **Enable AOF in redis.conf**
```conf
# Enable AOF
appendonly yes
appendfilename "totilove_appendonly.aof"
appendfsync everysec

# AOF rewrite settings
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# File location
dir C:\totilove\redis-data
```

#### **Manual AOF Backup**
```powershell
# Rewrite AOF to optimize size
redis-cli BGREWRITEAOF

# Copy AOF file
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
Copy-Item "C:\totilove\redis-data\totilove_appendonly.aof" "C:\totilove\backups\redis\aof_$timestamp.aof"
```

### **Method 3: Full Memory Dump**

Save all Redis data to a JSON-like format.

```powershell
# Export all keys and values
redis-cli --scan | ForEach-Object {
    $key = $_
    $type = redis-cli TYPE $key
    $value = switch ($type) {
        "string" { redis-cli GET $key }
        "hash" { redis-cli HGETALL $key }
        "list" { redis-cli LRANGE $key 0 -1 }
        "set" { redis-cli SMEMBERS $key }
        "zset" { redis-cli ZRANGE $key 0 -1 WITHSCORES }
        default { "unknown_type" }
    }
    [PSCustomObject]@{
        Key = $key
        Type = $type
        Value = $value
    }
} | ConvertTo-Json | Out-File "C:\totilove\backups\redis\redis_export_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').json"
```

## 🚀 Automated Redis Backup Script

Create `backup-redis-comprehensive.ps1`:

```powershell
param(
    [string]$BackupDir = "C:\totilove\backups\redis",
    [string]$RedisDataDir = "C:\totilove\redis-data",
    [switch]$IncludeExport = $false
)

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = "$BackupDir\redis_backup_$timestamp.log"

function Write-Log {
    param([string]$Message)
    $logEntry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $Message"
    Write-Host $logEntry
    Add-Content -Path $logFile -Value $logEntry
}

# Ensure backup directory exists
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Log "🔄 Starting Redis backup for Totilove..."

try {
    # 1. RDB Snapshot Backup
    Write-Log "📸 Creating RDB snapshot..."
    $previousSave = redis-cli LASTSAVE
    redis-cli BGSAVE | Out-Null
    
    # Wait for save to complete
    do {
        Start-Sleep -Seconds 2
        $currentSave = redis-cli LASTSAVE
    } while ($currentSave -eq $previousSave)
    
    # Copy RDB file
    if (Test-Path "$RedisDataDir\totilove_dump.rdb") {
        Copy-Item "$RedisDataDir\totilove_dump.rdb" "$BackupDir\dump_$timestamp.rdb"
        Write-Log "✅ RDB snapshot saved: dump_$timestamp.rdb"
    }
    
    # 2. AOF Backup (if enabled)
    Write-Log "📝 Backing up AOF file..."
    if (Test-Path "$RedisDataDir\totilove_appendonly.aof") {
        Copy-Item "$RedisDataDir\totilove_appendonly.aof" "$BackupDir\aof_$timestamp.aof"
        Write-Log "✅ AOF backup saved: aof_$timestamp.aof"
    } else {
        Write-Log "⚠️ AOF file not found - AOF might be disabled"
    }
    
    # 3. Redis Info and Stats
    Write-Log "📊 Saving Redis information..."
    $redisInfo = redis-cli INFO ALL
    $redisInfo | Out-File "$BackupDir\redis_info_$timestamp.txt"
    
    # Get key statistics
    $keyCount = redis-cli DBSIZE
    $memoryUsage = redis-cli INFO MEMORY | Select-String "used_memory_human"
    Write-Log "📈 Database contains $keyCount keys, Memory usage: $memoryUsage"
    
    # 4. Export specific Totilove data (optional)
    if ($IncludeExport) {
        Write-Log "🔍 Exporting Totilove-specific data..."
        
        # Export user sessions
        $sessions = redis-cli --scan --pattern "session:*" | ForEach-Object {
            [PSCustomObject]@{
                Key = $_
                Value = redis-cli HGETALL $_
            }
        }
        $sessions | ConvertTo-Json | Out-File "$BackupDir\sessions_export_$timestamp.json"
        
        # Export chat messages
        $chats = redis-cli --scan --pattern "chat:*:messages" | ForEach-Object {
            [PSCustomObject]@{
                Key = $_
                Value = redis-cli LRANGE $_ 0 -1
            }
        }
        $chats | ConvertTo-Json | Out-File "$BackupDir\chats_export_$timestamp.json"
        
        # Export online users
        $onlineUsers = redis-cli SMEMBERS "online_users"
        $onlineUsers | ConvertTo-Json | Out-File "$BackupDir\online_users_$timestamp.json"
        
        Write-Log "✅ Totilove data exported"
    }
    
    # 5. Create compressed archive
    Write-Log "📦 Creating compressed backup..."
    $backupFiles = Get-ChildItem $BackupDir -Filter "*_$timestamp.*"
    if ($backupFiles.Count -gt 0) {
        $zipFile = "$BackupDir\redis_complete_backup_$timestamp.zip"
        Compress-Archive -Path $backupFiles.FullName -DestinationPath $zipFile -Force
        
        # Remove individual files to save space
        $backupFiles | Remove-Item -Force
        
        Write-Log "📦 Compressed backup created: redis_complete_backup_$timestamp.zip"
    }
    
    # 6. Cleanup old backups (keep last 7 days)
    Write-Log "🧹 Cleaning up old backups..."
    Get-ChildItem $BackupDir -Filter "*.zip" | 
        Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-7)} | 
        Remove-Item -Force
    
    Write-Log "✅ Redis backup completed successfully!"
    
    # 7. Backup verification
    Write-Log "🧪 Verifying backup integrity..."
    if (Test-Path $zipFile) {
        $zipSize = (Get-Item $zipFile).Length / 1KB
        Write-Log "📊 Backup file size: $([math]::Round($zipSize, 2)) KB"
        
        # Test if zip is valid
        try {
            $testExtract = "$env:TEMP\redis_test_$timestamp"
            Expand-Archive $zipFile -DestinationPath $testExtract -Force
            Remove-Item $testExtract -Recurse -Force
            Write-Log "✅ Backup integrity verified"
        } catch {
            Write-Log "❌ Backup integrity check failed: $($_.Exception.Message)"
        }
    }
    
} catch {
    Write-Log "❌ Redis backup failed: $($_.Exception.Message)"
    exit 1
}

Write-Log "🎉 Redis backup process completed!"
```

## 🔄 Redis Backup Automation

### **1. Schedule Daily Backups**

```powershell
# Create scheduled task for Redis backups
$taskName = "TotiloveRedisBackup"
$scriptPath = "C:\totilove\backup-redis-comprehensive.ps1"

$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At "3:00 AM"
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -TaskName $taskName -Description "Daily Redis backup for Totilove chat system"
```

### **2. Real-time Monitoring Script**

```powershell
# redis-monitor.ps1 - Monitor Redis and trigger backups on high activity
while ($true) {
    $keyCount = redis-cli DBSIZE
    $memoryUsage = redis-cli INFO MEMORY | Select-String "used_memory:"
    $connectedClients = redis-cli INFO CLIENTS | Select-String "connected_clients:"
    
    Write-Host "$(Get-Date) - Keys: $keyCount, Memory: $memoryUsage, Clients: $connectedClients"
    
    # Trigger backup if many keys or high memory usage
    if ($keyCount -gt 1000 -or $memoryUsage -match "(\d+)" -and [int]$matches[1] -gt 50000000) {
        Write-Host "🔄 High activity detected - triggering backup..."
        & "C:\totilove\backup-redis-comprehensive.ps1"
    }
    
    Start-Sleep -Seconds 300  # Check every 5 minutes
}
```

## 📥 Redis Recovery Procedures

### **1. Restore from RDB**

```powershell
# Stop Redis server
redis-cli SHUTDOWN NOSAVE

# Replace RDB file
Copy-Item "C:\totilove\backups\redis\dump_TIMESTAMP.rdb" "C:\totilove\redis-data\totilove_dump.rdb" -Force

# Start Redis server
redis-server "C:\totilove\redis.conf"

# Verify restore
redis-cli PING
redis-cli DBSIZE
```

### **2. Restore from AOF**

```powershell
# Stop Redis server
redis-cli SHUTDOWN NOSAVE

# Replace AOF file
Copy-Item "C:\totilove\backups\redis\aof_TIMESTAMP.aof" "C:\totilove\redis-data\totilove_appendonly.aof" -Force

# Start Redis server with AOF enabled
redis-server "C:\totilove\redis.conf"

# Redis will replay AOF on startup
redis-cli PING
```

### **3. Restore from JSON Export**

```powershell
# Read JSON export
$backup = Get-Content "C:\totilove\backups\redis\redis_export_TIMESTAMP.json" | ConvertFrom-Json

# Restore each key
foreach ($item in $backup) {
    switch ($item.Type) {
        "string" { redis-cli SET $item.Key $item.Value }
        "hash" { 
            for ($i = 0; $i -lt $item.Value.Length; $i += 2) {
                redis-cli HSET $item.Key $item.Value[$i] $item.Value[$i+1]
            }
        }
        "list" { 
            $item.Value | ForEach-Object { redis-cli LPUSH $item.Key $_ }
        }
        # Add other types as needed
    }
}
```

## 🚨 Emergency Backup Commands

### **Quick Backup (1 minute)**
```powershell
# Emergency backup - saves everything immediately
redis-cli SAVE
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
Copy-Item "C:\totilove\redis-data\totilove_dump.rdb" "C:\totilove\emergency_backup_$timestamp.rdb"
```

### **Live Migration Backup**
```powershell
# Backup while keeping Redis running
redis-cli BGSAVE
redis-cli --rdb "C:\totilove\live_backup_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').rdb"
```

## 📊 Backup Verification

### **Test Backup Script**
```powershell
# test-redis-backup.ps1
$backupFile = "C:\totilove\backups\redis\redis_complete_backup_LATEST.zip"

if (Test-Path $backupFile) {
    Write-Host "✅ Backup file exists"
    
    # Test extraction
    $testDir = "$env:TEMP\redis_test_$(Get-Date -Format 'HHmmss')"
    Expand-Archive $backupFile -DestinationPath $testDir
    
    # Check for required files
    $rdbFile = Get-ChildItem $testDir -Filter "*.rdb"
    $aofFile = Get-ChildItem $testDir -Filter "*.aof"
    
    if ($rdbFile) { Write-Host "✅ RDB file found in backup" }
    if ($aofFile) { Write-Host "✅ AOF file found in backup" }
    
    # Cleanup
    Remove-Item $testDir -Recurse -Force
    
    Write-Host "✅ Backup verification completed"
} else {
    Write-Host "❌ No backup file found"
}
```

## 🔧 Best Practices

1. **Dual Method**: Use both RDB and AOF for maximum safety
2. **Regular Schedule**: Backup at least daily, more often for high activity
3. **Offsite Storage**: Copy backups to cloud storage or external drives
4. **Test Restores**: Regularly test backup restoration procedures
5. **Monitor Size**: Watch backup file sizes to detect issues
6. **Document Recovery**: Keep recovery procedures documented and tested

## 📈 Monitoring Redis Health

```powershell
# redis-health-check.ps1
$info = redis-cli INFO ALL
$keyCount = redis-cli DBSIZE
$memory = redis-cli INFO MEMORY | Select-String "used_memory_human"
$uptime = redis-cli INFO SERVER | Select-String "uptime_in_days"

Write-Host "📊 REDIS HEALTH REPORT"
Write-Host "Keys: $keyCount"
Write-Host "Memory: $memory"
Write-Host "Uptime: $uptime"
Write-Host "Last Save: $(redis-cli LASTSAVE)"
```

Your Redis data is now protected with multiple backup strategies! 🛡️

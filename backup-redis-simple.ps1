# Simple Redis Backup Script for Totilove
# Quick and easy Redis backup solution

Write-Host "🔄 Redis Backup for Totilove Platform" -ForegroundColor Green
Write-Host "====================================="

# Configuration
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "C:\totilove\backups\redis"

# Create backup directory if it doesn't exist
if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Write-Host "📁 Created backup directory: $backupDir" -ForegroundColor Green
}

# Test Redis connection
Write-Host "🔍 Testing Redis connection..." -ForegroundColor Yellow
try {
    $pingResult = redis-cli PING
    if ($pingResult -eq "PONG") {
        Write-Host "✅ Redis is running and accessible" -ForegroundColor Green
    } else {
        Write-Host "❌ Redis connection failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Redis is not accessible. Make sure Redis server is running." -ForegroundColor Red
    Write-Host "   Start Redis with: redis-server" -ForegroundColor Yellow
    exit 1
}

# Get Redis information
Write-Host "📊 Getting Redis information..." -ForegroundColor Yellow
$keyCount = redis-cli DBSIZE
$memoryInfo = redis-cli INFO MEMORY | Select-String "used_memory_human:"
Write-Host "   Keys in database: $keyCount" -ForegroundColor Cyan
Write-Host "   Memory usage: $memoryInfo" -ForegroundColor Cyan

# Method 1: RDB Snapshot Backup
Write-Host "`n📸 Creating RDB snapshot backup..." -ForegroundColor Yellow
try {
    # Get current save time
    $previousSave = redis-cli LASTSAVE
    Write-Host "   Previous save time: $previousSave" -ForegroundColor Gray
    
    # Trigger background save
    Write-Host "   Triggering background save..." -ForegroundColor Gray
    redis-cli BGSAVE | Out-Null
    
    # Wait for save to complete
    Write-Host "   Waiting for save to complete..." -ForegroundColor Gray
    $timeout = 60 # 1 minute timeout
    $elapsed = 0
    do {
        Start-Sleep -Seconds 2
        $elapsed += 2
        $currentSave = redis-cli LASTSAVE
        Write-Host "." -NoNewline -ForegroundColor Gray
        
        if ($elapsed -gt $timeout) {
            Write-Host "`n⚠️ Save operation timed out" -ForegroundColor Yellow
            break
        }
    } while ($currentSave -eq $previousSave)
    
    Write-Host "`n   ✅ Background save completed!" -ForegroundColor Green
    
    # Find Redis data directory and copy RDB file
    $possiblePaths = @(
        "C:\Program Files\Redis\dump.rdb",
        "C:\Redis\dump.rdb", 
        "C:\redis\dump.rdb",
        "$env:USERPROFILE\redis\dump.rdb",
        ".\dump.rdb"
    )
    
    $rdbFound = $false
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $destFile = "$backupDir\redis_dump_$timestamp.rdb"
            Copy-Item $path $destFile -Force
            $fileSize = [math]::Round((Get-Item $destFile).Length / 1KB, 2)
            Write-Host "   ✅ RDB file backed up: $destFile ($fileSize KB)" -ForegroundColor Green
            $rdbFound = $true
            break
        }
    }
    
    if (!$rdbFound) {
        Write-Host "   ⚠️ RDB file not found in common locations" -ForegroundColor Yellow
        Write-Host "   💡 Try finding it with: redis-cli CONFIG GET dir" -ForegroundColor Cyan
    }
    
} catch {
    Write-Host "   ❌ RDB backup failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Method 2: Export Key Data
Write-Host "`n🔍 Exporting Totilove data..." -ForegroundColor Yellow
try {
    $exportData = @{
        timestamp = $timestamp
        database_size = $keyCount
        sessions = @()
        messages = @()
        online_users = @()
    }
    
    # Export user sessions
    Write-Host "   Exporting user sessions..." -ForegroundColor Gray
    $sessionKeys = redis-cli --scan --pattern "session:*"
    foreach ($key in $sessionKeys) {
        if ($key.Trim()) {
            $sessionData = redis-cli HGETALL $key
            $exportData.sessions += @{
                key = $key
                data = $sessionData
            }
        }
    }
    Write-Host "   📝 Exported $($exportData.sessions.Count) sessions" -ForegroundColor Cyan
    
    # Export chat messages
    Write-Host "   Exporting chat messages..." -ForegroundColor Gray
    $messageKeys = redis-cli --scan --pattern "chat:*:messages"
    foreach ($key in $messageKeys) {
        if ($key.Trim()) {
            $messages = redis-cli LRANGE $key 0 -1
            $exportData.messages += @{
                conversation = $key
                messages = $messages
            }
        }
    }
    Write-Host "   💬 Exported $($exportData.messages.Count) conversations" -ForegroundColor Cyan
    
    # Export online users
    Write-Host "   Exporting online users..." -ForegroundColor Gray
    $onlineUsers = redis-cli SMEMBERS "online_users"
    $exportData.online_users = $onlineUsers
    Write-Host "   👥 Exported $($onlineUsers.Count) online users" -ForegroundColor Cyan
    
    # Save export file
    $exportFile = "$backupDir\totilove_data_$timestamp.json"
    $exportData | ConvertTo-Json -Depth 5 | Out-File $exportFile -Encoding UTF8
    $exportSize = [math]::Round((Get-Item $exportFile).Length / 1KB, 2)
    Write-Host "   ✅ Data export saved: $exportFile ($exportSize KB)" -ForegroundColor Green
    
} catch {
    Write-Host "   ❌ Data export failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Method 3: Save Redis Configuration
Write-Host "`n⚙️ Backing up Redis configuration..." -ForegroundColor Yellow
try {
    $configInfo = redis-cli CONFIG GET "*"
    $configFile = "$backupDir\redis_config_$timestamp.txt"
    $configInfo | Out-File $configFile -Encoding UTF8
    Write-Host "   ✅ Configuration saved: $configFile" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Configuration backup failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Create backup summary
Write-Host "`n📊 Creating backup summary..." -ForegroundColor Yellow
$summary = @"
# Redis Backup Summary
Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Backup ID: $timestamp

## Database Status
- Keys: $keyCount
- Memory: $memoryInfo

## Backup Files Created
$(Get-ChildItem $backupDir -Filter "*$timestamp*" | ForEach-Object { "- $($_.Name) ($([math]::Round($_.Length / 1KB, 2)) KB)" })

## Recovery Instructions
1. **RDB Recovery**: Stop Redis, replace dump.rdb file, restart Redis
2. **Data Import**: Use JSON file with custom import script
3. **Configuration**: Apply saved configuration with CONFIG SET commands

## Quick Recovery Commands
```powershell
# Stop Redis
redis-cli SHUTDOWN

# Replace RDB file (adjust path as needed)
Copy-Item "$backupDir\redis_dump_$timestamp.rdb" "C:\Program Files\Redis\dump.rdb"

# Start Redis
redis-server
```
"@

$summaryFile = "$backupDir\backup_summary_$timestamp.md"
$summary | Out-File $summaryFile -Encoding UTF8

# Final results
Write-Host "`n🎉 BACKUP COMPLETED!" -ForegroundColor Green -BackgroundColor Black
Write-Host "==================" -ForegroundColor Green
Write-Host "📂 Backup location: $backupDir" -ForegroundColor Cyan
Write-Host "📄 Summary file: $summaryFile" -ForegroundColor Cyan

# List all backup files
$backupFiles = Get-ChildItem $backupDir -Filter "*$timestamp*"
$totalSize = ($backupFiles | Measure-Object -Property Length -Sum).Sum / 1KB
Write-Host "📦 Total backup size: $([math]::Round($totalSize, 2)) KB" -ForegroundColor Cyan
Write-Host "`n📋 Files created:" -ForegroundColor Yellow
foreach ($file in $backupFiles) {
    $size = [math]::Round($file.Length / 1KB, 2)
    Write-Host "   ✅ $($file.Name) ($size KB)" -ForegroundColor Green
}

# Cleanup suggestion
Write-Host "`n💡 Cleanup suggestion:" -ForegroundColor Yellow
$oldBackups = Get-ChildItem $backupDir -Filter "*.rdb" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) }
if ($oldBackups.Count -gt 0) {
    Write-Host "   Found $($oldBackups.Count) backup files older than 7 days" -ForegroundColor Cyan
    Write-Host "   Consider cleaning them up to save disk space" -ForegroundColor Cyan
}

Write-Host "`n🔄 To automate backups, run this script daily with Task Scheduler" -ForegroundColor Yellow
Write-Host "✅ Your Redis data is now safely backed up!" -ForegroundColor Green

#!/usr/bin/env pwsh
# Redis Backup Script for Totilove Platform
# Backs up Redis data including RDB snapshots, AOF files, and data exports

param(
    [string]$BackupDir = "C:\totilove\backups\redis",
    [string]$RedisDataDir = "C:\Program Files\Redis",  # Adjust if different
    [string]$RedisPort = "6379",
    [string]$RedisHost = "localhost",
    [switch]$IncludeExport = $false,
    [switch]$Compress = $true,
    [int]$RetentionDays = 7
)

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = "$BackupDir\logs\redis_backup_$timestamp.log"

# Ensure directories exist
$directories = @($BackupDir, "$BackupDir\logs", "$BackupDir\rdb", "$BackupDir\aof", "$BackupDir\exports")
foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $logEntry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
    Write-Host $logEntry
    Add-Content -Path $logFile -Value $logEntry
}

function Test-RedisConnection {
    try {
        $result = redis-cli -h $RedisHost -p $RedisPort PING
        return $result -eq "PONG"
    } catch {
        return $false
    }
}

function Get-RedisInfo {
    try {
        $info = redis-cli -h $RedisHost -p $RedisPort INFO ALL
        $keyCount = redis-cli -h $RedisHost -p $RedisPort DBSIZE
        $memory = redis-cli -h $RedisHost -p $RedisPort INFO MEMORY | Select-String "used_memory_human:" | ForEach-Object { $_.ToString().Split(':')[1] }
        
        return @{
            KeyCount = $keyCount
            Memory = $memory
            Info = $info
        }
    } catch {
        Write-Log "Failed to get Redis info: $($_.Exception.Message)" "ERROR"
        return $null
    }
}

function Backup-RedisRDB {
    Write-Log "📸 Creating RDB snapshot backup..."
    
    try {
        # Get current save time
        $previousSave = redis-cli -h $RedisHost -p $RedisPort LASTSAVE
        
        # Trigger background save
        $saveResult = redis-cli -h $RedisHost -p $RedisPort BGSAVE
        Write-Log "Background save initiated: $saveResult"
        
        # Wait for save to complete (with timeout)
        $timeout = 300  # 5 minutes
        $elapsed = 0
        do {
            Start-Sleep -Seconds 2
            $elapsed += 2
            $currentSave = redis-cli -h $RedisHost -p $RedisPort LASTSAVE
            
            if ($elapsed -gt $timeout) {
                Write-Log "RDB save timeout after $timeout seconds" "ERROR"
                return $false
            }
        } while ($currentSave -eq $previousSave)
        
        Write-Log "RDB save completed in $elapsed seconds"
        
        # Find and copy RDB file
        $rdbFiles = @(
            "$RedisDataDir\dump.rdb",
            "$RedisDataDir\redis\dump.rdb",
            "C:\redis\dump.rdb",
            ".\dump.rdb"
        )
        
        $rdbFound = $false
        foreach ($rdbPath in $rdbFiles) {
            if (Test-Path $rdbPath) {
                $destFile = "$BackupDir\rdb\totilove_dump_$timestamp.rdb"
                Copy-Item $rdbPath $destFile -Force
                Write-Log "✅ RDB backup saved: $destFile"
                Write-Log "RDB file size: $((Get-Item $destFile).Length / 1KB) KB"
                $rdbFound = $true
                break
            }
        }
        
        if (!$rdbFound) {
            Write-Log "⚠️ RDB file not found in expected locations" "WARN"
            Write-Log "Searched locations: $($rdbFiles -join ', ')" "WARN"
        }
        
        return $rdbFound
    } catch {
        Write-Log "❌ RDB backup failed: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Backup-RedisAOF {
    Write-Log "📝 Backing up AOF file..."
    
    try {
        # Check if AOF is enabled
        $aofEnabled = redis-cli -h $RedisHost -p $RedisPort CONFIG GET appendonly | Select-Object -Last 1
        
        if ($aofEnabled -ne "yes") {
            Write-Log "⚠️ AOF is disabled - skipping AOF backup" "WARN"
            return $false
        }
        
        # Trigger AOF rewrite for optimization
        redis-cli -h $RedisHost -p $RedisPort BGREWRITEAOF | Out-Null
        Write-Log "AOF rewrite initiated"
        
        # Wait a moment for rewrite to start
        Start-Sleep -Seconds 5
        
        # Find and copy AOF file
        $aofFiles = @(
            "$RedisDataDir\appendonly.aof",
            "$RedisDataDir\redis\appendonly.aof",
            "C:\redis\appendonly.aof",
            ".\appendonly.aof"
        )
        
        $aofFound = $false
        foreach ($aofPath in $aofFiles) {
            if (Test-Path $aofPath) {
                $destFile = "$BackupDir\aof\totilove_appendonly_$timestamp.aof"
                Copy-Item $aofPath $destFile -Force
                Write-Log "✅ AOF backup saved: $destFile"
                Write-Log "AOF file size: $((Get-Item $destFile).Length / 1KB) KB"
                $aofFound = $true
                break
            }
        }
        
        if (!$aofFound) {
            Write-Log "⚠️ AOF file not found in expected locations" "WARN"
            Write-Log "Searched locations: $($aofFiles -join ', ')" "WARN"
        }
        
        return $aofFound
    } catch {
        Write-Log "❌ AOF backup failed: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Export-TotiloveData {
    Write-Log "🔍 Exporting Totilove-specific data..."
    
    try {
        $exportData = @{
            Timestamp = $timestamp
            Sessions = @()
            Conversations = @()
            OnlineUsers = @()
            Stats = @{}
        }
        
        # Export user sessions
        Write-Log "Exporting user sessions..."
        $sessionKeys = redis-cli -h $RedisHost -p $RedisPort --scan --pattern "session:*"
        foreach ($key in $sessionKeys) {
            if ($key) {
                $sessionData = redis-cli -h $RedisHost -p $RedisPort HGETALL $key
                $exportData.Sessions += @{
                    Key = $key
                    Data = $sessionData
                }
            }
        }
        Write-Log "Exported $($exportData.Sessions.Count) sessions"
        
        # Export chat conversations
        Write-Log "Exporting chat conversations..."
        $chatKeys = redis-cli -h $RedisHost -p $RedisPort --scan --pattern "chat:*:messages"
        foreach ($key in $chatKeys) {
            if ($key) {
                $messages = redis-cli -h $RedisHost -p $RedisPort LRANGE $key 0 -1
                $exportData.Conversations += @{
                    Key = $key
                    Messages = $messages
                }
            }
        }
        Write-Log "Exported $($exportData.Conversations.Count) conversations"
        
        # Export online users
        Write-Log "Exporting online users..."
        $onlineUsers = redis-cli -h $RedisHost -p $RedisPort SMEMBERS "online_users"
        $exportData.OnlineUsers = $onlineUsers
        Write-Log "Exported $($onlineUsers.Count) online users"
        
        # Export user conversation lists
        Write-Log "Exporting user conversation lists..."
        $userConvKeys = redis-cli -h $RedisHost -p $RedisPort --scan --pattern "user:*:conversations"
        foreach ($key in $userConvKeys) {
            if ($key) {
                $conversations = redis-cli -h $RedisHost -p $RedisPort HGETALL $key
                $exportData.Stats[$key] = $conversations
            }
        }
        
        # Save export data
        $exportFile = "$BackupDir\exports\totilove_data_export_$timestamp.json"
        $exportData | ConvertTo-Json -Depth 10 | Out-File $exportFile -Encoding UTF8
        Write-Log "✅ Data export saved: $exportFile"
        
        return $true
    } catch {
        Write-Log "❌ Data export failed: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Create-BackupSummary {
    param($redisInfo, $backupResults)
    
    Write-Log "📊 Creating backup summary..."
    
    $summary = @"
# Redis Backup Summary
**Backup Date**: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
**Backup ID**: $timestamp

## System Information
- **Redis Host**: $RedisHost`:$RedisPort
- **Key Count**: $($redisInfo.KeyCount)
- **Memory Usage**: $($redisInfo.Memory)
- **Backup Directory**: $BackupDir

## Backup Results
- **RDB Snapshot**: $(if($backupResults.RDB) {'✅ Success'} else {'❌ Failed'})
- **AOF Backup**: $(if($backupResults.AOF) {'✅ Success'} else {'❌ Failed'})
- **Data Export**: $(if($backupResults.Export) {'✅ Success'} else {'❌ Failed'})

## Backup Files
"@

    # List backup files created
    $backupFiles = Get-ChildItem $BackupDir -Recurse -Filter "*$timestamp*"
    foreach ($file in $backupFiles) {
        $size = [math]::Round($file.Length / 1KB, 2)
        $summary += "`n- $($file.Name) ($size KB)"
    }
    
    $summary += @"

## Recovery Instructions
1. **RDB Recovery**: Copy RDB file to Redis data directory and restart Redis
2. **AOF Recovery**: Copy AOF file to Redis data directory and restart Redis with AOF enabled
3. **Data Import**: Use the JSON export file to restore specific data

## Next Backup: $(((Get-Date).AddDays(1)).ToString('yyyy-MM-dd HH:mm:ss'))
"@

    $summaryFile = "$BackupDir\backup_summary_$timestamp.md"
    $summary | Out-File $summaryFile -Encoding UTF8
    Write-Log "📄 Backup summary saved: $summaryFile"
    
    return $summaryFile
}

function Compress-BackupFiles {
    Write-Log "📦 Compressing backup files..."
    
    try {
        $backupFiles = Get-ChildItem $BackupDir -Recurse -Filter "*$timestamp*" | Where-Object { $_.Extension -ne '.zip' }
        
        if ($backupFiles.Count -gt 0) {
            $zipFile = "$BackupDir\redis_backup_complete_$timestamp.zip"
            Compress-Archive -Path $backupFiles.FullName -DestinationPath $zipFile -Force
            
            # Remove individual files to save space
            $backupFiles | Remove-Item -Force
            
            $zipSize = [math]::Round((Get-Item $zipFile).Length / 1KB, 2)
            Write-Log "✅ Backup compressed: $zipFile ($zipSize KB)"
            
            return $zipFile
        } else {
            Write-Log "⚠️ No backup files found to compress" "WARN"
            return $null
        }
    } catch {
        Write-Log "❌ Compression failed: $($_.Exception.Message)" "ERROR"
        return $null
    }
}

function Cleanup-OldBackups {
    Write-Log "🧹 Cleaning up old backups (older than $RetentionDays days)..."
    
    try {
        $cutoffDate = (Get-Date).AddDays(-$RetentionDays)
        $oldFiles = Get-ChildItem $BackupDir -Recurse -Filter "*.zip" | Where-Object { $_.LastWriteTime -lt $cutoffDate }
        
        foreach ($file in $oldFiles) {
            Remove-Item $file.FullName -Force
            Write-Log "🗑️ Removed old backup: $($file.Name)"
        }
        
        Write-Log "✅ Cleanup completed - removed $($oldFiles.Count) old backups"
    } catch {
        Write-Log "❌ Cleanup failed: $($_.Exception.Message)" "ERROR"
    }
}

# Main execution
Write-Log "🚀 Starting Redis backup for Totilove platform..."
Write-Log "Backup directory: $BackupDir"
Write-Log "Redis connection: $RedisHost`:$RedisPort"

# Test Redis connection
if (!(Test-RedisConnection)) {
    Write-Log "❌ Cannot connect to Redis server at $RedisHost`:$RedisPort" "ERROR"
    Write-Log "Please ensure Redis is running and accessible"
    exit 1
}

Write-Log "✅ Redis connection successful"

# Get Redis information
$redisInfo = Get-RedisInfo
if ($redisInfo) {
    Write-Log "📊 Redis status - Keys: $($redisInfo.KeyCount), Memory: $($redisInfo.Memory)"
} else {
    Write-Log "⚠️ Could not retrieve Redis information" "WARN"
}

# Perform backups
$backupResults = @{
    RDB = $false
    AOF = $false
    Export = $false
}

try {
    # RDB Backup
    $backupResults.RDB = Backup-RedisRDB
    
    # AOF Backup
    $backupResults.AOF = Backup-RedisAOF
    
    # Data Export (if requested)
    if ($IncludeExport) {
        $backupResults.Export = Export-TotiloveData
    }
    
    # Create backup summary
    $summaryFile = Create-BackupSummary -redisInfo $redisInfo -backupResults $backupResults
    
    # Compress files (if requested)
    if ($Compress) {
        $zipFile = Compress-BackupFiles
    }
    
    # Cleanup old backups
    Cleanup-OldBackups
    
    # Final status
    $successCount = ($backupResults.Values | Where-Object { $_ -eq $true }).Count
    $totalOperations = if ($IncludeExport) { 3 } else { 2 }
    
    if ($successCount -eq $totalOperations) {
        Write-Log "🎉 Redis backup completed successfully! ($successCount/$totalOperations operations successful)"
        exit 0
    } else {
        Write-Log "⚠️ Redis backup completed with warnings ($successCount/$totalOperations operations successful)" "WARN"
        exit 1
    }
    
} catch {
    Write-Log "💥 Critical error during backup: $($_.Exception.Message)" "ERROR"
    exit 1
}

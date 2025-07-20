#!/usr/bin/env pwsh
# Complete Totilove Backup System
# This script creates all necessary backup automation for your platform

param(
    [string]$BackupType = "all",  # all, postgres, redis, code, config
    [string]$BackupDir = "C:\totilove\backups",
    [string]$DatabaseName = "totilove_db",
    [switch]$Compress = $true,
    [switch]$UploadToCloud = $false
)

# Configuration
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = "$BackupDir\logs\backup_$timestamp.log"

# Ensure backup directories exist
$directories = @(
    "$BackupDir\postgres",
    "$BackupDir\redis", 
    "$BackupDir\code",
    "$BackupDir\config",
    "$BackupDir\uploads",
    "$BackupDir\logs"
)

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

function Backup-PostgreSQL {
    Write-Log "🗄️ Starting PostgreSQL backup..."
    
    $backupFile = "$BackupDir\postgres\totilove_pg_$timestamp.sql"
    
    try {
        # Full database backup
        $env:PGPASSWORD = "your_password"  # Set your PostgreSQL password
        pg_dump -h localhost -U postgres -d $DatabaseName --clean --create --insert -f $backupFile
        
        if ($LASTEXITCODE -eq 0) {
            Write-Log "✅ PostgreSQL backup completed: $backupFile"
            
            if ($Compress) {
                Compress-Archive -Path $backupFile -DestinationPath "$backupFile.zip" -Force
                Remove-Item $backupFile
                Write-Log "📦 PostgreSQL backup compressed"
            }
            
            # Clean old backups (keep 30 days)
            Get-ChildItem "$BackupDir\postgres" -Filter "*.zip" | 
                Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-30)} | 
                Remove-Item -Force
                
            return $true
        } else {
            Write-Log "❌ PostgreSQL backup failed" "ERROR"
            return $false
        }
    } catch {
        Write-Log "❌ PostgreSQL backup error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Backup-Redis {
    Write-Log "🔄 Starting Redis backup..."
    
    try {
        # Trigger Redis background save
        redis-cli BGSAVE | Out-Null
        
        # Wait for save to complete
        $previousSaveTime = redis-cli LASTSAVE
        do {
            Start-Sleep -Seconds 2
            $currentSaveTime = redis-cli LASTSAVE
        } while ($currentSaveTime -eq $previousSaveTime)
        
        # Copy Redis data files
        $redisDataDir = "C:\Program Files\Redis"  # Adjust path as needed
        $backupFiles = @()
        
        if (Test-Path "$redisDataDir\dump.rdb") {
            $dumpBackup = "$BackupDir\redis\dump_$timestamp.rdb"
            Copy-Item "$redisDataDir\dump.rdb" $dumpBackup
            $backupFiles += $dumpBackup
        }
        
        if (Test-Path "$redisDataDir\appendonly.aof") {
            $aofBackup = "$BackupDir\redis\appendonly_$timestamp.aof"
            Copy-Item "$redisDataDir\appendonly.aof" $aofBackup
            $backupFiles += $aofBackup
        }
        
        if ($backupFiles.Count -gt 0) {
            if ($Compress) {
                $zipFile = "$BackupDir\redis\redis_backup_$timestamp.zip"
                Compress-Archive -Path $backupFiles -DestinationPath $zipFile -Force
                $backupFiles | Remove-Item -Force
                Write-Log "📦 Redis backup compressed: $zipFile"
            }
            
            Write-Log "✅ Redis backup completed"
            return $true
        } else {
            Write-Log "⚠️ No Redis data files found" "WARN"
            return $false
        }
    } catch {
        Write-Log "❌ Redis backup error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Backup-Code {
    Write-Log "📁 Starting code backup..."
    
    try {
        $projectDir = "C:\totilove"
        $gitBundle = "$BackupDir\code\totilove_repo_$timestamp.bundle"
        $codeZip = "$BackupDir\code\totilove_code_$timestamp.zip"
        
        # Create Git bundle (complete repository)
        if (Test-Path "$projectDir\.git") {
            git -C $projectDir bundle create $gitBundle --all
            Write-Log "📦 Git repository bundled: $gitBundle"
        }
        
        # Create ZIP of source code (excluding heavy directories)
        $excludePaths = @("node_modules", ".git", "backups", "logs", "temp")
        $tempDir = "$env:TEMP\totilove_backup_$timestamp"
        
        # Copy project files excluding heavy directories
        robocopy $projectDir $tempDir /E /XD $excludePaths /NFL /NDL /NJH /NJS /NC /NS /NP
        
        if (Test-Path $tempDir) {
            Compress-Archive -Path "$tempDir\*" -DestinationPath $codeZip -Force
            Remove-Item $tempDir -Recurse -Force
            Write-Log "📦 Code backup created: $codeZip"
        }
        
        Write-Log "✅ Code backup completed"
        return $true
    } catch {
        Write-Log "❌ Code backup error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Backup-Config {
    Write-Log "⚙️ Starting configuration backup..."
    
    try {
        $configFiles = @(
            "package.json",
            "package-lock.json", 
            "server.js",
            ".env",
            "ecosystem.config.js",
            "nginx.conf",
            "redis.conf"
        )
        
        $configBackupDir = "$BackupDir\config\$timestamp"
        New-Item -ItemType Directory -Path $configBackupDir -Force | Out-Null
        
        foreach ($file in $configFiles) {
            $fullPath = "C:\totilove\$file"
            if (Test-Path $fullPath) {
                Copy-Item $fullPath "$configBackupDir\$file"
                Write-Log "📄 Backed up: $file"
            }
        }
        
        # Backup services directory
        if (Test-Path "C:\totilove\services") {
            Copy-Item "C:\totilove\services" "$configBackupDir\services" -Recurse
            Write-Log "📁 Backed up services directory"
        }
        
        if ($Compress) {
            $configZip = "$BackupDir\config\config_$timestamp.zip"
            Compress-Archive -Path "$configBackupDir\*" -DestinationPath $configZip -Force
            Remove-Item $configBackupDir -Recurse -Force
            Write-Log "📦 Configuration backup compressed: $configZip"
        }
        
        Write-Log "✅ Configuration backup completed"
        return $true
    } catch {
        Write-Log "❌ Configuration backup error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Backup-Uploads {
    Write-Log "🖼️ Starting uploads backup..."
    
    try {
        $uploadsDir = "C:\totilove\public\uploads"
        if (Test-Path $uploadsDir) {
            $uploadsZip = "$BackupDir\uploads\uploads_$timestamp.zip"
            Compress-Archive -Path "$uploadsDir\*" -DestinationPath $uploadsZip -Force
            Write-Log "📦 Uploads backup created: $uploadsZip"
            
            # Clean old upload backups (keep 7 days)
            Get-ChildItem "$BackupDir\uploads" -Filter "*.zip" | 
                Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-7)} | 
                Remove-Item -Force
                
            Write-Log "✅ Uploads backup completed"
            return $true
        } else {
            Write-Log "⚠️ Uploads directory not found" "WARN"
            return $false
        }
    } catch {
        Write-Log "❌ Uploads backup error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-BackupIntegrity {
    Write-Log "🧪 Testing backup integrity..."
    
    $results = @{
        postgres = $false
        redis = $false
        code = $false
    }
    
    # Test PostgreSQL backup
    $latestPgBackup = Get-ChildItem "$BackupDir\postgres" -Filter "*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latestPgBackup) {
        # Extract and test
        $tempDir = "$env:TEMP\pg_test_$timestamp"
        Expand-Archive $latestPgBackup.FullName -DestinationPath $tempDir
        $sqlFile = Get-ChildItem $tempDir -Filter "*.sql" | Select-Object -First 1
        if ($sqlFile) {
            # Simple validation - check if file contains expected SQL commands
            $content = Get-Content $sqlFile.FullName -TotalCount 10
            if ($content -match "CREATE|INSERT|DROP") {
                $results.postgres = $true
                Write-Log "✅ PostgreSQL backup integrity verified"
            }
        }
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    # Test Redis backup
    $latestRedisBackup = Get-ChildItem "$BackupDir\redis" -Filter "*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latestRedisBackup) {
        $results.redis = $true
        Write-Log "✅ Redis backup found and accessible"
    }
    
    # Test code backup
    $latestCodeBackup = Get-ChildItem "$BackupDir\code" -Filter "*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latestCodeBackup) {
        $results.code = $true
        Write-Log "✅ Code backup found and accessible"
    }
    
    return $results
}

function Generate-BackupReport {
    Write-Log "📊 Generating backup report..."
    
    $report = @"
# 📊 TOTILOVE BACKUP REPORT
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## 📈 Backup Statistics
| Component | Latest Backup | Size | Status |
|-----------|---------------|------|--------|
"@

    $components = @("postgres", "redis", "code", "config", "uploads")
    
    foreach ($component in $components) {
        $componentDir = "$BackupDir\$component"
        if (Test-Path $componentDir) {
            $latestBackup = Get-ChildItem $componentDir | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($latestBackup) {
                $size = [math]::Round($latestBackup.Length / 1MB, 2)
                $age = [math]::Round((Get-Date - $latestBackup.LastWriteTime).TotalHours, 1)
                $status = if ($age -lt 24) { "✅ Good" } elseif ($age -lt 48) { "⚠️ Old" } else { "❌ Critical" }
                $report += "| $component | $($latestBackup.Name) | ${size}MB | $status |`n"
            } else {
                $report += "| $component | None found | 0MB | ❌ Missing |`n"
            }
        } else {
            $report += "| $component | No directory | 0MB | ❌ Missing |`n"
        }
    }
    
    $report += @"

## 💾 Storage Usage
- Backup Directory: $BackupDir
- Total Backup Size: $((Get-ChildItem $BackupDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB | ForEach-Object {[math]::Round($_, 2)})MB
- Available Disk Space: $((Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DeviceID -eq "C:"}).FreeSpace / 1GB | ForEach-Object {[math]::Round($_, 2)})GB

## 🔄 Recommended Actions
- Monitor backup sizes and clean old backups regularly
- Test restore procedures monthly
- Consider offsite backup storage for disaster recovery
- Verify backup integrity weekly

---
*Report generated by Totilove Backup System*
"@

    $reportFile = "$BackupDir\logs\backup_report_$timestamp.md"
    $report | Out-File -FilePath $reportFile -Encoding UTF8
    Write-Log "📄 Backup report saved: $reportFile"
    
    return $reportFile
}

# Main execution
Write-Log "🚀 Starting Totilove backup process..."
Write-Log "📋 Backup type: $BackupType"
Write-Log "📂 Backup directory: $BackupDir"

$success = @()
$failures = @()

try {
    switch ($BackupType.ToLower()) {
        "all" {
            if (Backup-PostgreSQL) { $success += "PostgreSQL" } else { $failures += "PostgreSQL" }
            if (Backup-Redis) { $success += "Redis" } else { $failures += "Redis" }
            if (Backup-Code) { $success += "Code" } else { $failures += "Code" }
            if (Backup-Config) { $success += "Config" } else { $failures += "Config" }
            if (Backup-Uploads) { $success += "Uploads" } else { $failures += "Uploads" }
        }
        "postgres" { if (Backup-PostgreSQL) { $success += "PostgreSQL" } else { $failures += "PostgreSQL" } }
        "redis" { if (Backup-Redis) { $success += "Redis" } else { $failures += "Redis" } }
        "code" { if (Backup-Code) { $success += "Code" } else { $failures += "Code" } }
        "config" { if (Backup-Config) { $success += "Config" } else { $failures += "Config" } }
        default { Write-Log "❌ Invalid backup type: $BackupType" "ERROR"; exit 1 }
    }
    
    # Test backup integrity
    if ($BackupType -eq "all") {
        Test-BackupIntegrity | Out-Null
    }
    
    # Generate report
    $reportFile = Generate-BackupReport
    
    # Summary
    Write-Log "📊 BACKUP SUMMARY"
    Write-Log "✅ Successful: $($success -join ', ')"
    if ($failures.Count -gt 0) {
        Write-Log "❌ Failed: $($failures -join ', ')" "ERROR"
    }
    
    Write-Log "📄 Full report: $reportFile"
    Write-Log "🎉 Backup process completed!"
    
    # Upload to cloud if requested
    if ($UploadToCloud) {
        Write-Log "☁️ Uploading to cloud storage..."
        # Add your cloud upload logic here
        # aws s3 sync $BackupDir s3://your-bucket/totilove-backups/
    }
    
} catch {
    Write-Log "💥 Critical error during backup: $($_.Exception.Message)" "ERROR"
    exit 1
}

# Cleanup
if ($failures.Count -eq 0) {
    Write-Log "✅ All backups completed successfully!"
    exit 0
} else {
    Write-Log "⚠️ Some backups failed. Check logs for details." "WARN"
    exit 1
}

# 💾 Simple Manual Redis Backup for Totilove
# Just run this script whenever you want to backup your Redis data

Write-Host "🔄 Creating manual Redis backup..." -ForegroundColor Green

# Create timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "C:\totilove\backups\redis"

# Ensure backup directory exists
if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Write-Host "📁 Created backup directory" -ForegroundColor Green
}

try {
    # Test Redis connection
    $ping = & "C:\redis\redis-cli.exe" PING
    if ($ping -ne "PONG") {
        Write-Host "❌ Redis not responding" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Redis is running" -ForegroundColor Green
    
    # Get current data info
    $keyCount = & "C:\redis\redis-cli.exe" DBSIZE
    Write-Host "📊 Database has $keyCount keys" -ForegroundColor Cyan
    
    # Force a save
    Write-Host "💾 Saving current state..." -ForegroundColor Yellow
    & "C:\redis\redis-cli.exe" BGSAVE | Out-Null
    
    # Wait for save to complete
    Start-Sleep -Seconds 3
    
    # Copy the dump file
    $sourceFile = "C:\totilove\dump.rdb"
    $backupFile = "$backupDir\manual_backup_$timestamp.rdb"
    
    if (Test-Path $sourceFile) {
        Copy-Item $sourceFile $backupFile -Force
        $size = [math]::Round((Get-Item $backupFile).Length / 1KB, 2)
        Write-Host "✅ Backup created: manual_backup_$timestamp.rdb ($size KB)" -ForegroundColor Green
        
    } else {
        Write-Host "❌ Redis dump file not found at $sourceFile" -ForegroundColor Red
        exit 1
    }
    
    # Show backup summary
    Write-Host ""
    Write-Host "🎉 BACKUP COMPLETE!" -ForegroundColor Green -BackgroundColor Black
    Write-Host "📂 Location: $backupDir" -ForegroundColor Cyan
    Write-Host "📊 Keys backed up: $keyCount" -ForegroundColor Cyan
    Write-Host "📅 Timestamp: $timestamp" -ForegroundColor Cyan
    
    # List recent backups
    Write-Host ""
    Write-Host "📋 Recent backups:" -ForegroundColor Yellow
    Get-ChildItem $backupDir | Sort-Object LastWriteTime -Descending | Select-Object -First 5 | ForEach-Object {
        $size = [math]::Round($_.Length / 1KB, 2)
        Write-Host "   $($_.Name) ($size KB)" -ForegroundColor White
    }
    
} catch {
    Write-Host "❌ Backup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "💡 To restore this backup:" -ForegroundColor Yellow
Write-Host "   1. Stop Redis" -ForegroundColor Cyan
Write-Host "   2. Copy backup file to C:\totilove\dump.rdb" -ForegroundColor Cyan
Write-Host "   3. Start Redis" -ForegroundColor Cyan

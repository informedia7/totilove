Write-Host "🔄 Simple Redis Backup" -ForegroundColor Green

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "C:\totilove\backups\redis"

if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force
}

# Save Redis data
& "C:\redis\redis-cli.exe" BGSAVE

# Wait a moment
Start-Sleep -Seconds 3

# Copy the file
Copy-Item "C:\totilove\dump.rdb" "$backupDir\backup_$timestamp.rdb"

Write-Host "✅ Backup completed: backup_$timestamp.rdb" -ForegroundColor Green
Write-Host "📂 Location: $backupDir" -ForegroundColor Cyan

# Show file
Get-ChildItem "$backupDir\backup_$timestamp.rdb"

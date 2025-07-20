Write-Host "Redis Backup Starting..." -ForegroundColor Green

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "C:\totilove\backups\redis"

if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

Write-Host "Saving Redis data..." -ForegroundColor Yellow
& "C:\redis\redis-cli.exe" BGSAVE

Start-Sleep -Seconds 3

Write-Host "Copying backup file..." -ForegroundColor Yellow
Copy-Item "C:\totilove\dump.rdb" "$backupDir\backup_$timestamp.rdb"

Write-Host "Backup completed: backup_$timestamp.rdb" -ForegroundColor Green
Write-Host "Location: $backupDir" -ForegroundColor Cyan

$backupFile = Get-ChildItem "$backupDir\backup_$timestamp.rdb"
$size = [math]::Round($backupFile.Length / 1KB, 2)
Write-Host "File size: $size KB" -ForegroundColor Cyan

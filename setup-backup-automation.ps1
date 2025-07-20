# 🛠️ Setup Totilove Backup Automation
# Run this script as Administrator to setup automated backups

Write-Host "🚀 Setting up Totilove Backup Automation..." -ForegroundColor Green

# Create backup directories
$backupRoot = "C:\totilove\backups"
$directories = @(
    "$backupRoot\postgres",
    "$backupRoot\redis",
    "$backupRoot\code", 
    "$backupRoot\config",
    "$backupRoot\uploads",
    "$backupRoot\logs",
    "$backupRoot\scripts"
)

Write-Host "📁 Creating backup directories..."
foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  ✅ Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Exists: $dir" -ForegroundColor Yellow
    }
}

# Copy backup script to scripts directory
$scriptSource = "C:\totilove\backup-system.ps1"
$scriptDest = "$backupRoot\scripts\backup-system.ps1"

if (Test-Path $scriptSource) {
    Copy-Item $scriptSource $scriptDest -Force
    Write-Host "📋 Backup script copied to: $scriptDest" -ForegroundColor Green
}

# Create simple daily backup task
$taskName = "TotiloveBackup"
$scriptPath = "$backupRoot\scripts\backup-system.ps1"

Write-Host "⏰ Setting up scheduled backup task..."

try {
    # Remove existing task if it exists
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    
    # Create new scheduled task
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`" -BackupType all"
    $trigger = New-ScheduledTaskTrigger -Daily -At "2:00 AM"
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    
    Register-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -TaskName $taskName -Description "Daily backup of Totilove platform data and code"
    
    Write-Host "✅ Scheduled task '$taskName' created successfully!" -ForegroundColor Green
    Write-Host "   - Runs daily at 2:00 AM" -ForegroundColor Cyan
    Write-Host "   - Backs up PostgreSQL, Redis, Code, Config, and Uploads" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Failed to create scheduled task: $($_.Exception.Message)" -ForegroundColor Red
}

# Create manual backup shortcuts
Write-Host "🔗 Creating manual backup shortcuts..."

$shortcuts = @{
    "Backup-Database" = "-BackupType postgres"
    "Backup-Redis" = "-BackupType redis" 
    "Backup-Code" = "-BackupType code"
    "Backup-All" = "-BackupType all"
}

foreach ($shortcut in $shortcuts.GetEnumerator()) {
    $shortcutContent = @"
PowerShell.exe -ExecutionPolicy Bypass -File "$scriptPath" $($shortcut.Value)
pause
"@
    $shortcutFile = "$backupRoot\$($shortcut.Key).bat"
    $shortcutContent | Out-File -FilePath $shortcutFile -Encoding ASCII
    Write-Host "  ✅ Created: $($shortcut.Key).bat" -ForegroundColor Green
}

# Display backup information
Write-Host "`n📊 BACKUP SYSTEM SETUP COMPLETE!" -ForegroundColor Green -BackgroundColor Black
Write-Host "================================" -ForegroundColor Green

Write-Host "`n📁 Backup Location: $backupRoot" -ForegroundColor Cyan
Write-Host "⏰ Automatic Backup: Daily at 2:00 AM" -ForegroundColor Cyan
Write-Host "📋 Manual Backups: Run .bat files in backup directory" -ForegroundColor Cyan

Write-Host "`n🔧 Manual Backup Commands:" -ForegroundColor Yellow
Write-Host "  Full Backup:     PowerShell -ExecutionPolicy Bypass -File `"$scriptPath`" -BackupType all" -ForegroundColor White
Write-Host "  Database Only:   PowerShell -ExecutionPolicy Bypass -File `"$scriptPath`" -BackupType postgres" -ForegroundColor White
Write-Host "  Redis Only:      PowerShell -ExecutionPolicy Bypass -File `"$scriptPath`" -BackupType redis" -ForegroundColor White
Write-Host "  Code Only:       PowerShell -ExecutionPolicy Bypass -File `"$scriptPath`" -BackupType code" -ForegroundColor White

Write-Host "`n📝 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Configure your PostgreSQL password in the backup script" -ForegroundColor White
Write-Host "  2. Test backup manually: Run 'Backup-All.bat'" -ForegroundColor White
Write-Host "  3. Verify backup files are created in $backupRoot" -ForegroundColor White
Write-Host "  4. Consider setting up cloud storage sync" -ForegroundColor White

Write-Host "`n✅ Your Totilove platform is now protected with automated backups!" -ForegroundColor Green

# Test if we can run a quick backup
Write-Host "`n🧪 Testing backup system..." -ForegroundColor Yellow
Write-Host "Run this command to test: $backupRoot\Backup-All.bat" -ForegroundColor Cyan

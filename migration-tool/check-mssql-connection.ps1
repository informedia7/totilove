# MS SQL Server Connection Troubleshooting Script
# This script helps diagnose MS SQL Server connection issues

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MS SQL Server Connection Troubleshooter" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if SQL Server service is running
Write-Host "1. Checking SQL Server Services..." -ForegroundColor Yellow
$services = Get-Service | Where-Object { $_.Name -like "*SQL*" -or $_.DisplayName -like "*SQL*" }

if ($services) {
    Write-Host "   Found SQL Server services:" -ForegroundColor Green
    foreach ($service in $services) {
        $status = if ($service.Status -eq "Running") { "RUNNING" } else { "STOPPED" }
        $color = if ($service.Status -eq "Running") { "Green" } else { "Red" }
        Write-Host "   - $($service.DisplayName): $status" -ForegroundColor $color
    }
} else {
    Write-Host "   ⚠️  No SQL Server services found!" -ForegroundColor Red
    Write-Host "   Make sure SQL Server is installed." -ForegroundColor Yellow
}

Write-Host ""

# Check if port 1433 is listening
Write-Host "2. Checking if port 1433 is listening..." -ForegroundColor Yellow
$port1433 = Get-NetTCPConnection -LocalPort 1433 -ErrorAction SilentlyContinue
if ($port1433) {
    Write-Host "   ✅ Port 1433 is active" -ForegroundColor Green
    Write-Host "   State: $($port1433.State)" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Port 1433 is not listening" -ForegroundColor Red
    Write-Host "   This might mean:" -ForegroundColor Yellow
    Write-Host "   - SQL Server is not running" -ForegroundColor Yellow
    Write-Host "   - TCP/IP protocol is not enabled" -ForegroundColor Yellow
    Write-Host "   - SQL Server is using a different port" -ForegroundColor Yellow
}

Write-Host ""

# Check for SQL Server Browser
Write-Host "3. Checking SQL Server Browser service..." -ForegroundColor Yellow
$browser = Get-Service | Where-Object { $_.Name -like "*Browser*" -or $_.DisplayName -like "*Browser*" }
if ($browser) {
    $browserStatus = if ($browser.Status -eq "Running") { "RUNNING" } else { "STOPPED" }
    $browserColor = if ($browser.Status -eq "Running") { "Green" } else { "Red" }
    Write-Host "   SQL Server Browser: $browserStatus" -ForegroundColor $browserColor
    if ($browser.Status -ne "Running") {
        Write-Host "   ⚠️  Start this service for named instance connections" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  SQL Server Browser service not found" -ForegroundColor Yellow
}

Write-Host ""

# Check Windows Firewall
Write-Host "4. Checking Windows Firewall rules for SQL Server..." -ForegroundColor Yellow
$firewallRules = Get-NetFirewallRule | Where-Object { 
    $_.DisplayName -like "*SQL*" -or 
    $_.DisplayName -like "*1433*" -or
    $_.DisplayName -like "*Database Engine*"
} | Select-Object DisplayName, Enabled, Direction

if ($firewallRules) {
    Write-Host "   Found firewall rules:" -ForegroundColor Green
    foreach ($rule in $firewallRules) {
        $enabled = if ($rule.Enabled) { "ENABLED" } else { "DISABLED" }
        $color = if ($rule.Enabled) { "Green" } else { "Yellow" }
        Write-Host "   - $($rule.DisplayName): $enabled ($($rule.Direction))" -ForegroundColor $color
    }
} else {
    Write-Host "   ⚠️  No SQL Server firewall rules found" -ForegroundColor Yellow
    Write-Host "   You may need to allow port 1433 through Windows Firewall" -ForegroundColor Yellow
}

Write-Host ""

# Test connection to localhost:1433
Write-Host "5. Testing connection to localhost:1433..." -ForegroundColor Yellow
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $result = $tcpClient.BeginConnect("localhost", 1433, $null, $null)
    $wait = $result.AsyncWaitHandle.WaitOne(2000, $false)
    
    if ($wait) {
        $tcpClient.EndConnect($result)
        Write-Host "   ✅ Successfully connected to localhost:1433" -ForegroundColor Green
        $tcpClient.Close()
    } else {
        Write-Host "   ❌ Cannot connect to localhost:1433" -ForegroundColor Red
        Write-Host "   Connection timed out" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Connection failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Get computer name for alternative connection
Write-Host "6. Alternative connection options..." -ForegroundColor Yellow
$computerName = $env:COMPUTERNAME
Write-Host "   Try using your computer name instead of 'localhost':" -ForegroundColor Cyan
Write-Host "   - Host: $computerName" -ForegroundColor White
Write-Host "   - Host: $computerName\SQLEXPRESS (for SQL Express)" -ForegroundColor White
Write-Host "   - Host: $computerName\MSSQLSERVER (for default instance)" -ForegroundColor White

Write-Host ""

# Instructions
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Manual Steps to Fix:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Enable TCP/IP Protocol:" -ForegroundColor Yellow
Write-Host "   - Open 'SQL Server Configuration Manager'" -ForegroundColor White
Write-Host "   - Go to: SQL Server Network Configuration > Protocols for [INSTANCE]" -ForegroundColor White
Write-Host "   - Right-click 'TCP/IP' > Enable" -ForegroundColor White
Write-Host "   - Restart SQL Server service" -ForegroundColor White
Write-Host ""
Write-Host "2. Start SQL Server Browser:" -ForegroundColor Yellow
Write-Host "   - Open Services (services.msc)" -ForegroundColor White
Write-Host "   - Find 'SQL Server Browser'" -ForegroundColor White
Write-Host "   - Right-click > Start" -ForegroundColor White
Write-Host "   - Set Startup type to 'Automatic'" -ForegroundColor White
Write-Host ""
Write-Host "3. Allow Port 1433 in Firewall:" -ForegroundColor Yellow
Write-Host "   - Open Windows Defender Firewall" -ForegroundColor White
Write-Host "   - Advanced Settings > Inbound Rules" -ForegroundColor White
Write-Host "   - New Rule > Port > TCP > 1433" -ForegroundColor White
Write-Host "   - Allow the connection" -ForegroundColor White
Write-Host ""
Write-Host "4. Verify SQL Server Authentication:" -ForegroundColor Yellow
Write-Host "   - Open SQL Server Management Studio" -ForegroundColor White
Write-Host "   - Connect to server" -ForegroundColor White
Write-Host "   - Right-click server > Properties > Security" -ForegroundColor White
Write-Host "   - Enable 'SQL Server and Windows Authentication mode'" -ForegroundColor White
Write-Host "   - Restart SQL Server service" -ForegroundColor White
Write-Host ""
















































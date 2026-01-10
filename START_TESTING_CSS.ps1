# Quick Start Script for Testing New CSS
# Run: .\START_TESTING_CSS.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Testing New CSS Architecture" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to script directory (where this file is located)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow
Write-Host ""

# Verify server.js exists
if (-not (Test-Path "server.js")) {
    Write-Host "ERROR: server.js not found in current directory!" -ForegroundColor Red
    Write-Host "Please run this script from C:\Totilove_split" -ForegroundColor Red
    pause
    exit 1
}

# Set environment variable
$env:USE_NEW_CSS = "true"

Write-Host "Environment variable set: USE_NEW_CSS=$env:USE_NEW_CSS" -ForegroundColor Green
Write-Host ""
Write-Host "Starting server..." -ForegroundColor Green
Write-Host "Server will start on http://localhost:3000" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start server
node server.js

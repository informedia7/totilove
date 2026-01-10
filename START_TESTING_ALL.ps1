# Quick Start Script for Testing All New Features
# Run: .\START_TESTING_ALL.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Testing All New Architecture" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to script directory
Set-Location $PSScriptRoot

# Set environment variables
$env:ENABLE_ALL_NEW = "true"

Write-Host "Starting server with ENABLE_ALL_NEW=true..." -ForegroundColor Green
Write-Host ""
Write-Host "Server will start on http://localhost:3000" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start server
node server.js



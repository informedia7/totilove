# Quick Start Script for Testing New CSS
# Run: .\START_TESTING_CSS.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Testing New CSS Architecture" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to script directory
Set-Location $PSScriptRoot

# Set environment variable
$env:USE_NEW_CSS = "true"

Write-Host "Starting server with USE_NEW_CSS=true..." -ForegroundColor Green
Write-Host ""
Write-Host "Server will start on http://localhost:3000" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start server
node server.js


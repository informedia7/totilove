@echo off
REM Quick Start Script for Testing New CSS
REM Double-click this file or run: START_TESTING.bat

echo ========================================
echo   Testing New CSS Architecture
echo ========================================
echo.

REM Navigate to project directory
cd /d "%~dp0"

REM Set environment variable and start server
set USE_NEW_CSS=true
echo Starting server with USE_NEW_CSS=true...
echo.
echo Server will start on http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

node server.js

pause



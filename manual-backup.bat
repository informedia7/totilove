@echo off
echo =============================================
echo    TOTILOVE MANUAL BACKUP SCRIPT
echo =============================================

set TIMESTAMP=%date:~-4,4%-%date:~-10,2%-%date:~-7,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_DIR=C:\totilove-backup-%TIMESTAMP%

echo Creating backup directory: %BACKUP_DIR%
mkdir "%BACKUP_DIR%"

echo.
echo [1/6] Backing up Redis database...
if exist "C:\totilove\dump.rdb" (
    copy "C:\totilove\dump.rdb" "%BACKUP_DIR%\dump.rdb"
    echo     ✓ Redis data backed up
) else (
    echo     ⚠ Redis dump file not found
)

echo.
echo [2/6] Backing up main application files...
copy "C:\totilove\server.js" "%BACKUP_DIR%\server.js"
copy "C:\totilove\package.json" "%BACKUP_DIR%\package.json"
if exist "C:\totilove\.env" (
    copy "C:\totilove\.env" "%BACKUP_DIR%\.env"
    echo     ✓ Environment file backed up
)

echo.
echo [3/6] Backing up chat interface...
copy "C:\totilove\public\advanced-chat.html" "%BACKUP_DIR%\advanced-chat.html"

echo.
echo [4/6] Backing up services directory...
if exist "C:\totilove\services" (
    xcopy "C:\totilove\services" "%BACKUP_DIR%\services\" /E /I /Q
    echo     ✓ Services directory backed up
)

echo.
echo [5/6] Backing up user uploads...
if exist "C:\totilove\public\uploads" (
    xcopy "C:\totilove\public\uploads" "%BACKUP_DIR%\uploads\" /E /I /Q
    echo     ✓ User uploads backed up
) else (
    echo     ⚠ No uploads directory found
)

echo.
echo [6/6] Creating database backup...
pg_dump -h localhost -U postgres -d totilove_db > "%BACKUP_DIR%\database_backup.sql" 2>nul
if %errorlevel% == 0 (
    echo     ✓ Database exported successfully
) else (
    echo     ⚠ Database export failed (check if PostgreSQL is running)
)

echo.
echo =============================================
echo           BACKUP COMPLETED!
echo =============================================
echo Backup location: %BACKUP_DIR%
echo.
echo Files backed up:
dir "%BACKUP_DIR%" /B
echo.
echo To restore: Copy these files back to C:\totilove\
echo Then run: npm install
echo.
pause

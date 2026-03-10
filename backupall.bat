@echo off
setlocal enabledelayedexpansion

:: Lấy ngày giờ chuẩn không phụ thuộc quốc gia (ISO format)
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=!datetime:~0,4!!datetime:~4,2!!datetime:~6,2!_!datetime:~8,2!!datetime:~10,2!

set DB_FILE=backup_db_%TIMESTAMP%.sql
set PROJECT_FILE=backup_project_%TIMESTAMP%.zip

echo [1/2] Dang backup Database tu Supabase...
:: Su dung npx supabase db dump (Dung link direct connect tu .env.local)
:: Password: OtFg7MFJFy5qd9lu
call npx supabase db dump --db-url "postgresql://postgres.udakzychndpndkevktlf:OtFg7MFJFy5qd9lu@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres" -f %DB_FILE%

if %ERRORLEVEL% NEQ 0 (
    echo [LOI] Khong the dump Database. Vui long kiem tra ket noi internet.
    pause
    exit /b %ERRORLEVEL%
)

echo [2/2] Dang backup Project Code (Nen folder)...
:: Su dung powershell de nen folder project (loai bo node_modules, .next, .git va cac file backup cu)
powershell -Command "Compress-Archive -Path * -DestinationPath %PROJECT_FILE% -Force -Exclude ('node_modules', '.next', '.git', '*.zip', '*.sql', '.vercel')"

if %ERRORLEVEL% NEQ 0 (
    echo [LOI] Khong the nen file du an.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo === BACKUP HOAN TAT ===
echo 1. Database: %DB_FILE%
echo 2. Code: %PROJECT_FILE%
echo =======================
echo File duoc luu tai: %cd%

pause

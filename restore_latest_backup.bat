@echo off
setlocal enabledelayedexpansion

:: ===========================================================
:: SCRIPT PHUC HOI DU LIEU VA SOURCE CODE MOI NHAT - 1HOTEL2
:: ===========================================================

:: 1. Cấu hình
set backup_dir=C:\1hotel2_backups
set PGPASSWORD=OtFg7MFJFy5qd9lu
set PGHOST=aws-1-ap-southeast-1.pooler.supabase.com
set PGPORT=5432
set PGUSER=postgres.udakzychndpndkevktlf
set PGDATABASE=postgres
set PGRESTORE_PATH="C:\Program Files\PostgreSQL\18\bin\pg_restore.exe"

:: Kiểm tra pg_restore
if not exist %PGRESTORE_PATH% (
    set PGRESTORE_PATH=pg_restore
)

echo ========================================================
echo DANG TIM KIEM FILE BACKUP MOI NHAT...
echo ========================================================

:: Tìm file .dump mới nhất dựa trên tên (vì tên có timestamp) hoặc ngày sửa đổi
:: Cách đơn giản nhất là dir /b /o-d /t:w để sắp xếp theo thời gian (mới nhất trước)
set latest_backup=
for /f "delims=" %%I in ('dir /b /o-d /t:w "%backup_dir%\*.dump"') do (
    set latest_backup=%%~nI
    goto :Found
)

:Found
if "%latest_backup%"=="" (
    echo [!] Khong tim thay bat ky file backup nao trong %backup_dir%
    pause
    exit /b
)

echo Tim thay backup moi nhat: %latest_backup%
echo.
echo ---------------------------------------------------------
echo BAN DANG CHUAN BI PHUC HOI DU LIEU TU: %latest_backup%
echo ---------------------------------------------------------
echo [!] CANH BAO:
echo 1. Database hien tai se bi ghi de hoan toan.
echo 2. Source code hien tai se bi ghi de (tru node_modules, .next).
echo 3. Hay dam bao da TAT SERVER (Ctrl+C) truoc khi chay.
echo.
echo Nhan phim bat ky de tiep tuc, hoac Ctrl+C de huy...
pause >nul

echo.
echo [BUOC 1/2] DANG PHUC HOI DATABASE...
echo Dang ket noi va restore (co the mat vai phut)...
%PGRESTORE_PATH% -h %PGHOST% -p %PGPORT% -U %PGUSER% -d %PGDATABASE% --clean --if-exists -v "%backup_dir%\%latest_backup%.dump"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] CO LOI XAY RA KHI RESTORE DB.
    echo (Tuy nhien, mot so loi "does not exist" khi drop la binh thuong)
) else (
    echo.
    echo [V] DATABASE DA DUOC PHUC HOI.
)

echo.
echo [BUOC 2/2] DANG PHUC HOI SOURCE CODE...
if exist "%backup_dir%\%latest_backup%_code.zip" (
    echo Dang giai nen source code...
    tar -xf "%backup_dir%\%latest_backup%_code.zip" -C .
    
    if %ERRORLEVEL% EQU 0 (
        echo [V] SOURCE CODE DA DUOC PHUC HOI.
    ) else (
        echo [!] LOI KHI GIAI NEN SOURCE CODE.
    )
) else (
    echo [!] Khong tim thay file code zip: %latest_backup%_code.zip
    echo Chi phuc hoi Database.
)

echo.
echo ========================================================
echo QUA TRINH PHUC HOI HOAN TAT!
echo Hay khoi dong lai server de kiem tra.
echo ========================================================
pause

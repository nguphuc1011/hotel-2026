@echo off
setlocal enabledelayedexpansion

:: ===========================================================
:: SCRIPT PHUC HOI DU LIEU VA SOURCE CODE - 1HOTEL2
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
echo DANH SACH BACKUP HIEN CO:
echo ========================================================
dir /b "%backup_dir%\*.dump"
echo ========================================================
echo.
echo Hay nhap ten file backup ban muon phuc hoi (copy ten file o tren, bo phan duoi .dump)
echo Vi du: 1hotel2_TRUOCKHIHOANTHIEN_FOLIO_2026-01-30_08-44
echo.
set /p filename="> Nhap ten file: "

:: Xử lý trường hợp người dùng lỡ nhập đuôi .dump
set filename=%filename:.dump=%

if not exist "%backup_dir%\%filename%.dump" (
    echo.
    echo [!] LOI: File backup "%backup_dir%\%filename%.dump" khong ton tai!
    echo Vui long kiem tra lai ten file.
    pause
    exit /b
)

echo.
echo ---------------------------------------------------------
echo BAN DANG CHUAN BI PHUC HOI DU LIEU TU: %filename%
echo ---------------------------------------------------------
echo [!] CANH BAO:
echo 1. Database hien tai se bi ghi de hoan toan.
echo 2. Source code hien tai se bi ghi de (tru node_modules, .next).
echo 3. Hay dam bao da TAT SERVER (Ctrl+C) truoc khi chay.
echo.
pause

echo.
echo [BUOC 1/2] DANG PHUC HOI DATABASE...
echo Dang ket noi va restore (co the mat vai phut)...
:: -d: Database name
:: -c: Clean (drop objects before creating)
:: --if-exists: Use with -c to avoid errors if objects don't exist
:: -v: Verbose
%PGRESTORE_PATH% -h %PGHOST% -p %PGPORT% -U %PGUSER% -d %PGDATABASE% --clean --if-exists -v "%backup_dir%\%filename%.dump"

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
if exist "%backup_dir%\%filename%_code.zip" (
    echo Dang giai nen source code...
    tar -xf "%backup_dir%\%filename%_code.zip" -C .
    
    if %ERRORLEVEL% EQU 0 (
        echo [V] SOURCE CODE DA DUOC PHUC HOI.
    ) else (
        echo [!] LOI KHI GIAI NEN SOURCE CODE.
    )
) else (
    echo [!] Khong tim thay file code zip: %filename%_code.zip
    echo Chi phuc hoi Database.
)

echo.
echo ========================================================
echo QUA TRINH PHUC HOI HOAN TAT!
echo Hay khoi dong lai server de kiem tra.
echo ========================================================
pause

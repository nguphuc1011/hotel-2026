@echo off
setlocal enabledelayedexpansion

echo ===========================================================
echo SCRIPT PHUC HOI DATABASE - 1HOTEL2
echo ===========================================================

:: 1. Thong tin ket noi (Lay tu .env.local)
set PGPASSWORD=OtFg7MFJFy5qd9lu
set PGHOST=aws-1-ap-southeast-1.pooler.supabase.com
set PGPORT=5432
set PGUSER=postgres.udakzychndpndkevktlf
set PGDATABASE=postgres
set PGRESTORE_PATH="C:\Program Files\PostgreSQL\18\bin\pg_restore.exe"

:: Kiem tra pg_restore
if not exist %PGRESTORE_PATH% (
    set PGRESTORE_PATH=pg_restore
)

echo.
echo [!] LUU Y: Qua trinh nay se ghi de du lieu hien tai tren Database.
echo [!] Hay chac chan rang chu nhan muon thuc hien dieu nay.
echo.
set /p backup_file="Hay KEO VA THA file .dump vao day roi nhan Enter: "

:: Xoa dau ngoac kep neu co
set backup_file=%backup_file:"=%

echo.
echo [*] Dang phuc hoi du lieu tu: %backup_file%...

:: Lenh phuc hoi toi uu cho Supabase
:: --clean: Xoa du lieu cu truoc khi nap
:: --if-exists: Tranh loi khi xoa
:: --no-owner: Khong phuc hoi quyen so huu (vi Supabase quan ly quyen nay)
%PGRESTORE_PATH% -h %PGHOST% -p %PGPORT% -U %PGUSER% -d %PGDATABASE% --clean --if-exists --no-owner --no-privileges "%backup_file%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [V] CHUC MUNG! DA PHUC HOI DATABASE THANH CONG.
) else (
    echo.
    echo [X] LOI: Co van de trong qua trinh phuc hoi. 
    echo [!] Hay kiem tra xem file dump co hop le khong.
)

echo.
pause
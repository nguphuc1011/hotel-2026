@echo off
setlocal enabledelayedexpansion

:: ===========================================================
:: SCRIPT SAO LƯU TOÀN DIỆN (CODE & DATABASE) - 1HOTEL2
:: ===========================================================

:: 1. Cấu hình thời gian (Cách lấy ngày tháng an toàn trên mọi phiên bản Windows)
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set timestamp=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%_%datetime:~8,2%-%datetime:~10,2%
set backup_dir=C:\1hotel2_backups

echo ---------------------------------------------------------
echo [ BUOC 1: DAT TEN BAN SAO LUU ]
echo ---------------------------------------------------------
set /p user_tag="[?] Nhap ten/ghi chu cho ban backup nay (Enter de bo qua): "

if "!user_tag!"=="" (
    set filename=1hotel2_full_backup_%timestamp%
) else (
    set filename=1hotel2_!user_tag!_%timestamp%
)

echo.
echo [*] Ten file se la: !filename!
echo.

echo ---------------------------------------------------------
echo [ BUOC 2: DANG KHOI TAO QUA TRINH SAO LUU... ]
echo ---------------------------------------------------------

:: 2. Tạo thư mục lưu trữ nếu chưa có
if not exist "%backup_dir%" (
    mkdir "%backup_dir%"
    echo [+] Da tao thu muc sao luu tai: %backup_dir%
)

:: 3. Sao lưu Database (Sử dụng thông tin từ .env.local)
echo [*] Dang tai du lieu tu Supabase...
set PGPASSWORD=OtFg7MFJFy5qd9lu
set PGHOST=aws-1-ap-southeast-1.pooler.supabase.com
set PGPORT=5432
set PGUSER=postgres.udakzychndpndkevktlf
set PGDATABASE=postgres
set PGDUMP_PATH="C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

:: Kiểm tra xem pg_dump có tồn tại tại đường dẫn không
if not exist %PGDUMP_PATH% (
    set PGDUMP_PATH=pg_dump
)

:: Chạy lệnh backup
%PGDUMP_PATH% -h %PGHOST% -p %PGPORT% -U %PGUSER% -d %PGDATABASE% -F c -f "%backup_dir%\%filename%.dump"

if %ERRORLEVEL% NEQ 0 (
    echo [!] CANH BAO: Khong tim thay lenh pg_dump. 
    echo [!] Buoc sao luu Database bi bo qua.
    echo [!] Hay cai dat PostgreSQL Tools hoac dung TablePlus de backup DB thu cong.
) else (
    echo [V] Da sao luu Database thanh cong: %filename%.dump
)

:: 4. Sao lưu Source Code (Dùng lệnh tar có sẵn của Windows 10/11)
echo [*] Dang nen Source Code (loai tru node_modules, .next)...
tar -acf "%backup_dir%\%filename%_code.zip" --exclude="node_modules" --exclude=".next" --exclude=".git" --exclude="backups" *

if %ERRORLEVEL% EQU 0 (
    echo [V] Da sao luu Source Code thanh cong: %filename%_code.zip
) else (
    echo [X] LOI: Khong the nen Source Code.
)

echo ---------------------------------------------------------
echo QUÁ TRÌNH HOÀN TẤT!
echo File cua chu nhan nam tai: %backup_dir%
echo ---------------------------------------------------------
pause

@echo off
setlocal enabledelayedexpansion

:: ===========================================================
:: SCRIPT SAO LƯU TỰ ĐỘNG (KHÔNG DỪNG MÀN HÌNH) - 1HOTEL2
:: ===========================================================

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set timestamp=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%_%datetime:~8,2%-%datetime:~10,2%
set backup_dir=C:\1hotel2_backups
set filename=1hotel2_full_backup_%timestamp%

if not exist "%backup_dir%" mkdir "%backup_dir%"

:: 3. Sao lưu Database
set PGPASSWORD=OtFg7MFJFy5qd9lu
set PGHOST=aws-1-ap-southeast-1.pooler.supabase.com
set PGPORT=5432
set PGUSER=postgres.udakzychndpndkevktlf
set PGDATABASE=postgres
set PGDUMP_PATH="C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

if not exist %PGDUMP_PATH% set PGDUMP_PATH=pg_dump

%PGDUMP_PATH% -h %PGHOST% -p %PGPORT% -U %PGUSER% -d %PGDATABASE% -F c -f "%backup_dir%\%filename%.dump"

:: 4. Sao lưu Source Code
tar -acf "%backup_dir%\%filename%_code.zip" --exclude="node_modules" --exclude=".next" --exclude=".git" --exclude="backups" *

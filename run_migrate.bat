@echo off
set PGPASSWORD=OtFg7MFJFy5qd9lu
set PGHOST=aws-1-ap-southeast-1.pooler.supabase.com
set PGPORT=5432
set PGUSER=postgres.udakzychndpndkevktlf
set PGDATABASE=postgres

set PSQL_EXE=psql.exe
if exist "C:\Program Files\PostgreSQL\18\bin\psql.exe" set PSQL_EXE="C:\Program Files\PostgreSQL\18\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" set PSQL_EXE="C:\Program Files\PostgreSQL\17\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" set PSQL_EXE="C:\Program Files\PostgreSQL\16\bin\psql.exe"

%PSQL_EXE% -f c:\1hotel2\migrate_ladder_v5.sql
%PSQL_EXE% -f c:\1hotel2\update_dashboard_rpc.sql

-- Final Cleanup for Ledger Unification
-- Date: 2026-01-05
-- Purpose: Remove all legacy tables and columns to ensure "Luồng công nợ vĩnh cửu" (Ledger-Centric)

-- 1. DROP old tables (CASCADE to remove dependent views/triggers)
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS cashflow CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS debt_transactions CASCADE;
DROP TABLE IF EXISTS financial_transactions CASCADE;
DROP TABLE IF EXISTS room_audit CASCADE; -- Just in case

-- 2. DROP old columns from bookings
ALTER TABLE bookings DROP COLUMN IF EXISTS include_debt;
ALTER TABLE bookings DROP COLUMN IF EXISTS merged_debt_amount;
ALTER TABLE bookings DROP COLUMN IF EXISTS amount_paid; -- Now we use invoices/ledger for payment tracking

-- 3. DROP old columns from customers (if any legacy ones exist)
-- (No legacy columns identified in customers, keeping balance, total_spent, visit_count)

-- 4. CLEANUP FUNCTIONS
-- Drop old functions that might reference deleted tables
DROP FUNCTION IF EXISTS handle_transaction CASCADE;
DROP FUNCTION IF EXISTS handle_payment CASCADE;

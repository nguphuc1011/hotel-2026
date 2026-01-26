-- 1. Xóa các phiên bản cũ của process_checkout (Xung đột 7 tham số vs 8 tham số)
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid, uuid, text);

-- 2. Xóa các phiên bản cũ của check_in_customer (Đã thay p_staff_id bằng p_verified_by_staff_id/name)
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text, uuid);
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text, uuid, text);

-- 3. Xóa các phiên bản cũ của import_inventory (Xung đột 5 tham số)
DROP FUNCTION IF EXISTS public.import_inventory(uuid, numeric, numeric, text, uuid);

-- 4. Xóa các phiên bản cũ của adjust_customer_balance
DROP FUNCTION IF EXISTS public.adjust_customer_balance(uuid, numeric, text, text, uuid);
DROP FUNCTION IF EXISTS public.adjust_customer_balance(uuid, numeric, text, text, uuid, uuid);

-- 5. Xóa các phiên bản cũ của fn_create_cash_flow
DROP FUNCTION IF EXISTS public.fn_create_cash_flow(text, text, numeric, text, timestamp with time zone);
DROP FUNCTION IF EXISTS public.fn_create_cash_flow(text, text, numeric, text, timestamp with time zone, uuid);

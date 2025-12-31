-- UPDATE 'process_checkout_transaction' RPC to handle revenue correctly
-- (Đã được thay thế bởi handle_checkout trong 20260101_unify_checkout_system.sql)
DROP FUNCTION IF EXISTS public.process_checkout_transaction(uuid, text, numeric, numeric);

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload config';

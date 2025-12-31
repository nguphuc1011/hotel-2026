-- Migration: 20260101_sync_resolve_checkout_revenue.sql
-- (Đã được thay thế bởi handle_checkout trong 20260101_unify_checkout_system.sql)

DROP FUNCTION IF EXISTS public.resolve_checkout(uuid, text, numeric, numeric, numeric, text, uuid);

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload config';

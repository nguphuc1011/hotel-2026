-- ==========================================================
-- MASTER CLEANUP & STABILITY FIX (V2)
-- Mục tiêu: 
-- 1. Xóa bỏ hoàn toàn các Trigger gây lỗi "đập chuột"
-- 2. Khôi phục View "Hàng treo" ĐÚNG CHUẨN để nó XUẤT HIỆN
-- 3. Cung cấp RPC Thanh toán cực kỳ ổn định
-- ==========================================================

-- 1. XÓA BỎ CÁC THÀNH PHẦN GÂY LỖI CASCADING (QUAN TRỌNG)
DROP TRIGGER IF EXISTS trg_auto_deduct_inventory ON public.bookings;
DROP FUNCTION IF EXISTS public.fn_auto_deduct_inventory();
DROP FUNCTION IF EXISTS public.process_checkout_transaction(uuid, text, numeric, numeric);

-- 2. KHÔI PHỤC VIEW HÀNG TREO (SỬA LỖI KHÔNG XUẤT HIỆN)
-- Đảm bảo View lấy đúng dữ liệu từ services_used của các booking đang ACTIVE
CREATE OR REPLACE VIEW public.view_pending_services AS
SELECT 
    r.room_number,
    b.id as booking_id,
    b.check_in_at,
    s_used.val->>'name' as service_name,
    COALESCE((s_used.val->>'quantity')::INTEGER, 0) as quantity,
    COALESCE((s_used.val->>'price')::DECIMAL, 0) as price,
    COALESCE((s_used.val->>'quantity')::INTEGER, 0) * COALESCE((s_used.val->>'price')::DECIMAL, 0) as total_amount
FROM public.bookings b
JOIN public.rooms r ON b.room_id = r.id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.services_used, '[]'::jsonb)) s_used(val)
WHERE b.status = 'active';

-- Cấp quyền truy cập
GRANT SELECT ON public.view_pending_services TO authenticated;
GRANT SELECT ON public.view_pending_services TO anon;
GRANT SELECT ON public.view_pending_services TO service_role;

-- 3. CUNG CẤP RPC THANH TOÁN SIÊU ỔN ĐỊNH (HANDLE_CHECKOUT)
-- (Đã được chuyển sang 20260101_unify_checkout_system.sql để quản lý tập trung)

-- 4. LÀM TƯƠI SCHEMA ĐỂ FRONTEND NHẬN DIỆN ĐÚNG API
NOTIFY pgrst, 'reload config';

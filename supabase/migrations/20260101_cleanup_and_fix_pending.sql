-- 1. XÓA BỎ CÁC THÀNH PHẦN GÂY LỖI DATABASE (QUAN TRỌNG NHẤT)
DROP TRIGGER IF EXISTS trg_auto_deduct_inventory ON public.bookings;
DROP FUNCTION IF EXISTS public.fn_auto_deduct_inventory();
DROP FUNCTION IF EXISTS public.process_checkout_transaction(uuid, text, numeric, numeric);

-- 2. KHÔI PHỤC VIEW HÀNG TREO (LÀM CHO NÓ XUẤT HIỆN)
-- View này sẽ quét toàn bộ các phòng đang có khách (active) và liệt kê dịch vụ.
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
WHERE b.status = 'active' AND b.deleted_at IS NULL;

-- 3. ĐẢM BẢO QUYỀN TRUY CẬP VIEW
GRANT SELECT ON public.view_pending_services TO authenticated;
GRANT SELECT ON public.view_pending_services TO anon;
GRANT SELECT ON public.view_pending_services TO service_role;

-- HÀM XÓA KHÁCH HÀNG (DỌN DẸP SẠCH SẼ DỮ LIỆU)
CREATE OR REPLACE FUNCTION public.fn_delete_hotel(p_hotel_id UUID) 
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_hotel_name TEXT;
BEGIN
    -- 1. Kiểm tra Hotel tồn tại
    SELECT name INTO v_hotel_name FROM public.hotels WHERE id = p_hotel_id;
    IF v_hotel_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy khách hàng');
    END IF;

    -- 2. Xóa dữ liệu ở các bảng con (Thứ tự quan trọng để tránh lỗi FK)
    -- Các bảng nghiệp vụ trước
    DELETE FROM public.audit_logs WHERE hotel_id = p_hotel_id;
    DELETE FROM public.booking_services WHERE hotel_id = p_hotel_id;
    DELETE FROM public.bookings WHERE hotel_id = p_hotel_id;
    DELETE FROM public.inventory_logs WHERE hotel_id = p_hotel_id;
    DELETE FROM public.cash_flow WHERE hotel_id = p_hotel_id;
    DELETE FROM public.external_payables WHERE hotel_id = p_hotel_id;
    
    -- Các bảng cấu hình và danh mục
    DELETE FROM public.user_floors WHERE hotel_id = p_hotel_id;
    DELETE FROM public.rooms WHERE hotel_id = p_hotel_id;
    DELETE FROM public.room_categories WHERE hotel_id = p_hotel_id;
    DELETE FROM public.services WHERE hotel_id = p_hotel_id;
    DELETE FROM public.cash_flow_categories WHERE hotel_id = p_hotel_id;
    DELETE FROM public.wallets WHERE hotel_id = p_hotel_id;
    DELETE FROM public.settings WHERE hotel_id = p_hotel_id;
    DELETE FROM public.role_permissions WHERE hotel_id = p_hotel_id;
    DELETE FROM public.customers WHERE hotel_id = p_hotel_id;
    
    -- Xóa nhân viên và cuối cùng là hotel
    DELETE FROM public.staff WHERE hotel_id = p_hotel_id;
    DELETE FROM public.hotels WHERE id = p_hotel_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Đã xóa toàn bộ dữ liệu của khách sạn ' || v_hotel_name
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi khi xóa: ' || SQLERRM);
END;
$$;

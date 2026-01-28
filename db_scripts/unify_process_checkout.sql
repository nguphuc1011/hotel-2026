-- NHẤT THỐNG RPC: PROCESS_CHECKOUT (Phiên bản chuẩn hỗ trợ Kế toán thành tích & Wallet Notification)
-- Điều 4: Nhất thống Mật lệnh - Chỉ tồn tại MỘT hàm duy nhất.
-- Điều 8: Bộ não nằm ở Backend - Xử lý toàn bộ logic tính toán và dòng tiền.

CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid, 
    p_payment_method text, 
    p_amount_paid numeric, 
    p_discount numeric, 
    p_surcharge numeric, 
    p_notes text, 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_staff_name text;
    v_room_id uuid;
    v_room_name text;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_wallet_changes jsonb := '[]'::jsonb;
    v_pm_code text;
BEGIN
    -- Identify Staff
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    v_pm_code := lower(COALESCE(p_payment_method, 'cash'));

    -- Get Booking Info
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Get Room Name for description
    SELECT room_number INTO v_room_name FROM public.rooms WHERE id = v_room_id;

    -- 1. Cập nhật Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''),
        verified_by_staff_id = v_staff_id,
        verified_by_staff_name = COALESCE(p_verified_by_staff_name, v_staff_name)
    WHERE id = p_booking_id;

    -- 2. Tính toán hóa đơn cuối cùng
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 3. Cập nhật trạng thái phòng
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. GHI NHẬN DÒNG TIỀN (Thanh toán thực tế)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, payment_method_code, occurred_at
        ) VALUES (
            'IN', 'Tiền phòng', p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, '') || ' (Checkout)', 
            auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), p_booking_id, true, v_pm_code, now()
        );

        -- Wallet Changes for Notification (Accrual: Cash up, Receivable down, Revenue unchanged)
        IF v_pm_code IN ('cash', 'tien mat', 'tiền mặt') THEN
            v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'CASH', 'diff', p_amount_paid);
        ELSE
            v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'BANK', 'diff', p_amount_paid);
        END IF;
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'RECEIVABLE', 'diff', -p_amount_paid);
    END IF;

    -- 5. XỬ LÝ CHUYỂN CỌC (Kết chuyển Escrow sang Receivable)
    IF v_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, payment_method_code, occurred_at
        ) VALUES (
            'IN', 'Tiền phòng', v_deposit, 
            'Kết chuyển tiền cọc vào tiền phòng (Phòng ' || COALESCE(v_room_name, '') || ')', 
            auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), p_booking_id, true, 'deposit_transfer', now()
        );

        -- Wallet Changes for Notification (Accrual: Escrow down, Receivable down, Revenue unchanged)
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'ESCROW', 'diff', -v_deposit);
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'RECEIVABLE', 'diff', -v_deposit);
    END IF;

    -- 6. Cập nhật số dư khách hàng (nếu có)
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 7. Ghi Audit Log
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Check-out thành công', 
        'bill', v_bill,
        'wallet_changes', v_wallet_changes
    );
END;
$function$;

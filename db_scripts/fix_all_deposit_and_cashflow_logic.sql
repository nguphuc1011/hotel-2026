-- FIX FINANCIAL FLOW & DEPOSIT LOGIC
-- 1. Khởi tạo danh mục hệ thống cho tất cả các khách sạn
DO $$
DECLARE
    v_hotel record;
BEGIN
    FOR v_hotel IN SELECT id FROM public.hotels LOOP
        -- Tiền cọc (IN) - Không tính vào doanh thu
        INSERT INTO public.cash_flow_categories (hotel_id, name, type, is_system, is_revenue, description)
        VALUES (v_hotel.id, 'Tiền cọc', 'IN', true, false, 'Tiền cọc/Thu trước từ khách')
        ON CONFLICT (name, type, hotel_id) DO UPDATE SET is_system = true, is_revenue = false;

        -- Hoàn cọc (OUT) - Không tính vào doanh thu
        INSERT INTO public.cash_flow_categories (hotel_id, name, type, is_system, is_revenue, description)
        VALUES (v_hotel.id, 'Hoàn cọc', 'OUT', true, false, 'Trả lại tiền cọc cho khách')
        ON CONFLICT (name, type, hotel_id) DO UPDATE SET is_system = true, is_revenue = false;
        
        -- Các danh mục hệ thống khác đảm bảo có is_revenue = true
        UPDATE public.cash_flow_categories 
        SET is_revenue = true, is_system = true 
        WHERE hotel_id = v_hotel.id AND name IN ('Tiền phòng', 'Bán dịch vụ', 'Phụ thu');
    END LOOP;
END $$;

-- 2. Cập nhật fn_sync_wallets để xử lý cọc chuẩn xác (Dựa trên tên danh mục)
CREATE OR REPLACE FUNCTION public.fn_sync_wallets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ 
DECLARE 
    v_delta NUMERIC := 0; 
    v_flow_sign INTEGER; 
    v_method TEXT; 
    v_rec RECORD; 
    v_is_revenue BOOLEAN := TRUE; 
    v_is_system BOOLEAN := FALSE; 
    v_cat_type TEXT; 
BEGIN 
    IF (TG_OP = 'DELETE') THEN 
        v_rec := OLD; 
        v_delta := -COALESCE(OLD.amount, 0); 
    ELSIF (TG_OP = 'INSERT') THEN 
        v_rec := NEW; 
        v_delta := COALESCE(NEW.amount, 0); 
    ELSE 
        v_rec := NEW; 
        v_delta := COALESCE(NEW.amount, 0) - COALESCE(OLD.amount, 0); 
    END IF; 

    IF v_delta = 0 AND TG_OP = 'UPDATE' THEN RETURN NEW; END IF; 

    v_flow_sign := CASE WHEN v_rec.flow_type = 'IN' THEN 1 ELSE -1 END; 
    v_method := lower(COALESCE(v_rec.payment_method_code, 'cash')); 

    -- Lấy thông tin Category
    SELECT is_revenue, is_system, type INTO v_is_revenue, v_is_system, v_cat_type 
    FROM public.cash_flow_categories 
    WHERE name = v_rec.category AND (hotel_id = v_rec.hotel_id OR hotel_id IS NULL)
    LIMIT 1; 

    -- Fallback mặc định
    IF v_is_revenue IS NULL THEN v_is_revenue := TRUE; END IF; 
    
    -- XỬ LÝ ĐẶC BIỆT CHO TIỀN CỌC (Dựa trên tên hoặc type hệ thống)
    IF v_rec.category IN ('Tiền cọc', 'Hoàn cọc', 'Thu trước') THEN
        v_is_revenue := FALSE;
        v_cat_type := 'DEPOSIT'; -- Ép kiểu để xử lý bên dưới
    END IF;

    -- Update Ví Vật lý (CASH/BANK)
    -- KHÔNG cập nhật ví vật lý nếu là deposit_transfer (vì tiền đã nằm trong két từ lúc cọc)
    IF v_method NOT IN ('credit', 'deposit_transfer') THEN 
        UPDATE public.wallets 
        SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
        WHERE id = (CASE WHEN v_method = 'cash' THEN 'CASH' ELSE 'BANK' END)
          AND hotel_id = v_rec.hotel_id;
    END IF; 

    -- Update Ví Logic
    IF v_method = 'credit' THEN 
        UPDATE public.wallets 
        SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
        WHERE id = 'RECEIVABLE' AND hotel_id = v_rec.hotel_id;
        
        IF v_is_revenue THEN 
            UPDATE public.wallets 
            SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
            WHERE id = 'REVENUE' AND hotel_id = v_rec.hotel_id;
        END IF; 
    
    -- TRƯỜNG HỢP CỌC (DEPOSIT)
    ELSIF (v_is_system OR v_rec.category IN ('Tiền cọc', 'Hoàn cọc', 'Thu trước')) AND (v_cat_type = 'DEPOSIT' OR v_rec.category IN ('Tiền cọc', 'Hoàn cọc', 'Thu trước')) THEN 
        UPDATE public.wallets 
        SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
        WHERE id = 'ESCROW' AND hotel_id = v_rec.hotel_id;
        
    -- TRƯỜNG HỢP KHẤU TRỪ CỌC (TRANSFER)
    ELSIF v_method = 'deposit_transfer' THEN 
        -- Giảm cọc, giảm nợ
        UPDATE public.wallets 
        SET balance = balance - v_delta, updated_at = now() 
        WHERE id = 'ESCROW' AND hotel_id = v_rec.hotel_id;
        UPDATE public.wallets 
        SET balance = balance - v_delta, updated_at = now() 
        WHERE id = 'RECEIVABLE' AND hotel_id = v_rec.hotel_id;
        
    ELSIF v_is_system AND v_cat_type = 'DEBT_COLLECTION' AND v_rec.flow_type = 'IN' THEN 
        UPDATE public.wallets 
        SET balance = balance - v_delta, updated_at = now() 
        WHERE id = 'RECEIVABLE' AND hotel_id = v_rec.hotel_id;
    ELSE 
        IF v_is_revenue THEN 
            UPDATE public.wallets 
            SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
            WHERE id = 'REVENUE' AND hotel_id = v_rec.hotel_id;
        END IF; 
    END IF; 

    RETURN NULL; 
END; $function$;

-- 3. Sửa process_checkout: Loại bỏ giao dịch OUT tiền mặt dư thừa
CREATE OR REPLACE FUNCTION public.process_checkout(p_booking_id uuid, p_payment_method text, p_amount_paid numeric, p_discount numeric, p_surcharge numeric, p_notes text, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text, p_selected_child_ids uuid[] DEFAULT NULL::uuid[])
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
    v_room_number text;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_hotel_id uuid;
    v_already_billed numeric;
    v_diff numeric;
    v_child_record record;
    v_total_bill_for_transaction numeric := 0;
    v_total_deposit_for_transaction numeric := 0;
    v_all_explanations text[] := '{}';
    v_child_bill jsonb;
    v_wallet_changes jsonb := '[]'::jsonb;
    v_old_balance numeric;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    IF v_staff_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = v_staff_id) THEN v_staff_id := NULL; END IF;
    END IF;

    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;

    SELECT room_id, customer_id, hotel_id INTO v_room_id, v_customer_id, v_hotel_id FROM public.bookings WHERE id = p_booking_id;
    IF v_room_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); END IF;
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_room_id;

    -- 1. Update Master Booking
    UPDATE public.bookings SET discount_amount = COALESCE(p_discount, 0), custom_surcharge = COALESCE(p_surcharge, 0), check_out_actual = now(), status = 'completed', payment_method = p_payment_method, notes = COALESCE(notes, '') || E'\\n[Checkout] ' || COALESCE(p_notes, ''), verified_by_staff_id = v_staff_id, verified_by_staff_name = v_staff_name WHERE id = p_booking_id;

    -- 2. Process Children
    IF p_selected_child_ids IS NOT NULL AND array_length(p_selected_child_ids, 1) > 0 THEN
        FOR v_child_record IN SELECT id, room_id FROM public.bookings WHERE id = ANY(p_selected_child_ids) AND status NOT IN ('cancelled', 'completed', 'checked_out') LOOP
            UPDATE public.bookings SET status = 'completed', check_out_actual = now(), payment_method = 'group_settlement', notes = COALESCE(notes, '') || E'\\n[Group Checkout] Settled by Master Booking ' || COALESCE(v_room_number, 'Unknown'), verified_by_staff_id = v_staff_id, verified_by_staff_name = v_staff_name WHERE id = v_child_record.id;
            UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, updated_at = now() WHERE id = v_child_record.room_id;
        END LOOP;
    END IF;

    -- 3. Calculate Bills
    v_bill := public.calculate_booking_bill(p_booking_id);
    IF v_bill->>'success' = 'false' THEN RETURN v_bill; END IF;
    v_total_bill_for_transaction := (v_bill->>'total_amount')::numeric;
    v_total_deposit_for_transaction := (v_bill->>'deposit_amount')::numeric;
    v_all_explanations := v_all_explanations || ARRAY(SELECT x FROM jsonb_array_elements_text(v_bill->'explanation') AS x);

    IF p_selected_child_ids IS NOT NULL AND array_length(p_selected_child_ids, 1) > 0 THEN
        FOR v_child_record IN SELECT id FROM public.bookings WHERE id = ANY(p_selected_child_ids) LOOP
            v_child_bill := public.calculate_booking_bill(v_child_record.id);
            IF v_child_bill->>'success' = 'false' THEN RETURN v_child_bill; END IF;
            v_total_bill_for_transaction := v_total_bill_for_transaction + (v_child_bill->>'total_amount')::numeric;
            v_total_deposit_for_transaction := v_total_deposit_for_transaction + (v_child_bill->>'deposit_amount')::numeric;
            v_all_explanations := v_all_explanations || ARRAY(SELECT x FROM jsonb_array_elements_text(v_child_bill->'explanation') AS x);
        END LOOP; END IF;
    v_total_amount := v_total_bill_for_transaction;
    v_deposit := v_total_deposit_for_transaction;

    UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, updated_at = now() WHERE id = v_room_id;

    -- 5. REVENUE ADJUSTMENT
    SELECT COALESCE(SUM(amount), 0) INTO v_already_billed FROM public.cash_flow WHERE ref_id = p_booking_id AND flow_type = 'IN' AND payment_method_code = 'credit' AND hotel_id = v_hotel_id;
    v_diff := v_total_amount - v_already_billed;
    IF v_diff <> 0 THEN
        INSERT INTO public.cash_flow (flow_type, category, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', CASE WHEN v_diff > 0 THEN 'Doanh thu bổ sung' ELSE 'Giảm trừ doanh thu' END, ABS(v_diff), 'Điều chỉnh doanh thu checkout (Phụ thu/Dịch vụ/Giảm giá)', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'credit', v_hotel_id);
    END IF;

    -- 6. RECORD PAYMENT
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (flow_type, category, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', 'Thanh toán', p_amount_paid, 
                COALESCE(v_bill->>'customer_name', 'Khách lẻ') || ' (P' || COALESCE(v_room_number, '???') || ') TT trả phòng', 
                auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), lower(p_payment_method), v_hotel_id);

        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', UPPER(p_payment_method), 'diff', p_amount_paid, 'reason', COALESCE(v_bill->>'customer_name', 'Khách lẻ') || ' (P' || COALESCE(v_room_number, '???') || ') TT trả phòng');
    END IF;

    -- 7. HANDLE DEPOSIT TRANSFER
    -- CHỈ INSERT 1 GIAO DỊCH CHUYỂN CỌC (INTERNAL), KHÔNG RÚT TIỀN MẶT
    IF v_deposit > 0 THEN
        INSERT INTO public.cash_flow (flow_type, category, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', 'Tiền phòng', v_deposit, 'Cọc chuyển sang tiền phòng (P' || COALESCE(v_room_number, '???') || ')', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'deposit_transfer', v_hotel_id);
        
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'ESCROW', 'diff', -v_deposit, 'reason', 'Khấu trừ cọc checkout (P' || COALESCE(v_room_number, '???') || ')');
    END IF;

    -- 8. Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        SELECT balance INTO v_old_balance FROM public.customers WHERE id = v_customer_id FOR UPDATE;
        UPDATE public.customers SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now() WHERE id = v_customer_id AND hotel_id = v_hotel_id;
        INSERT INTO public.customer_transactions (customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name, hotel_id) 
        VALUES (v_customer_id, 'checkout', p_amount_paid - (v_total_amount - v_deposit), v_old_balance, COALESCE(v_old_balance, 0) + p_amount_paid - (v_total_amount - v_deposit), COALESCE(v_bill->>'customer_name', 'Khách lẻ') || ' (P' || COALESCE(v_room_number, '???') || ') TT trả phòng', p_booking_id, v_staff_id, v_staff_name, v_hotel_id);
    END IF;

    UPDATE public.bookings SET billing_audit_trail = to_jsonb(v_all_explanations) WHERE id = p_booking_id;
    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill, 'wallet_changes', v_wallet_changes);
END; $function$;

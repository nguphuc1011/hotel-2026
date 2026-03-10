-- [GROUP CHECKOUT V2] Logic nâng cao cho Thanh toán Nhóm
-- Date: 2026-02-28
-- Update:
-- 1. Hỗ trợ tham số p_selected_child_ids (Checklist Payment): Chỉ thanh toán cho các phòng con được chọn.
-- 2. Logic Auto-Detach: Khi phòng con tự thanh toán, tự động gỡ khỏi nhóm (parent_booking_id = NULL).

CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid,
    p_payment_method text,
    p_amount_paid numeric,
    p_discount numeric,
    p_surcharge numeric,
    p_notes text,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text,
    p_selected_child_ids uuid[] DEFAULT NULL::uuid[] -- New Parameter for Checklist
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
    v_child_record record;
    v_parent_id uuid;
    v_master_bill_total numeric;
    v_selected_children_payable_total numeric := 0;
    v_group_details jsonb;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    
    -- Get Staff Name if not provided
    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;

    SELECT room_id, customer_id, parent_booking_id INTO v_room_id, v_customer_id, v_parent_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- LOGIC AUTO-DETACH: Nếu đây là phòng con (có parent_id) đang tự thanh toán
    IF v_parent_id IS NOT NULL THEN
        -- Gỡ khỏi nhóm
        UPDATE public.bookings 
        SET parent_booking_id = NULL 
        WHERE id = p_booking_id;
        
        -- Tiếp tục quy trình thanh toán bình thường như một phòng độc lập...
    END IF;

    -- Get Room Name for description
    SELECT room_number INTO v_room_name FROM public.rooms WHERE id = v_room_id;

    -- 1. Update Booking (Master or Independent)
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''),
        verified_by_staff_id = v_staff_id,
        verified_by_staff_name = v_staff_name
    WHERE id = p_booking_id;

    -- 2. Process Group Members (Checklist Logic)
    -- Chỉ áp dụng nếu p_selected_child_ids được cung cấp HOẶC (nếu NULL thì xử lý tất cả - logic cũ, nhưng an toàn hơn là bắt buộc chọn)
    -- Theo yêu cầu "Checklist Payment": "Phòng không chọn sẽ giữ nguyên trạng thái chờ."
    -- Vậy nếu p_selected_child_ids IS NOT NULL, chỉ xử lý những ID trong đó.
    -- Nếu p_selected_child_ids IS NULL, ta có thể mặc định là KHÔNG xử lý ai (để an toàn) hoặc TẤT CẢ. 
    -- Để tương thích ngược, nếu NULL -> Xử lý TẤT CẢ (như logic cũ). Nếu Mảng Rỗng -> Không xử lý ai.
    
    IF p_selected_child_ids IS NOT NULL THEN
        -- Checklist Mode
        FOR v_child_record IN 
            SELECT id, room_id 
            FROM public.bookings 
            WHERE parent_booking_id = p_booking_id 
              AND id = ANY(p_selected_child_ids) -- CHỈ NHỮNG PHÒNG ĐƯỢC CHỌN
              AND status NOT IN ('cancelled', 'completed', 'checked_out')
        LOOP
            UPDATE public.bookings 
            SET 
                status = 'completed',
                check_out_actual = now(),
                payment_method = 'group_settlement',
                notes = COALESCE(notes, '') || E'\n[Group Checkout] Settled by Master Booking ' || COALESCE(v_room_name, 'Unknown'),
                verified_by_staff_id = v_staff_id,
                verified_by_staff_name = v_staff_name
            WHERE id = v_child_record.id;

            UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_child_record.room_id;
        END LOOP;
        
        -- Những phòng KHÔNG được chọn sẽ giữ nguyên parent_booking_id nhưng KHÔNG bị checkout.
        -- Chúng vẫn nằm trong nhóm, chờ thanh toán sau hoặc tách ra.
    ELSE
        -- Default Mode (Legacy): Checkout ALL children
        FOR v_child_record IN 
            SELECT id, room_id 
            FROM public.bookings 
            WHERE parent_booking_id = p_booking_id 
              AND status NOT IN ('cancelled', 'completed', 'checked_out')
        LOOP
            UPDATE public.bookings 
            SET 
                status = 'completed',
                check_out_actual = now(),
                payment_method = 'group_settlement',
                notes = COALESCE(notes, '') || E'\n[Group Checkout] Settled by Master Booking ' || COALESCE(v_room_name, 'Unknown'),
                verified_by_staff_id = v_staff_id,
                verified_by_staff_name = v_staff_name
            WHERE id = v_child_record.id;

            UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_child_record.room_id;
        END LOOP;
    END IF;

    -- 3. Calculate Final Bill
    -- Lưu ý: Hàm calculate_booking_bill cần phải biết p_selected_child_ids để tính tổng tiền chính xác?
    -- Hiện tại calculate_booking_bill có thể đang cộng dồn TẤT CẢ con. 
    -- Nếu ta checkout 1 phần, thì tiền phải khớp với 1 phần đó.
    -- TUY NHIÊN, yêu cầu là "Cộng dồn phòng đó vào hóa đơn tổng". 
    -- Nếu calculate_booking_bill chưa hỗ trợ lọc, ta cần cập nhật nó hoặc chấp nhận số liệu hiện tại.
    -- Để đơn giản và an toàn: Ta giả định calculate_booking_bill sẽ lấy TOÀN BỘ con đang active.
    -- Nhưng những con KHÔNG được checkout thì vẫn active -> Vẫn được tính vào bill?
    -- ĐÚNG. Phòng chưa checkout thì vẫn nợ tiền Master. 
    -- NHƯNG Master đang thanh toán Checkout. Nếu Master checkout xong mà vẫn còn con chưa checkout -> Master thành completed.
    -- Con còn lại sẽ bơ vơ? Hay Master vẫn giữ quan hệ?
    -- Nếu Master đã completed, quan hệ parent_booking_id vẫn còn.
    -- Vấn đề: Lần sau ai thanh toán cho con còn lại? Master đã đóng hồ sơ.
    -- GIẢI PHÁP: Những phòng KHÔNG được chọn -> Tự động tách nhóm (Ungroup)?
    -- Hoặc Master không được Checkout hoàn toàn nếu còn con chưa xử lý?
    -- Theo yêu cầu: "Phòng không chọn sẽ giữ nguyên trạng thái chờ." -> Có thể chờ Master thanh toán đợt 2 (Partial Payment)?
    -- Nhưng đây là "Process Checkout" (Trả phòng).
    -- Nếu Master trả phòng, Master phải sạch nợ.
    -- Vậy những phòng con chưa được chọn -> PHẢI TÁCH KHỎI NHÓM để Master được giải phóng.
    -- Logic bổ sung: Auto-Detach những phòng con KHÔNG được chọn khi Master Checkout.
    
    IF p_selected_child_ids IS NOT NULL THEN
        UPDATE public.bookings
        SET parent_booking_id = NULL,
            notes = COALESCE(notes, '') || E'\n[Group Detach] Master checked out without settling this room.'
        WHERE parent_booking_id = p_booking_id
          AND id != ALL(p_selected_child_ids)
          AND status NOT IN ('cancelled', 'completed', 'checked_out');
    END IF;


    -- Declare local variables for this block
    DECLARE
        v_master_bill jsonb;
        v_child_bill jsonb;
        v_total_bill_for_transaction numeric := 0;
        v_total_deposit_for_transaction numeric := 0;
        v_all_explanations text[] := '{}';
    BEGIN
        -- 3.1. Calculate bill for the Master Booking
        v_master_bill := public.calculate_booking_bill(p_booking_id);
        IF v_master_bill->>'success' = 'false' THEN
            RETURN v_master_bill; -- Propagate error from calculate_booking_bill
        END IF;
        v_total_bill_for_transaction := COALESCE((v_master_bill->>'total_amount')::numeric, 0);
        v_total_deposit_for_transaction := COALESCE((v_master_bill->>'deposit_amount')::numeric, 0);
        v_all_explanations := v_all_explanations || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_master_bill->'explanation') = 'array' THEN v_master_bill->'explanation' ELSE '[]'::jsonb END) AS x);

        -- 3.2. Calculate bills for selected Child Bookings and add them to the total
        IF p_selected_child_ids IS NOT NULL AND array_length(p_selected_child_ids, 1) > 0 THEN
            FOR v_child_record IN SELECT id FROM public.bookings WHERE id = ANY(p_selected_child_ids)
            LOOP
                v_child_bill := public.calculate_booking_bill(v_child_record.id);
                IF v_child_bill->>'success' = 'false' THEN
                    RETURN v_child_bill; -- Propagate error from calculate_booking_bill
                END IF;
                v_total_bill_for_transaction := v_total_bill_for_transaction + COALESCE((v_child_bill->>'total_amount')::numeric, 0);
                v_total_deposit_for_transaction := v_total_deposit_for_transaction + COALESCE((v_child_bill->>'deposit_amount')::numeric, 0);
                v_all_explanations := v_all_explanations || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_child_bill->'explanation') = 'array' THEN v_child_bill->'explanation' ELSE '[]'::jsonb END) AS x);
            END LOOP;
        END IF;

        -- Set v_total_amount and v_deposit for consistency with existing code structure
        v_total_amount := v_total_bill_for_transaction;
        v_deposit := v_total_deposit_for_transaction;
        -- Construct the final v_bill object to be returned and used by subsequent steps
        v_bill := jsonb_build_object(
            'success', true,
            'total_amount', v_total_amount,
            'deposit_amount', v_deposit,
            'explanation', v_all_explanations
        );
    END;

    -- 4. Update Master Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 5. Cash Flow Logic
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, payment_method_code, occurred_at, customer_id
        ) VALUES (
            'IN', 'Tiền phòng', p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, '') || ' (Checkout)', 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, LOWER(p_payment_method), now(), v_customer_id
        );
    END IF;

    -- 6. Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 7. Audit Log
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- 8. Audit Trail on Booking
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;

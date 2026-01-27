-- FILE: c:\1hotel2\db_scripts\fix_all_wallet_flows.sql
-- AUTHOR: AI Assistant (Standard Clean Version)
-- DATE: 2026-01-27
-- DESCRIPTION: 
-- Script tổng hợp sửa lỗi toàn diện luồng tiền (Cash Flow) & Ví (Wallets).
-- Phiên bản: SQL Thuần (Standard) - Dành cho DB Chính thức (Production).
-- Tuân thủ tuyệt đối Rule 8: Cash Basis và Rule 3: Schema thật.

-- =============================================
-- PHẦN 1: DỌN DẸP SẠCH SẼ (CLEANUP)
-- =============================================

DROP TRIGGER IF EXISTS tr_update_wallets ON public.cash_flow;
DROP FUNCTION IF EXISTS public.trg_update_wallets_dml();
DROP FUNCTION IF EXISTS public.fn_update_wallets();
DROP FUNCTION IF EXISTS public.fn_apply_wallet_logic(cash_flow, integer);
DROP FUNCTION IF EXISTS public.fn_apply_wallet_logic(public.cash_flow, integer);

-- =============================================
-- PHẦN 2: TRIGGER LOGIC (TRÁI TIM CỦA HỆ THỐNG)
-- =============================================

CREATE OR REPLACE FUNCTION public.trg_update_wallets_dml()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sign numeric;
    v_payment_method text;
    v_amount numeric;
BEGIN
    -- 1. Xác định hành động (INSERT/UPDATE/DELETE)
    -- Xử lý phần OLD (Hoàn tác - Reverse Effect)
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        v_sign := -1; -- Đảo ngược dấu
        v_amount := OLD.amount;
        v_payment_method := lower(COALESCE(OLD.payment_method_code, 'cash'));
        
        -- A. Xử lý Ghi Nợ (Credit)
        IF v_payment_method = 'credit' THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
            
        -- B. Xử lý Tiền Cọc (Deposit)
        ELSIF OLD.category = 'Tiền cọc' THEN
            -- Ví thực (Hoàn tác tiền vào Két/Bank)
            IF v_payment_method IN ('cash', 'tien mat', 'tiền mặt') THEN
                UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
            ELSE
                UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
            END IF;
            -- Ví ảo (Hoàn tác Escrow)
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'ESCROW';

        -- C. Xử lý Chuyển Cọc (Deposit Transfer)
        ELSIF OLD.category = 'Chuyển cọc' OR v_payment_method = 'deposit_transfer' THEN
            -- Logic gốc: Escrow giảm, Revenue tăng, Receivable giảm
            -- Reverse: Escrow tăng, Revenue giảm, Receivable tăng
            UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'ESCROW';
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
            UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';

        -- D. Xử lý Thu Tiền Phòng/Dịch Vụ (Payment) - IN
        ELSIF OLD.flow_type = 'IN' THEN
            -- Ví thực
            IF v_payment_method IN ('cash', 'tien mat', 'tiền mặt') THEN
                UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
            ELSE
                UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
            END IF;
            -- Ví doanh thu & Giảm nợ
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
            UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
            
        -- E. Xử lý Chi Tiền (Expense) - OUT
        ELSIF OLD.flow_type = 'OUT' THEN
             IF v_payment_method IN ('cash', 'tien mat', 'tiền mặt') THEN
                UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
            ELSE
                UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
            END IF;
            -- Chi phí làm giảm Revenue (P&L)
            UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
        END IF;
    END IF;

    -- Xử lý phần NEW (Thực hiện - Apply Effect)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_sign := 1; -- Dấu dương
        v_amount := NEW.amount;
        v_payment_method := lower(COALESCE(NEW.payment_method_code, 'cash'));

        -- A. Xử lý Ghi Nợ (Credit) - Chỉ tăng Receivable
        IF v_payment_method = 'credit' THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
            
        -- B. Xử lý Tiền Cọc (Deposit)
        ELSIF NEW.category = 'Tiền cọc' THEN
            -- Ví thực: Cash hoặc Bank (Theo yêu cầu người dùng)
            IF v_payment_method IN ('cash', 'tien mat', 'tiền mặt') THEN
                UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
            ELSE
                UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
            END IF;
            -- Ví ảo (Escrow): Tăng nợ phải trả khách
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'ESCROW';

        -- C. Xử lý Chuyển Cọc (Deposit Transfer)
        ELSIF NEW.category = 'Chuyển cọc' OR v_payment_method = 'deposit_transfer' THEN
            -- Giảm Escrow (Hết nợ khách)
            UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'ESCROW';
            -- Tăng Revenue (Ghi nhận doanh thu)
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
            -- Giảm Receivable (Trừ vào công nợ phòng)
            UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';

        -- D. Xử lý Thu Tiền Phòng/Dịch Vụ (Payment) - IN
        ELSIF NEW.flow_type = 'IN' THEN
            -- Ví thực
            IF v_payment_method IN ('cash', 'tien mat', 'tiền mặt') THEN
                UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
            ELSE
                UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
            END IF;
            -- Ví doanh thu & Giảm nợ
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
            UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
            
        -- E. Xử lý Chi Tiền (Expense) - OUT
        ELSIF NEW.flow_type = 'OUT' THEN
             IF v_payment_method IN ('cash', 'tien mat', 'tiền mặt') THEN
                UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
            ELSE
                UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
            END IF;
            -- Chi phí làm giảm Revenue (P&L)
            UPDATE public.wallets SET balance = balance - (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER tr_update_wallets
AFTER INSERT OR UPDATE OR DELETE ON public.cash_flow
FOR EACH ROW
EXECUTE FUNCTION public.trg_update_wallets_dml();

-- =============================================
-- PHẦN 3: CẬP NHẬT RPC PROCESS_CHECKOUT
-- =============================================

CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid,
    p_payment_method text,
    p_amount_paid numeric,
    p_discount numeric,
    p_surcharge numeric,
    p_notes text,
    p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_room_id uuid;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_actual_payment_method text;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());
    v_actual_payment_method := lower(p_payment_method);
    
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- 1. Update Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = v_actual_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. Record Cash Flow (Dòng tiền)
    
    -- A. Kết chuyển cọc (Nếu có cọc)
    IF v_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, ref_id, is_auto, occurred_at,
            payment_method_code
        )
        VALUES (
            'IN', 'Chuyển cọc', v_deposit, 
            'Kết chuyển cọc phòng ' || COALESCE(v_bill->>'room_name', '???'), 
            v_staff_id, p_booking_id, true, now(),
            'deposit_transfer'
        );
    END IF;

    -- B. Thanh toán phần còn lại (Nếu khách trả thêm)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, ref_id, is_auto, occurred_at,
            payment_method_code
        )
        VALUES (
            'IN', 'Thanh toán tiền phòng', p_amount_paid, 
            'Thanh toán Checkout phòng ' || COALESCE(v_bill->>'room_name', '???'), 
            v_staff_id, p_booking_id, true, now(),
            v_actual_payment_method
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Checkout thành công', 'bill', v_bill);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- =============================================
-- PHẦN 4: CẬP NHẬT RPC CHECK_IN_CUSTOMER
-- =============================================

CREATE OR REPLACE FUNCTION public.check_in_customer(
    p_room_id uuid,
    p_rental_type text,
    p_customer_id uuid DEFAULT NULL::uuid,
    p_deposit numeric DEFAULT 0,
    p_services jsonb DEFAULT '[]'::jsonb,
    p_customer_name text DEFAULT NULL::text,
    p_adults integer DEFAULT 1,
    p_children integer DEFAULT 0,
    p_notes text DEFAULT NULL::text,
    p_deposit_payment_method text DEFAULT 'cash',
    p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking_id uuid;
    v_staff_id uuid;
    v_deposit_method text;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());
    v_deposit_method := lower(COALESCE(p_deposit_payment_method, 'cash'));

    -- 1. Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, status, 
        check_in_actual, deposit_amount, notes,
        adults, children, created_by
    ) VALUES (
        p_room_id, p_customer_id, p_rental_type, 'occupied',
        now(), p_deposit, p_notes,
        p_adults, p_children, v_staff_id
    ) RETURNING id INTO v_booking_id;

    -- 2. Update Room Status
    UPDATE public.rooms SET status = 'occupied', updated_at = now() WHERE id = p_room_id;

    -- 3. Record Deposit (Tiền cọc)
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description,
            created_by, ref_id, is_auto, occurred_at,
            payment_method_code
        ) VALUES (
            'IN', 'Tiền cọc', p_deposit,
            'Nhận tiền cọc phòng (Check-in)',
            v_staff_id, v_booking_id, true, now(),
            v_deposit_method
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

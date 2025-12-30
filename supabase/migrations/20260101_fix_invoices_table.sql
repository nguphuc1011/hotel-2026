-- Migration: Fix Schema and RPC for Checkout Transaction
-- This script adds missing columns to 'invoices' and 'customers' tables,
-- and ensures 'process_checkout_transaction' RPC is up to date.

-- 1. FIX 'customers' table
DO $$ 
BEGIN
    -- last_visit
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='last_visit') THEN
        ALTER TABLE customers ADD COLUMN last_visit TIMESTAMPTZ;
    END IF;

    -- total_spent
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='total_spent') THEN
        ALTER TABLE customers ADD COLUMN total_spent NUMERIC DEFAULT 0;
    END IF;

    -- visit_count
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='visit_count') THEN
        ALTER TABLE customers ADD COLUMN visit_count INTEGER DEFAULT 0;
    END IF;

    -- loyalty_points
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='loyalty_points') THEN
        ALTER TABLE customers ADD COLUMN loyalty_points INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. FIX 'invoices' table
DO $$ 
BEGIN
    -- Ensure table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
        CREATE TABLE public.invoices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            booking_id UUID REFERENCES public.bookings(id),
            customer_id UUID REFERENCES public.customers(id),
            room_id UUID REFERENCES public.rooms(id),
            total_amount NUMERIC DEFAULT 0,
            payment_method TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    ELSE
        -- Add missing columns to existing table
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='invoices' AND column_name='customer_id') THEN
            ALTER TABLE public.invoices ADD COLUMN customer_id UUID REFERENCES public.customers(id);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='invoices' AND column_name='room_id') THEN
            ALTER TABLE public.invoices ADD COLUMN room_id UUID REFERENCES public.rooms(id);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='invoices' AND column_name='payment_method') THEN
            ALTER TABLE public.invoices ADD COLUMN payment_method TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='invoices' AND column_name='booking_id') THEN
            ALTER TABLE public.invoices ADD COLUMN booking_id UUID REFERENCES public.bookings(id);
        END IF;
    END IF;
END $$;

-- Ensure RLS on invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.invoices;
CREATE POLICY "Enable all for authenticated" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. UPDATE 'process_checkout_transaction' RPC
DROP FUNCTION IF EXISTS public.process_checkout_transaction(uuid, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.process_checkout_transaction(
    p_booking_id UUID,
    p_payment_method TEXT,
    p_surcharge NUMERIC,
    p_total_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room_id UUID;
    v_customer_id UUID;
    v_current_status TEXT;
BEGIN
    -- 1. Lấy thông tin booking
    SELECT room_id, customer_id, status INTO v_room_id, v_customer_id, v_current_status
    FROM public.bookings WHERE id = p_booking_id;

    IF v_current_status IS NULL THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy thông tin đặt phòng');
    END IF;

    -- Nếu đã completed rồi thì trả về success luôn
    IF v_current_status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Phòng này đã được thanh toán trước đó');
    END IF;

    -- 2. Cập nhật trạng thái Booking
    UPDATE public.bookings
    SET 
        status = 'completed',
        check_out_at = NOW(),
        surcharge = p_surcharge,
        total_amount = p_total_amount,
        final_amount = p_total_amount,
        payment_method = p_payment_method
    WHERE id = p_booking_id;

    -- 3. Tạo Hóa đơn (Invoice)
    INSERT INTO public.invoices (booking_id, customer_id, room_id, total_amount, payment_method)
    VALUES (p_booking_id, v_customer_id, v_room_id, p_total_amount, p_payment_method);

    -- 4. Cập nhật trạng thái Phòng sang 'dirty'
    UPDATE public.rooms
    SET status = 'dirty', current_booking_id = NULL, last_status_change = NOW()
    WHERE id = v_room_id;

    -- 6. Cập nhật thống kê khách hàng
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + p_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW()
        WHERE id = v_customer_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Thanh toán và tạo hóa đơn thành công');

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload config';

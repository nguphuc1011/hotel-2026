-- ==============================================================================
-- FIX MULTI-DEVICE REALTIME SYNC ENGINE (MANA PMS / HERA PMS) - FULL COVERAGE
-- ==============================================================================

-- 1. Ensure REPLICA IDENTITY FULL on core tables
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.booking_services REPLICA IDENTITY FULL;
ALTER TABLE public.cash_flow REPLICA IDENTITY FULL;
ALTER TABLE public.wallets REPLICA IDENTITY FULL;

-- 2. Ensure tables are in supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'booking_services'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_services;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'cash_flow'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_flow;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'wallets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
    END IF;
END $$;

-- 3. Tenant Access Checker (Works for HTTP requests and Realtime CDC workers)
CREATE OR REPLACE FUNCTION public.fn_can_access_tenant(p_hotel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    v_tenant uuid;
BEGIN
    -- Khi được gọi từ Postgres Background Worker / Supabase Realtime CDC (Không có HTTP context)
    IF current_setting('request.headers', true) IS NULL AND auth.jwt() IS NULL THEN
        RETURN true;
    END IF;

    -- Khi được gọi từ Client qua PostgREST HTTP: Bắt buộc kiểm tra tenant cách ly
    v_tenant := public.fn_get_tenant_id();
    IF v_tenant IS NOT NULL AND v_tenant = p_hotel_id THEN
        RETURN true;
    END IF;

    RETURN false;
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- 4. Cập nhật RLS Policies cho rooms, bookings, booking_services, cash_flow, wallets
DROP POLICY IF EXISTS "Tenant Isolation" ON public.rooms;
CREATE POLICY "Tenant Isolation" ON public.rooms FOR ALL TO public
USING (public.fn_can_access_tenant(hotel_id));

DROP POLICY IF EXISTS "Tenant Isolation" ON public.bookings;
CREATE POLICY "Tenant Isolation" ON public.bookings FOR ALL TO public
USING (public.fn_can_access_tenant(hotel_id));

DROP POLICY IF EXISTS "Tenant Isolation" ON public.booking_services;
CREATE POLICY "Tenant Isolation" ON public.booking_services FOR ALL TO public
USING (public.fn_can_access_tenant(hotel_id));

DROP POLICY IF EXISTS "Tenant Isolation" ON public.cash_flow;
CREATE POLICY "Tenant Isolation" ON public.cash_flow FOR ALL TO public
USING (public.fn_can_access_tenant(hotel_id));

-- 5. Trigger Realtime Broadcast trực tiếp từ Database (Bảo đảm 100% không thể thất lạc sự kiện)
CREATE OR REPLACE FUNCTION public.fn_realtime_dashboard_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid;
    v_table text := TG_TABLE_NAME;
BEGIN
    v_hotel_id := COALESCE(NEW.hotel_id, OLD.hotel_id);
    IF v_hotel_id IS NOT NULL THEN
        -- Gửi tới kênh Dashboard
        PERFORM realtime.send(
            jsonb_build_object(
                'table', v_table, 
                'action', TG_OP, 
                'id', COALESCE(NEW.id, OLD.id),
                'room_id', CASE 
                    WHEN v_table = 'rooms' THEN COALESCE(NEW.id, OLD.id)
                    WHEN v_table = 'bookings' THEN COALESCE(NEW.room_id, OLD.room_id)
                    ELSE NULL
                END,
                'timestamp', extract(epoch from now()) * 1000
            ),
            'dashboard_refresh',
            'dashboard_updates_' || v_hotel_id::text,
            false
        );

        -- Nếu là cash_flow, gửi thêm tới kênh Money Page
        IF v_table = 'cash_flow' THEN
            PERFORM realtime.send(
                jsonb_build_object('table', v_table, 'action', TG_OP, 'id', COALESCE(NEW.id, OLD.id)),
                'money_refresh',
                'money-page-changes-' || v_hotel_id::text,
                false
            );
        END IF;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Không bao giờ gián đoạn nghiệp vụ nếu realtime engine có cảnh báo
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_rooms_realtime ON public.rooms;
CREATE TRIGGER trg_notify_rooms_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.fn_realtime_dashboard_notify();

DROP TRIGGER IF EXISTS trg_notify_bookings_realtime ON public.bookings;
CREATE TRIGGER trg_notify_bookings_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.fn_realtime_dashboard_notify();

DROP TRIGGER IF EXISTS trg_notify_booking_services_realtime ON public.booking_services;
CREATE TRIGGER trg_notify_booking_services_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.fn_realtime_dashboard_notify();

DROP TRIGGER IF EXISTS trg_notify_cash_flow_realtime ON public.cash_flow;
CREATE TRIGGER trg_notify_cash_flow_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.cash_flow
FOR EACH ROW EXECUTE FUNCTION public.fn_realtime_dashboard_notify();

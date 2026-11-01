-- Dọn dẹp các hàm trigger thử nghiệm không còn sử dụng trong database
DROP FUNCTION IF EXISTS public.trg_expected_revenue_bookings_v2() CASCADE;
DROP FUNCTION IF EXISTS public.trg_expected_revenue_bookings_v4() CASCADE;
DROP FUNCTION IF EXISTS public.trg_expected_revenue_bookings_v7() CASCADE;
DROP FUNCTION IF EXISTS public.trg_expected_revenue_bookings_v8() CASCADE;

DROP FUNCTION IF EXISTS public.trg_expected_revenue_services_v2() CASCADE;
DROP FUNCTION IF EXISTS public.trg_expected_revenue_services_v4() CASCADE;
DROP FUNCTION IF EXISTS public.trg_expected_revenue_services_v7() CASCADE;
DROP FUNCTION IF EXISTS public.trg_expected_revenue_services_v8() CASCADE;

DROP FUNCTION IF EXISTS public.trg_expected_revenue_milestones() CASCADE;
DROP FUNCTION IF EXISTS public.trg_expected_revenue_milestones_v2() CASCADE;

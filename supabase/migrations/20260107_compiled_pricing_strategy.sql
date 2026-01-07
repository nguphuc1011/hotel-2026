-- MIGRATION: COMPILED PRICING STRATEGY
-- Date: 2026-01-07
-- Description: Add a compiled snapshot of pricing rules to speed up RPC calculations.

BEGIN;

-- 1. Thêm cột compiled_pricing_strategy vào bảng settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS compiled_pricing_strategy JSONB DEFAULT '{}'::jsonb;

-- 2. Hàm biên dịch logic tính toán
CREATE OR REPLACE FUNCTION public.compile_pricing_strategy()
RETURNS TRIGGER AS $$
DECLARE
    settings_data JSONB;
    compiled JSONB;
    v_overnight_start_minutes INT;
    v_overnight_end_minutes INT;
    v_check_in_minutes INT;
    v_check_out_minutes INT;
BEGIN
    -- Chỉ xử lý nếu key là 'system_settings'
    IF NEW.key != 'system_settings' THEN
        RETURN NEW;
    END IF;

    settings_data := NEW.value;

    -- Tính toán trước các mốc thời gian (quy đổi ra phút tính từ 00:00)
    -- Giúp RPC không cần parse chuỗi 'HH:mm' liên tục
    
    v_overnight_start_minutes := (split_part(settings_data->'overnight'->>'start', ':', 1)::INT * 60) + split_part(settings_data->'overnight'->>'start', ':', 2)::INT;
    v_overnight_end_minutes := (split_part(settings_data->'overnight'->>'end', ':', 1)::INT * 60) + split_part(settings_data->'overnight'->>'end', ':', 2)::INT;
    v_check_in_minutes := (split_part(settings_data->>'check_in', ':', 1)::INT * 60) + split_part(settings_data->>'check_in', ':', 2)::INT;
    v_check_out_minutes := (split_part(settings_data->>'check_out', ':', 1)::INT * 60) + split_part(settings_data->>'check_out', ':', 2)::INT;

    -- Xây dựng snapshot logic
    compiled := jsonb_build_object(
        'version', '2.0',
        'updated_at', NOW(),
        -- Quy tắc làm tròn & ân hạn
        'grace_minutes', jsonb_build_object(
            'initial', CASE WHEN (settings_data->>'initial_grace_enabled')::BOOLEAN THEN (settings_data->>'initial_grace_minutes')::INT ELSE 0 END,
            'late', CASE WHEN (settings_data->>'late_grace_enabled')::BOOLEAN THEN (settings_data->>'late_grace_minutes')::INT ELSE 0 END
        ),
        -- Mốc thời gian đã biên dịch
        'time_milestones', jsonb_build_object(
            'check_in_m', v_check_in_minutes,
            'check_out_m', v_check_out_minutes,
            'overnight_start_m', v_overnight_start_minutes,
            'overnight_end_m', v_overnight_end_minutes
        ),
        -- Logic phụ thu (đã lọc bỏ các rule không hợp lệ)
        'surcharge_rules', jsonb_build_object(
            'method', settings_data->>'surcharge_method',
            'early', COALESCE(settings_data->'early_rules', '[]'::jsonb),
            'late', COALESCE(settings_data->'late_rules', '[]'::jsonb)
        ),
        -- Chế độ giờ
        'hourly_config', jsonb_build_object(
            'mode', settings_data->>'hourly_mode',
            'unit_minutes', (settings_data->>'hourly_unit')::INT,
            'ceiling_percent', CASE WHEN (settings_data->>'hourly_ceiling_enabled')::BOOLEAN THEN (settings_data->>'hourly_ceiling_percent')::INT ELSE NULL END
        )
    );

    NEW.compiled_pricing_strategy := compiled;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Tạo Trigger tự động biên dịch khi settings thay đổi
DROP TRIGGER IF EXISTS trg_compile_pricing_strategy ON public.settings;
CREATE TRIGGER trg_compile_pricing_strategy
BEFORE INSERT OR UPDATE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.compile_pricing_strategy();

-- 4. Chạy biên dịch lần đầu cho dữ liệu hiện có
UPDATE public.settings SET updated_at = NOW() WHERE key = 'system_settings';

COMMIT;

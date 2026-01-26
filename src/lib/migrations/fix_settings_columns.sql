-- Migration to add missing flat columns to settings table
-- and migrate data from JSON 'value' column

-- 1. Add Columns (No hardcoded defaults as per OWNER'S COMMAND)
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS check_in_time time;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS check_out_time time;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS overnight_start_time time;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS overnight_end_time time;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS overnight_checkout_time time;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS full_day_early_before time;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS full_day_late_after time;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_surcharge_enabled boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS extra_person_enabled boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS extra_person_method text DEFAULT 'percent';

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS grace_in_enabled boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS grace_out_enabled boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS grace_minutes int DEFAULT 15;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS vat_enabled boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS service_fee_enabled boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS vat_percent numeric DEFAULT 0;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS service_fee_percent numeric DEFAULT 0;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_unit int DEFAULT 60;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS base_hourly_limit int DEFAULT 1;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_ceiling_enabled boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_ceiling_percent numeric DEFAULT 100;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS surcharge_rules jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_deduct_inventory boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS enable_print_bill boolean DEFAULT true;

-- 2. Migrate Data from 'value' JSON (if exists)
DO $$
DECLARE
    v_config jsonb;
BEGIN
    SELECT value INTO v_config FROM public.settings WHERE key = 'system_settings' OR key = 'config' LIMIT 1;
    
    IF v_config IS NOT NULL THEN
        UPDATE public.settings
        SET
            check_in_time = COALESCE((v_config->>'check_in_time')::time, (v_config->>'check_in')::time),
            check_out_time = COALESCE((v_config->>'check_out_time')::time, (v_config->>'check_out')::time),
            overnight_start_time = (v_config->'overnight'->>'start')::time,
            overnight_end_time = (v_config->'overnight'->>'end')::time,
            
            grace_minutes = (v_config->>'grace_minutes')::int,
            grace_in_enabled = COALESCE((v_config->>'grace_in_enabled')::boolean, (v_config->>'initial_grace_enabled')::boolean, true),
            grace_out_enabled = COALESCE((v_config->>'grace_out_enabled')::boolean, (v_config->>'late_grace_enabled')::boolean, true),
            
            vat_percent = COALESCE((v_config->'tax_config'->>'vat')::numeric, 0),
            service_fee_percent = COALESCE((v_config->'tax_config'->>'service_fee')::numeric, 0),
            -- Assume disabled if not present in JSON, or false
            vat_enabled = COALESCE((v_config->>'vat_enabled')::boolean, false),
            service_fee_enabled = COALESCE((v_config->>'service_fee_enabled')::boolean, false),
            
            hourly_unit = COALESCE((v_config->>'hourly_unit')::int, 60),
            base_hourly_limit = COALESCE((v_config->>'base_hourly_limit')::int, 1),
            hourly_ceiling_enabled = COALESCE((v_config->>'hourly_ceiling_enabled')::boolean, false),
            
            surcharge_rules = COALESCE(
                -- Combine late/early rules into new structure if needed, or just use what's there
                -- For now, let's try to preserve late_rules if present
                 jsonb_build_object(
                    'late_rules', v_config->'late_rules',
                    'early_rules', v_config->'early_rules'
                 ),
                 '[]'::jsonb
            )
        WHERE key = 'system_settings' OR key = 'config';
    END IF;
END $$;

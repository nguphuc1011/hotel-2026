-- Add Telegram Settings to public.settings table
-- Created: 2026-02-03

ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS telegram_bot_token text,
ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- Ensure config row exists
INSERT INTO public.settings (key)
VALUES ('config')
ON CONFLICT (key) DO NOTHING;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';

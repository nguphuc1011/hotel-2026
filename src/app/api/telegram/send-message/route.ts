import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin Client to fetch settings (securely)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, parse_mode = 'HTML' } = body;

    if (!text) {
      return NextResponse.json({ ok: false, error: 'Missing text' }, { status: 400 });
    }

    // 1. Fetch Telegram Config from DB
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('telegram_bot_token, telegram_chat_id')
      .eq('key', 'config')
      .single();

    if (settingsError || !settings) {
      console.error('Failed to fetch settings:', settingsError);
      return NextResponse.json({ ok: false, error: 'Configuration error' }, { status: 500 });
    }

    const { telegram_bot_token: BOT_TOKEN, telegram_chat_id: CHAT_ID } = settings;

    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn('Telegram configuration missing in DB');
      return NextResponse.json({ ok: false, error: 'Telegram not configured' }, { status: 404 });
    }

    // 2. Send Message via Telegram API
    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: parse_mode
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Telegram API Error:', result);
      return NextResponse.json({ ok: false, error: result.description }, { status: 400 });
    }

    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

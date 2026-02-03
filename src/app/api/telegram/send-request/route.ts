import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin Client to fetch settings (securely)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, action, staffName, requestData } = body;

    if (!requestId || !action) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
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

    // 2. Format Message (Logic moved from client)
    const actionNames: Record<string, string> = {
      'checkin_cancel_booking': 'HỦY PHÒNG',
      'checkin_custom_price': 'ĐỔI GIÁ PHÒNG',
      'checkout_discount': 'GIẢM GIÁ BILL',
      'checkout_void_bill': 'XÓA HÓA ĐƠN',
      'folio_add_service': 'THÊM DỊCH VỤ',
      'folio_remove_service': 'XÓA DỊCH VỤ',
      'folio_edit_service': 'SỬA DỊCH VỤ',
      'folio_change_room': 'ĐỔI PHÒNG',
      'folio_edit_booking': 'SỬA BOOKING',
    };

    const friendlyAction = actionNames[action] || action.toUpperCase().replace(/_/g, ' ');
    
    // Label Mapping
    const labelMap: Record<string, string> = {
        'room_number': '🏠 Phòng',
        'roomNumber': '🏠 Phòng',
        'customer_name': '👤 Khách',
        'customerName': '👤 Khách',
        'amount': '💰 Số tiền',
        'price': '💰 Giá mới',
        'old_price': '🔻 Giá cũ',
        'discount_amount': '📉 Giảm',
        'penalty_amount': '⚠️ Phạt',
        'payment_method': '💳 HTTT',
        'reason': '📝 Lý do',
        'notes': '📝 Ghi chú'
    };

    const paymentMethodMap: Record<string, string> = {
        'cash': 'Tiền mặt',
        'transfer': 'Chuyển khoản',
        'card': 'Thẻ',
        'debt': 'Công nợ'
    };

    let details = '';
    if (requestData) {
        details = Object.entries(requestData)
            .filter(([key, value]) => labelMap[key] && value !== undefined && value !== null && value !== '')
            .map(([key, value]) => {
                let displayValue = value;
                // Format numbers
                if (typeof value === 'number') {
                    displayValue = value.toLocaleString('vi-VN');
                }
                // Map payment methods
                if (key === 'payment_method' && typeof value === 'string') {
                    displayValue = paymentMethodMap[value] || value;
                }
                
                return `• ${labelMap[key]}: <b>${displayValue}</b>`;
            })
            .join('\n');
    }

    const text = `
🔔 <b>YÊU CẦU PHÊ DUYỆT</b>
----------------
🔹 Hành động: <b>${friendlyAction}</b>
👤 Nhân viên: ${staffName}
${details ? `\n${details}` : ''}
----------------
<i>Vui lòng phản hồi:</i>
`;

    // 3. Send to Telegram
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: text,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ ĐỒNG Ý', callback_data: `approve_${requestId}` },
                { text: '❌ TỪ CHỐI', callback_data: `reject_${requestId}` }
              ]
            ]
          }
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error('Telegram API Error:', errText);
        return NextResponse.json({ ok: false, error: 'Telegram API Error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

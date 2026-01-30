import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const botToken = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || '';
const defaultManagerId = '25b0a204-064b-4281-89cf-ccfc95d9adf7'; // ntt (Admin)

// Initialize client only if variables are present to avoid build-time errors
const supabase = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

export async function POST(req: NextRequest) {
  try {
    if (!supabase) {
      console.error('Supabase client not initialized - missing environment variables');
      return NextResponse.json({ ok: false, error: 'Internal Server Error: Missing config' }, { status: 500 });
    }
    const body = await req.json();
    console.log('Telegram Webhook received:', JSON.stringify(body));

    // 1. Handle Callback Query (Buttons)
    if (body.callback_query) {
      const { id: callbackQueryId, data, message } = body.callback_query;
      const chatId = message.chat.id;
      const messageId = message.message_id;

      const [action, requestId] = data.split('_');

      if (action === 'approve') {
        const { data: result, error } = await supabase.rpc('fn_approve_request', {
          p_manager_id: String(defaultManagerId),
          p_manager_pin: null,
          p_method: 'TELEGRAM',
          p_request_id: String(requestId)
        });

        if (error || !result.success) {
          await sendTelegramResponse(callbackQueryId, `Lỗi: ${error?.message || result?.message}`);
        } else {
          await sendTelegramResponse(callbackQueryId, 'Đã phê duyệt thành công!');
          await editTelegramMessage(chatId, messageId, message.text + '\n\n✅ <b>ĐÃ PHÊ DUYỆT</b>\nBởi: Quản lý (qua Telegram)');
        }
      } 
      
      else if (action === 'reject') {
        const { error } = await supabase
          .from('pending_approvals')
          .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
          .eq('id', requestId);

        if (error) {
          await sendTelegramResponse(callbackQueryId, `Lỗi: ${error.message}`);
        } else {
          await sendTelegramResponse(callbackQueryId, 'Đã từ chối yêu cầu.');
          await editTelegramMessage(chatId, messageId, message.text + '\n\n❌ <b>ĐÃ TỪ CHỐI</b>');
        }
      }
    }

    // 2. Handle Text Commands (Optional: Duyệt {id})
    if (body.message?.text?.toLowerCase().startsWith('duyệt ')) {
      const text = body.message.text;
      const chatId = body.message.chat.id;
      const requestIdInput = text.split(' ')[1]?.trim();

      if (requestIdInput) {
        let requestId = requestIdInput;
        // Prefix search (8 chars)
        if (requestIdInput.length === 8) {
          const { data: found } = await supabase
            .from('pending_approvals')
            .select('id')
            .ilike('id', `${requestIdInput}%`)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (found && found.length > 0) {
            requestId = found[0].id;
          }
        }

        const { data: result, error } = await supabase.rpc('fn_approve_request', {
          p_request_id: requestId,
          p_method: 'TELEGRAM',
          p_manager_id: defaultManagerId
        });

        if (error || !result.success) {
          await sendTextMessage(chatId, `❌ Lỗi: ${error?.message || result?.message}`);
        } else {
          await sendTextMessage(chatId, `✅ Đã phê duyệt yêu cầu <code>${requestId}</code> thành công!`);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

async function sendTelegramResponse(callbackQueryId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text
    })
  });
}

async function editTelegramMessage(chatId: number, messageId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML'
    })
  });
}

async function sendTextMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    })
  });
}

import { supabase } from '@/lib/supabase';
import { formatMoney } from '@/utils/format';

export const telegramService = {
  async sendMessage(text: string) {
    const BOT_TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn('Telegram Bot Token or Chat ID is missing');
      return;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send Telegram message');
      }
    } catch (error) {
      console.error('Error sending Telegram message:', error);
    }
  },

  formatCheckoutMessage(bill: any, amountPaid: number, balanceDiff: number, notes: string) {
    const status = balanceDiff < 0 ? '🔴 CÒN NỢ' : balanceDiff > 0 ? '🟢 TRẢ THỪA' : '🔵 ĐÃ ĐỦ';
    const amountStr = formatMoney(Math.abs(balanceDiff));
    
    return `
<b>🛎 THÔNG BÁO TRẢ PHÒNG</b>
━━━━━━━━━━━━━━━━━━
🏠 <b>Phòng:</b> ${bill.room_number}
👤 <b>Khách:</b> ${bill.customer_name}
💰 <b>Tổng bill:</b> ${formatMoney(bill.amount_to_pay || 0)}
💵 <b>Khách đưa:</b> ${formatMoney(amountPaid)}
━━━━━━━━━━━━━━━━━━
📌 <b>Kết quả:</b> ${status}
💸 <b>Số tiền:</b> ${amountStr}
📝 <b>Ghi chú:</b> ${notes || 'Không có'}
━━━━━━━━━━━━━━━━━━
🕒 <i>${new Date().toLocaleString('vi-VN')}</i>
    `.trim();
  },

  async sendApprovalRequest(requestId: string, action: string, staffName: string, requestData: any = {}) {
    const BOT_TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn('Telegram Bot Token or Chat ID is missing');
      return;
    }

    const actionNames: Record<string, string> = {
      'checkin_cancel_booking': 'HỦY PHÒNG',
      'checkin_custom_price': 'ĐỔI GIÁ PHÒNG',
      'checkout_discount': 'GIẢM GIÁ BILL',
      'checkout_void_bill': 'XÓA HÓA ĐƠN',
      'folio_add_service': 'THÊM DỊCH VỤ',
      'folio_remove_service': 'XÓA DỊCH VỤ',
    };

    const friendlyAction = actionNames[action] || action.toUpperCase().replace(/_/g, ' ');
    
    // Whitelist & Mapping
    let details = '';
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
        'credit': 'Công nợ'
    };

    if (requestData && typeof requestData === 'object') {
      // 1. Context Info (Room & Customer)
      const room = requestData.room_number || requestData.roomNumber;
      const customer = requestData.customer_name || requestData.customerName;
      
      if (room) details += `\n🏠 <b>Phòng:</b> ${room}`;
      if (customer) details += `\n👤 <b>Khách:</b> ${customer}`;
      
      details += `\n━━━━━━━━━━━━━━━━━━`;

      // 2. Financial & Detail Info
      Object.entries(requestData).forEach(([key, value]) => {
        if (!labelMap[key]) return; 
        if (key.includes('room') || key.includes('customer')) return; // Already handled
        
        let displayValue = value;

        // Format Money
        if ((key.includes('amount') || key.includes('price')) && typeof value === 'number') {
          displayValue = formatMoney(value);
        }

        // Format Payment Method
        if (key === 'payment_method' && typeof value === 'string') {
            displayValue = paymentMethodMap[value] || value;
        }
        
        details += `\n${labelMap[key]}: <b>${displayValue}</b>`;
      });
    }

    const text = `
<b>🔔 YÊU CẦU DUYỆT: ${friendlyAction}</b>
━━━━━━━━━━━━━━━━━━
👮 <b>Người gửi:</b> ${staffName}
${details}
━━━━━━━━━━━━━━━━━━
🕒 <i>${new Date().toLocaleString('vi-VN')}</i>
    `.trim();

    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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
    } catch (error) {
      console.error('Error sending Telegram approval request:', error);
    }
  }
};

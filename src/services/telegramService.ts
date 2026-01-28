import { supabase } from '@/lib/supabase';

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
    const status = balanceDiff < 0 ? '🔴 KHÁCH NỢ LẠI' : balanceDiff > 0 ? '🟢 CÓ TIỀN THỪA' : '🔵 THANH TOÁN ĐỦ';
    const amountStr = formatMoney(Math.abs(balanceDiff));
    
    return `
<b>🛎 THÔNG BÁO CHECK-OUT</b>
-------------------------
🏠 <b>Phòng:</b> ${bill.room_number}
👤 <b>Khách hàng:</b> ${bill.customer_name}
💰 <b>Tổng bill:</b> ${formatMoney(bill.amount_to_pay || 0)}
💵 <b>Khách trả:</b> ${formatMoney(amountPaid)}
-------------------------
📌 <b>Trạng thái:</b> ${status}
💸 <b>Số tiền:</b> ${amountStr}
📝 <b>Ghi chú:</b> ${notes || 'Không có'}
-------------------------
🕒 <i>${new Date().toLocaleString('vi-VN')}</i>
    `.trim();
  }
};

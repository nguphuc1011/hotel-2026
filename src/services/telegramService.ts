import { formatMoney } from '@/utils/format';

export const telegramService = {
  async sendMessage(text: string) {
    try {
      const response = await fetch('/api/telegram/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text
        }),
      });

      if (!response.ok) {
        console.error('Failed to send Telegram message');
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

  formatShiftReportMessage(
    staffName: string, 
    systemCash: number, 
    declaredCash: number, 
    variance: number, 
    auditStatus: string
  ) {
    const isMatched = variance === 0;
    const icon = isMatched ? '🟢' : '🔴';
    const title = isMatched ? 'BÁO CÁO GIAO CA (KHỚP)' : 'CẢNH BÁO GIAO CA (LỆCH)';
    
    return `
${icon} <b>${title}</b>
━━━━━━━━━━━━━━━━━━
👤 <b>Nhân viên:</b> ${staffName}
💻 <b>Tiền hệ thống:</b> ${formatMoney(systemCash)}
💵 <b>Tiền thực tế:</b> ${formatMoney(declaredCash)}
━━━━━━━━━━━━━━━━━━
📊 <b>Chênh lệch:</b> ${formatMoney(variance)}
📝 <b>Trạng thái:</b> ${auditStatus === 'pending' ? 'Chờ kiểm duyệt' : 'Đã duyệt'}
🕒 <i>${new Date().toLocaleString('vi-VN')}</i>
    `.trim();
  },

  async sendApprovalRequest(requestId: string, action: string, staffName: string, requestData: any = {}) {
    try {
      const response = await fetch('/api/telegram/send-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId,
          action,
          staffName,
          requestData
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to send Telegram request via API:', error);
      }
    } catch (error) {
      console.error('Error calling Telegram API:', error);
    }
  }
};

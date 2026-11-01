const fs = require('fs');

let code = fs.readFileSync('src/services/customerService.ts', 'utf8');

const target = `  async getDebtors() {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .lt('balance', 0)
        .order('balance', { ascending: true }); // Most debt first (negative numbers)
        
      if (error) throw error;
      return data as Customer[];
    } catch (err) {
      console.error('Error fetching debtors:', formatError(err));
      return [];
    }
  }`;

const replacement = `  async getDebtors(hotelId?: string) {
    try {
      const targetHotelId = hotelId || getActiveHotelId();
      let query = supabase
        .from('customers')
        .select('*')
        .lt('balance', 0);

      if (targetHotelId) {
        query = query.eq('hotel_id', targetHotelId);
      }

      const { data, error } = await query.order('balance', { ascending: true });
        
      if (error) throw error;
      return data as Customer[];
    } catch (err) {
      console.error('Error fetching debtors:', formatError(err));
      return [];
    }
  }`;

// normalize CRLF
const normCode = code.replace(/\r\n/g, '\n');
const normTarget = target.replace(/\r\n/g, '\n');

if (normCode.includes(normTarget)) {
  const updated = normCode.replace(normTarget, replacement.replace(/\r\n/g, '\n'));
  fs.writeFileSync('src/services/customerService.ts', updated, 'utf8');
  console.log('✅ Replaced getDebtors successfully!');
} else {
  console.log('❌ Target not found');
}

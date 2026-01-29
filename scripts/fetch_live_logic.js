
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetch() {
  const { data, error } = await supabase.rpc('get_rpc_definitions', {
    search_names: ['fn_apply_wallet_logic', 'trg_update_wallets', 'process_checkout', 'check_in_customer', 'calculate_booking_bill']
  });

  if (error) {
    // Nếu không có hàm get_rpc_definitions, ta dùng một mẹo khác là dùng bảng audit hoặc log nếu có
    console.error('Lỗi:', error.message);
    return;
  }

  let output = '';
  data.forEach(row => {
    output += `\n--- ${row.name} ---\n${row.definition}\n`;
  });

  fs.writeFileSync('live_logic_check.sql', output);
  console.log('Đã lưu logic thực tế vào live_logic_check.sql');
}

fetch();

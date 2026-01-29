
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLiveFinancials() {
  console.log('--- DỮ LIỆU THỰC TẾ TỪ SUPABASE ---');

  // 1. Kiểm tra số dư các ví
  const { data: wallets, error: wError } = await supabase
    .from('wallets')
    .select('id, name, balance, updated_at')
    .order('id');

  if (wError) {
    console.error('Lỗi lấy dữ liệu ví:', wError.message);
  } else {
    console.log('\n[SỐ DƯ CÁC VÍ HIỆN TẠI]');
    console.table(wallets.map(w => ({
      'Mã ví': w.id,
      'Tên ví': w.name,
      'Số dư': new Intl.NumberFormat('vi-VN').format(w.balance) + 'đ',
      'Cập nhật cuối': new Date(w.updated_at).toLocaleString('vi-VN')
    })));
  }

  // 2. Kiểm tra 5 giao dịch dòng tiền gần nhất
  const { data: cashFlow, error: cfError } = await supabase
    .from('cash_flow')
    .select('occurred_at, flow_type, category, amount, description, payment_method_code')
    .order('occurred_at', { ascending: false })
    .limit(5);

  if (cfError) {
    console.error('Lỗi lấy dòng tiền:', cfError.message);
  } else {
    console.log('\n[5 GIAO DỊCH DÒNG TIỀN GẦN NHẤT]');
    console.table(cashFlow.map(cf => ({
      'Thời gian': new Date(cf.occurred_at).toLocaleString('vi-VN'),
      'Loại': cf.flow_type,
      'Danh mục': cf.category,
      'Số tiền': new Intl.NumberFormat('vi-VN').format(cf.amount) + 'đ',
      'Phương thức': cf.payment_method_code,
      'Nội dung': cf.description
    })));
  }

  // 3. Kiểm tra trạng thái các phòng đang có khách
  const { data: occupiedRooms, error: rError } = await supabase
    .from('rooms')
    .select('room_number, status, current_booking_id')
    .eq('status', 'occupied');

  if (rError) {
    console.error('Lỗi lấy trạng thái phòng:', rError.message);
  } else {
    console.log(`\n[TRẠNG THÁI PHÒNG]: Hiện có ${occupiedRooms.length} phòng đang có khách.`);
  }
}

checkLiveFinancials();

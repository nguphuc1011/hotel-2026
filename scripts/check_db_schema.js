
const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFunctions() {
  console.log('🔍 Đang kiểm tra danh sách hàm trong schema public...');
  
  const { data, error } = await supabase.rpc('fn_get_db_functions_info'); // Thử gọi một hàm helper nếu có

  // Nếu không có hàm helper, ta dùng truy vấn SQL thông qua rpc (nếu được phép)
  // Hoặc dùng một truy vấn thô nếu client có quyền
  
  const sql = `
    SELECT 
      p.proname as function_name,
      pg_get_function_arguments(p.oid) as arguments,
      t.typname as return_type
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    JOIN pg_type t ON p.prorettype = t.oid
    WHERE n.nspname = 'public'
    AND p.proname IN ('fn_approve_request', 'fn_create_approval_request', 'fn_resolve_policy')
    ORDER BY p.proname;
  `;

  console.log('--- Thực hiện truy vấn metadata ---');
  
  // Vì Supabase client không cho chạy SQL thô trực tiếp qua .query(), 
  // ta sẽ tạo một hàm helper tạm thời trong DB để check nếu cần.
  // Nhưng trước tiên hãy thử xem có lỗi "function not found" thật không bằng cách gọi thử với tham số giả.
  
  try {
    console.log('🧪 Thử gọi fn_approve_request với tham số giả...');
    const result = await supabase.rpc('fn_approve_request', {
      p_manager_id: '00000000-0000-0000-0000-000000000000',
      p_manager_pin: '123456',
      p_method: 'TEST',
      p_request_id: '00000000-0000-0000-0000-000000000000'
    });
    
    if (result.error) {
      console.log('❌ Kết quả lỗi từ RPC:', result.error.message);
      if (result.error.message.includes('Could not find the function')) {
        console.log('💡 XÁC NHẬN: DB hiện tại KHÔNG có hàm này với chữ ký này.');
      }
    } else {
      console.log('✅ Tìm thấy hàm! Kết quả:', result.data);
    }
  } catch (err) {
    console.error('💥 Lỗi thực thi script:', err.message);
  }
}

checkFunctions();

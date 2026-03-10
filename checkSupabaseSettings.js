
require('dotenv').config({ path: '.env.local' }); // Load .env.local first
require('dotenv').config({ path: '.env' }); // Then load .env, .env.local takes precedence

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('LỖI: Không tìm thấy NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY trong biến môi trường.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSettings() {
  console.log('Đang kết nối đến Supabase và truy vấn bảng public.settings...');
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'config')
      .single();

    if (error) {
      console.error('LỖI khi truy vấn public.settings:', error);
      return;
    }

    if (data) {
      console.log('Cài đặt hiện tại từ public.settings (key = config):');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('Không tìm thấy dòng nào với key = "config" trong bảng public.settings.');
    }
  } catch (err) {
    console.error('LỖI không xác định khi truy vấn Supabase:', err.message);
  } finally {
    console.log('Hoàn tất kiểm tra cài đặt.');
  }
}

checkSettings();

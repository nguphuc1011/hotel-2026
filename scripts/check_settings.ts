
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSettings() {
  console.log('--- KIỂM TRA BẢNG SETTINGS ---');
  const { data, error } = await supabase
    .from('settings')
    .select('*');

  if (error) {
    console.error('Lỗi khi lấy dữ liệu settings:', error);
    return;
  }

  console.log('Dữ liệu settings hiện tại:');
  console.dir(data, { depth: null });
}

checkSettings();

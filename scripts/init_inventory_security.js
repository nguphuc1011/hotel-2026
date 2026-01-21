
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function initSecuritySetting() {
  console.log('Initializing inventory_import security setting...');

  const { error } = await supabase
    .from('settings_security')
    .upsert({
      key: 'inventory_import',
      description: 'Nhập kho hàng hóa',
      is_enabled: true,
      category: 'inventory',
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

  if (error) {
    console.error('Error inserting setting:', error);
  } else {
    console.log('Successfully initialized inventory_import setting.');
  }
}

initSecuritySetting();

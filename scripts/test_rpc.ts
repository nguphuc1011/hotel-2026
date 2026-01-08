
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const mode = process.argv[2];
  const param = process.argv[3];
  const val = process.argv[4];

  if (mode === '--booking') {
    const { data, error } = await supabase.rpc('calculate_booking_bill_v2', {
      p_booking_id: param
    });
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
  } else if (mode === '--update-balance') {
    const { data, error } = await supabase
      .from('customers')
      .update({ balance: parseInt(val) })
      .eq('id', param);
    if (error) console.error(error);
    else console.log(`✅ Updated balance for ${param} to ${val}`);
  }
}

run().catch(console.error);

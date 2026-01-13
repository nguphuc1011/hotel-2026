import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase environment variables are missing!', {
    url: !!supabaseUrl,
    key: !!supabaseAnonKey
  });
} else {
  console.log('Supabase client initialized with URL:', supabaseUrl.substring(0, 20) + '...');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

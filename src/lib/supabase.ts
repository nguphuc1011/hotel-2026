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

// Initialize with dummy values if environment variables are missing to prevent build-time crashes.
// The client will still fail at runtime if used without valid credentials.
const finalUrl = supabaseUrl || 'https://placeholder.supabase.co';
const finalKey = supabaseAnonKey || 'placeholder-key';

export const supabase = createClient(finalUrl, finalKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

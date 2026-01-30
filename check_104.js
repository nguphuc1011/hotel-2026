const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  console.log('Starting check...');
  const { data: rooms, error: roomError } = await supabase.from('rooms').select('id, room_number').eq('room_number', '104');
  if (roomError) { console.error('Room error:', roomError); return; }
  console.log('Rooms found:', rooms.length);
  if (rooms.length === 0) return;

  const roomId = rooms[0].id;
  console.log('Room ID for 104:', roomId);

  const { data: bookings, error: bookingError } = await supabase.from('bookings').select('id, status, check_in_actual').eq('room_id', roomId);
  if (bookingError) { console.error('Booking error:', bookingError); return; }
  console.log('Total bookings for room 104:', bookings.length);
  bookings.forEach(b => {
    console.log(`- ID: ${b.id}, Status: ${b.status}, In: ${b.check_in_actual}`);
  });

  const active = bookings.find(b => b.status === 'checked_in');
  if (active) {
    console.log('Active (checked_in) booking found:', active.id);
    // Get settings and category info
    const { data: settings } = await supabase.from('settings').select('*').eq('key', 'config').single();
    console.log('Settings:', JSON.stringify(settings.value, null, 2));

    const { data: room } = await supabase.from('rooms').select('category_id').eq('id', roomId).single();
    const { data: category } = await supabase.from('room_categories').select('*').eq('id', room.category_id).single();
    console.log('Category:', JSON.stringify(category, null, 2));

    // Calculate bill
    const { data: bill, error: billError } = await supabase.rpc('calculate_booking_bill', { p_booking_id: active.id });
    if (billError) { console.error('Bill error:', billError); return; }
    console.log('Bill result:', JSON.stringify(bill, null, 2));
  } else {
    console.log('No checked_in booking found for 104');
  }
}

check().catch(console.error);

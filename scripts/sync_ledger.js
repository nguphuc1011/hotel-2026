const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
});

async function syncAll() {
  try {
    await client.connect();
    
    // Get all bookings that are checked_in or completed
    const { rows } = await client.query("SELECT id FROM public.bookings WHERE status IN ('checked_in', 'completed')");
    
    console.log(`Found ${rows.length} bookings to sync.`);
    
    for (const row of rows) {
      await client.query("SELECT public.fn_sync_booking_to_ledger($1)", [row.id]);
    }
    
    console.log('Successfully synced all bookings to ledger.');
  } catch (err) {
    console.error('Error syncing bookings:', err);
  } finally {
    await client.end();
  }
}

syncAll();

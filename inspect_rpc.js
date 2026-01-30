const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '.env.local');
let DATABASE_URL;

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL=(.*)/);
  if (match) {
      DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
  }
} catch (e) {
  console.error('Could not read .env.local');
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to DB.');

    // 1. Check Overloads
    console.log('\n--- Checking Function Signatures (Overloads) ---');
    const overloads = await client.query(`
      SELECT routine_name, pg_get_function_identity_arguments(to_regproc(routine_name::text)) as args
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name IN ('update_booking_details', 'cancel_booking', 'adjust_customer_balance')
      ORDER BY routine_name;
    `);
    // Note: pg_get_function_identity_arguments might fail if multiple exist with same name, 
    // better to query pg_proc directly for accurate results.
    
    const procOverloads = await client.query(`
        SELECT proname, pg_get_function_identity_arguments(oid) as args
        FROM pg_proc
        WHERE proname IN ('update_booking_details', 'cancel_booking', 'adjust_customer_balance')
        AND pronamespace = 'public'::regnamespace;
    `);
    console.table(procOverloads.rows);

    // 2. Check Security Settings
    console.log('\n--- Checking Security Settings (Global Policies) ---');
    const settings = await client.query(`
        SELECT key, policy_type, description 
        FROM settings_security 
        ORDER BY key;
    `);
    console.table(settings.rows);

    // 3. Check "change_room" logic
    console.log('\n--- Checking change_room definition ---');
    const changeRoomDef = await client.query(`
        SELECT pg_get_functiondef(oid) 
        FROM pg_proc 
        WHERE proname = 'change_room';
    `);
    if (changeRoomDef.rows.length > 0) {
        // Just print the first few lines to check if it has security checks
        console.log(changeRoomDef.rows[0].pg_get_functiondef.substring(0, 500) + '...');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();

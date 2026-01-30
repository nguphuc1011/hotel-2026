
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!conn) {
  console.error('Missing DATABASE_URL or DIRECT_URL in .env.local');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const files = [
      '../db_scripts/create_change_room_rpc.sql',
      '../db_scripts/create_update_booking_details_rpc.sql'
    ];

    for (const file of files) {
      const sqlPath = path.join(__dirname, file);
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log(`--- Applying SQL from ${file} ---`);
        await client.query(sql);
      } else {
        console.error(`File not found: ${file}`);
      }
    }

    console.log('Successfully applied SQL changes.');
    console.log('--- Reloading PostgREST schema cache ---');
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Schema reload notified.');
  } catch (e) {
    console.error('Error applying SQL:', e.message);
  } finally {
    await client.end();
  }
}

run();

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('Connected to DB');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '../src/lib/billing_engine.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Deploying Billing Engine V3...');
    await client.query(sql);
    console.log('Successfully deployed Billing Engine V3 functions:');
    console.log('- fn_get_system_setting');
    console.log('- fn_calculate_room_charge');
    console.log('- fn_calculate_surcharge');
    console.log('- get_booking_bill_v3');
    
  } catch (err) {
    console.error('Error deploying billing engine:', err);
  } finally {
    await client.end();
  }
}

main();

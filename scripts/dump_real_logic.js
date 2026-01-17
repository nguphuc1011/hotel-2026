const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const client = new Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

async function run() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT routine_name, routine_definition 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name IN ('calculate_booking_bill_v2', 'fn_calculate_room_charge', 'fn_calculate_surcharge')
    `);
    
    let content = '';
    res.rows.forEach(r => {
      content += `--- ${r.routine_name} ---\n${r.routine_definition}\n\n`;
    });
    
    fs.writeFileSync('real_logic.txt', content);
    console.log('Successfully wrote real_logic.txt');
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();

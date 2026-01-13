
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const sql = `
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS custom_surcharge numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS services_used jsonb DEFAULT '[]'::jsonb;
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('Connected to DB');
    
    await client.query(sql);
    console.log('Bookings table altered successfully');
    
  } catch (err) {
    console.error('Error altering table:', err);
  } finally {
    await client.end();
  }
}

main();

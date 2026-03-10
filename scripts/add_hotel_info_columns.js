
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function addHotelInfoColumns() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to DB...');

    await client.query(`
      ALTER TABLE settings 
      ADD COLUMN IF NOT EXISTS hotel_name TEXT,
      ADD COLUMN IF NOT EXISTS hotel_address TEXT,
      ADD COLUMN IF NOT EXISTS hotel_phone TEXT,
      ADD COLUMN IF NOT EXISTS hotel_email TEXT;
    `);

    console.log('Added hotel_name, hotel_address, hotel_phone, hotel_email columns to settings table.');

  } catch (err) {
    console.error('Error adding columns:', err);
  } finally {
    await client.end();
  }
}

addHotelInfoColumns();

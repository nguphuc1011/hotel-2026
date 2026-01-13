
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const sql = `
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'room_categories';
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    const res = await client.query(sql);
    console.log('RoomCategories Columns:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

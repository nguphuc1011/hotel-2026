
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const sql = `
SELECT * FROM settings;
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    const res = await client.query(sql);
    console.log('All Settings Rows:', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

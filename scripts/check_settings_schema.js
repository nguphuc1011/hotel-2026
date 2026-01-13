
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkColumns() {
  try {
    await client.connect();
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'settings';
    `);
    console.log('Settings columns:', res.rows);
    
    const rows = await client.query('SELECT * FROM settings');
    console.log('Settings rows count:', rows.rowCount);
    console.log('First row keys:', rows.rows.length > 0 ? Object.keys(rows.rows[0]) : 'No rows');
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

checkColumns();

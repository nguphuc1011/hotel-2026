
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function getColumns() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    
    const tables = ['customer_transactions', 'transactions'];
    
    for (const table of tables) {
      console.log(`\n--- Columns in ${table} ---`);
      const res = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = '${table}'
        ORDER BY ordinal_position;
      `);
      
      res.rows.forEach(row => {
        console.log(`- ${row.column_name} (${row.data_type}, ${row.is_nullable === 'YES' ? 'null' : 'not null'})`);
      });
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

getColumns();

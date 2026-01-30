const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function inspect() {
  try {
    await client.connect();
    
    const res = await client.query(`
      SELECT parameter_name, data_type, parameter_mode
      FROM information_schema.parameters
      WHERE specific_name = (
        SELECT specific_name 
        FROM information_schema.routines 
        WHERE routine_name = 'cancel_booking' 
        LIMIT 1
      )
      ORDER BY ordinal_position;
    `);

    console.log('Parameters for cancel_booking:');
    console.table(res.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

inspect();

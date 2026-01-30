
const { Client } = require('pg');

const connectionString = "postgresql://postgres.udakzychndpndkevktlf:OtFg7MFJFy5qd9lu@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function run() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bookings';
    `);

    console.log('Columns in bookings table:');
    res.rows.forEach(row => {
      console.log(`${row.column_name} (${row.data_type})`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();

const { Client } = require('pg');

const connectionString = "postgresql://postgres.udakzychndpndkevktlf:OtFg7MFJFy5qd9lu@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log('Connected.');

    const shiftId = '514beecb-a4dd-4276-ad2d-bbcf5a794b04';
    
    console.log('Resetting shift report data...');
    await client.query(`
        UPDATE public.shift_reports 
        SET declared_cash = 0, system_cash = 0, notes = NULL
        WHERE shift_id = $1
    `, [shiftId]);
    
    // Also delete the test cash flow
    await client.query(`
        DELETE FROM public.cash_flow 
        WHERE description LIKE '%Test Fix Schema%'
    `);

    console.log('Reset complete.');

  } catch (err) {
    console.error('Error executing reset:', err);
  } finally {
    await client.end();
  }
}

run();

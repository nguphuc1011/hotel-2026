
const { Client } = require('pg');

const connectionString = "postgresql://postgres.udakzychndpndkevktlf:OtFg7MFJFy5qd9lu@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log('Connected.');

    // Check Constraints
    const resConstraints = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) 
      FROM pg_constraint 
      WHERE conrelid = 'public.cash_flow'::regclass
    `);
    console.log('Constraints:', JSON.stringify(resConstraints.rows, null, 2));

    // Check Triggers
    const resTriggers = await client.query(`
      SELECT tgname, tgenabled, pg_get_triggerdef(oid)
      FROM pg_trigger
      WHERE tgrelid = 'public.cash_flow'::regclass
    `);
    console.log('Triggers:', JSON.stringify(resTriggers.rows, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();

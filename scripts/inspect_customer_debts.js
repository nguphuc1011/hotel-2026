const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const hotels = await client.query('SELECT id, name, slug FROM public.hotels');
    for (const h of hotels.rows) {
      console.log(`\n================ HOTEL: ${h.name} (${h.slug}) ================`);
      const custs = await client.query(`
        SELECT id, full_name, phone, balance, created_at, updated_at
        FROM public.customers
        WHERE hotel_id = $1
      `, [h.id]);
      console.log(`Total customers: ${custs.rows.length}`);
      console.table(custs.rows);

      const nonZero = custs.rows.filter(c => Number(c.balance) !== 0);
      console.log(`Non-zero balance customers: ${nonZero.length}`);
      console.table(nonZero);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

'use strict';

// サンプルデータ投入スクリプト:  npm run seed   (上書きは npm run seed -- --force)
const { query, pool, ensureSchema } = require('./db');
const { seedSampleData } = require('./seed-data');

(async () => {
  await ensureSchema();
  const count = (await query('SELECT COUNT(*)::int AS c FROM members')).rows[0].c;
  if (count > 0 && !process.argv.includes('--force')) {
    console.log('既にデータがあります。上書きする場合は `npm run seed -- --force`');
    await pool.end();
    return;
  }
  await query('DELETE FROM records');
  await query('DELETE FROM tasks');
  await query('DELETE FROM members');
  await seedSampleData(query);
  console.log('サンプルデータを投入しました。');
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Rebuilds var/freight.db from the CSVs without starting the API.
import { loadDatabase } from './db.ts';
import { DATA_DIR, DB_PATH } from './paths.ts';

const { db, counts } = loadDatabase(DATA_DIR, DB_PATH);
db.close();
console.log(`Wrote ${DB_PATH}`);
for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(18)} ${n}`);

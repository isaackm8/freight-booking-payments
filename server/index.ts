// Starts the API. The database is rebuilt from the CSVs in data/ on every start.
import { loadDatabase } from './db.ts';
import { createApp } from './app.ts';
import { DATA_DIR, DB_PATH, REVIEWS_FILE } from './paths.ts';
import { ReviewStore } from './reviews.ts';

// API_PORT, not PORT: PORT belongs to the web dev server (see vite.config.ts).
const PORT = Number(process.env.API_PORT ?? 3001);

const { db, counts } = loadDatabase(DATA_DIR, DB_PATH);
console.log('Loaded sample data:', Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(', '));

createApp(db, new ReviewStore(db, REVIEWS_FILE)).listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

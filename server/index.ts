// Starts the API. The database is rebuilt from the CSVs in data/ on every start.
//
// Development (`npm run dev`): the API runs on API_PORT and Vite serves the pages, proxying /api here.
// Production (`npm start`, e.g. on Render): one server on PORT serves both the API and the built
// pages from dist/ (run `npm run build` first).
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadDatabase } from './db.ts';
import { createApp } from './app.ts';
import { DATA_DIR, DB_PATH, REVIEWS_FILE, WEB_DIST } from './paths.ts';
import { ReviewStore } from './reviews.ts';

const production = process.argv.includes('--production');

// In development, API_PORT, not PORT: PORT belongs to the web dev server (see vite.config.ts).
const PORT = Number((production ? process.env.PORT : process.env.API_PORT) ?? 3001);

const { db, counts } = loadDatabase(DATA_DIR, DB_PATH);
console.log('Loaded sample data:', Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(', '));

const app = createApp(db, new ReviewStore(db, REVIEWS_FILE));

if (production) {
  if (!existsSync(join(WEB_DIST, 'index.html'))) throw new Error(`No built pages in ${WEB_DIST}: run npm run build first`);
  app.use(express.static(WEB_DIST));
  // The pages handle their own routes (/cash-flow-hub, /shipments/SHP-10001, ...), so any other
  // page address gets index.html; unknown /api addresses still get a 404.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(join(WEB_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`${production ? 'CashBridge' : 'API'} listening on http://localhost:${PORT}`);
});

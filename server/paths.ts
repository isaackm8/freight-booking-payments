import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

export const DATA_DIR = join(root, 'data');
// DB_PATH can be overridden, e.g. to run a second copy of the server alongside the dev server.
export const DB_PATH = process.env.DB_PATH ?? join(root, 'var', 'freight.db');
// The built web pages (npm run build), served by the API in production.
export const WEB_DIST = join(root, 'dist');
// Forwarder reviews of held payments; kept outside the database, which is rebuilt on every start.
export const REVIEWS_FILE = join(root, 'var', 'reviews.json');

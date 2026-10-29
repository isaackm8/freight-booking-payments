import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

export const DATA_DIR = join(root, 'data');
export const DB_PATH = join(root, 'var', 'freight.db');
// Forwarder reviews of held payments; kept outside the database, which is rebuilt on every start.
export const REVIEWS_FILE = join(root, 'var', 'reviews.json');

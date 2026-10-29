import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

export const DATA_DIR = join(root, 'data');
export const DB_PATH = join(root, 'var', 'freight.db');

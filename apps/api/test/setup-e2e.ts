import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// e2e always runs against the `insurance_test` database (DESIGN.md §10), never the dev DB
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

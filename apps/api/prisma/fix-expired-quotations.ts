import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const db = new PrismaClient();

async function main() {
  const future = new Date('2026-12-31');
  const updated = await db.quotation.updateMany({
    where: { status: 'RECEIVED', validUntil: { lt: new Date() } },
    data: { validUntil: future },
  });
  console.log(`Updated ${updated.count} expired RECEIVED quotations → valid_until=2026-12-31`);
  await db.$disconnect();
}
main().catch(console.error);

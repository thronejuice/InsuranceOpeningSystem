/**
 * Demo data for every V2 status, produced by driving the real API in-process (guards, validation, workflow
 * state machine, audit, notifications) — nothing is inserted behind the application's back except the few
 * deliberate "time travel" updates a demo needs (back-dated due dates / expiry), which are marked in the code.
 *
 *   npm run db:reset && npm run db:seed:mock
 *
 * Safe to re-run: it stops when the demo customers already exist.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { SeedError } from './client.js';
import { scenarios } from './scenarios.js';
import { buildWorld } from './world.js';

const PASSWORD = process.env.SEED_USER_PASSWORD ?? 'Password@123';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api');
  await app.init();

  const failures: string[] = [];
  try {
    const world = await buildWorld(app, PASSWORD);
    if ((await world.prisma.customer.count({ where: { OR: [{ firstName: { startsWith: 'Demo' } }, { companyName: { startsWith: 'Demo' } }] } })) > 0) {
      console.log('Demo data already exists — run `npm run db:reset` first for a clean start.');
      return;
    }

    for (const scenario of scenarios) {
      const started = Date.now();
      try {
        const note = await scenario.run(world);
        console.log(`  ✓ ${scenario.name}${note ? ` — ${note}` : ''} (${Date.now() - started} ms)`);
      } catch (error) {
        const detail = error instanceof SeedError ? error.message : error instanceof Error ? error.stack ?? error.message : String(error);
        failures.push(`${scenario.name}: ${detail}`);
        console.error(`  ✗ ${scenario.name}\n    ${detail}`);
      }
    }
  } finally {
    await app.close();
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} scenario(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('\nMock data created.');
  }
}

await main();

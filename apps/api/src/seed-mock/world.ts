import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Actor } from './client.js';

export const DAY = 86_400_000;
export const isoDate = (offsetDays = 0, from: Date = new Date()): string => new Date(from.getTime() + offsetDays * DAY).toISOString().slice(0, 10);

export interface Master {
  types: Record<string, string>;
  products: Record<string, string>;
  companies: { id: string; code: string; name: string }[];
  terms: Record<string, string>;
}

/** Everything a scenario needs: signed-in users, master ids, and database access for time travel. */
export interface World {
  app: INestApplication;
  prisma: PrismaService;
  admin: Actor;
  manager: Actor;
  supervisor: Actor;
  agent: Actor;
  agent01: Actor;
  staff: Actor;
  finance: Actor;
  viewer: Actor;
  master: Master;
  customers: string[];
}

export async function buildWorld(app: INestApplication, password: string): Promise<World> {
  const prisma = app.get(PrismaService);
  const sign = (username: string) => new Actor(app, username, password).login();
  const [admin, manager, supervisor, agent, agent01, staff, finance, viewer] = await Promise.all(
    ['admin', 'manager', 'supervisor', 'agent', 'agent01', 'staff', 'finance', 'viewer'].map(sign),
  );

  const [types, products, companies, terms] = await Promise.all([
    prisma.insuranceType.findMany(),
    prisma.insuranceProduct.findMany(),
    prisma.insuranceCompany.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, orderBy: { code: 'asc' } }),
    prisma.paymentTerm.findMany(),
  ]);
  return {
    app,
    prisma,
    admin,
    manager,
    supervisor,
    agent,
    agent01,
    staff,
    finance,
    viewer,
    master: {
      types: Object.fromEntries(types.map((t) => [t.code, t.id])),
      products: Object.fromEntries(products.map((p) => [p.code, p.id])),
      companies: companies.map((c) => ({ id: c.id, code: c.code, name: c.name })),
      terms: Object.fromEntries(terms.map((t) => [t.code, t.id])),
    },
    customers: [],
  };
}

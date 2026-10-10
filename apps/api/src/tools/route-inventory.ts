/**
 * Lists every HTTP route with the permissions it requires — the input for the Day 46 permission/data-scope review.
 *   npm run routes -w apps/api            (prints a markdown table)
 */
import 'reflect-metadata';
import { NestFactory, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../common/auth/auth.decorators.js';

export interface RouteInfo {
  controller: string;
  handler: string;
  method: string;
  path: string;
  public: boolean;
  permissions: string[] | undefined;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

export function collectRoutes(discovery: DiscoveryService, scanner: MetadataScanner, reflector: Reflector): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const proto = Object.getPrototypeOf(instance as object) as object;
    const base = String(Reflect.getMetadata('path', metatype) ?? '');
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = (proto as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      const path = Reflect.getMetadata('path', handler) as string | undefined;
      if (path === undefined) continue;
      const method = METHODS[Reflect.getMetadata('method', handler) as number] ?? '?';
      routes.push({
        controller: metatype.name,
        handler: name,
        method,
        path: `/api/${[base, path].filter((p) => p && p !== '/').join('/')}`.replace(/\/+/g, '/'),
        public: reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype]) === true,
        permissions: reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [handler, metatype]),
      });
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

if (process.argv[1]?.endsWith('route-inventory.js')) {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const routes = collectRoutes(app.get(DiscoveryService), app.get(MetadataScanner), app.get(Reflector));
  console.log('| Method | Path | Access | Handler |\n|---|---|---|---|');
  for (const r of routes) {
    const access = r.public ? '**public**' : r.permissions?.length ? r.permissions.map((p) => `\`${p}\``).join(', ') : r.permissions ? 'any signed-in user' : '**MISSING**';
    console.log(`| ${r.method} | \`${r.path}\` | ${access} | ${r.controller}.${r.handler} |`);
  }
  await app.close();
}

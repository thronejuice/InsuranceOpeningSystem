/**
 * Verifies the invariant from CLAUDE.md:
 *   "ทุก route ต้องมี @RequirePermissions(...) หรือ @Public()"
 *
 * Scans every registered controller handler and fails if any are missing both decorators.
 * This catches programming errors (missing annotation) before they reach production.
 */
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../src/common/auth/auth.decorators.js';

describe('Security: route permission coverage', () => {
  it('every HTTP route handler has @RequirePermissions or @Public', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();

    afterAll(() => module.close());

    const discovery = module.get(DiscoveryService);
    const scanner = module.get(MetadataScanner);
    const reflector = module.get(Reflector);

    const unprotected: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;

      // Skip internal NestJS controllers (e.g. HealthController exposes @Public already)
      const proto = Object.getPrototypeOf(instance as object) as object;

      for (const methodName of scanner.getAllMethodNames(proto)) {
        const handler = (proto as Record<string, unknown>)[methodName];
        if (typeof handler !== 'function') continue;

        // Only HTTP route handlers (@Get/@Post/…) carry Nest's `path` metadata; skip private helpers
        if (Reflect.getMetadata('path', handler) === undefined) continue;

        // Check both handler-level and controller-level decorators (class overrides handler)
        const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype]);
        const perms = reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [handler, metatype]);

        if (!isPublic && perms === undefined) {
          unprotected.push(`${metatype.name}.${methodName}`);
        }
      }
    }

    if (unprotected.length > 0) {
      throw new Error(
        `The following route handlers are missing @RequirePermissions or @Public:\n` +
          unprotected.map((s) => `  - ${s}`).join('\n'),
      );
    }

    expect(unprotected).toEqual([]);
  });
});

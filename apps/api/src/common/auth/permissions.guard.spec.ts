import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { BusinessException } from '../errors/business.exception.js';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from './auth.decorators.js';
import { PermissionsGuard } from './permissions.guard.js';

function contextFor(meta: Record<string, unknown>, permissions?: string[]): ExecutionContext {
  const handler = function handler() {};
  for (const [key, value] of Object.entries(meta)) Reflect.defineMetadata(key, value, handler);
  class Probe {}
  return {
    getHandler: () => handler,
    getClass: () => Probe,
    switchToHttp: () => ({ getRequest: () => ({ user: permissions && { permissions } }) }),
  } as unknown as ExecutionContext;
}

function denied(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    return error instanceof BusinessException && error.getStatus() === 403 && error.code === 'FORBIDDEN';
  }
  return false;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('lets @Public routes through without a user', () => {
    expect(guard.canActivate(contextFor({ [IS_PUBLIC_KEY]: true }))).toBe(true);
  });

  it('allows when the user holds every required permission', () => {
    const ctx = contextFor({ [PERMISSIONS_KEY]: ['job.view', 'job.create'] }, ['job.create', 'job.view', 'x']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when one required permission is missing', () => {
    const ctx = contextFor({ [PERMISSIONS_KEY]: ['job.view', 'job.create'] }, ['job.view']);
    expect(denied(() => guard.canActivate(ctx))).toBe(true);
  });

  it('allows any signed-in user for @RequirePermissions() with no codes', () => {
    expect(guard.canActivate(contextFor({ [PERMISSIONS_KEY]: [] }, []))).toBe(true);
  });

  it('fails closed when a route declares neither @Public nor @RequirePermissions', () => {
    expect(denied(() => guard.canActivate(contextFor({}, ['job.view'])))).toBe(true);
  });
});

import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';

/** Skips JwtAuthGuard and PermissionsGuard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Every listed permission is required. Called with no arguments it means "any signed-in user",
 * which keeps the rule "every route declares @RequirePermissions or @Public" explicit (CLAUDE.md).
 */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);

import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { BusinessException } from '../errors/business.exception.js';
import type { AuthUser } from './auth-user.js';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from './auth.decorators.js';

/**
 * Runs after JwtAuthGuard. Fails closed: a non-public route without @RequirePermissions
 * is a programming error, so it is denied instead of silently open to every signed-in user.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, targets);
    if (!required) {
      this.logger.error(`${context.getClass().name}.${context.getHandler().name} has neither @Public nor @RequirePermissions`);
      throw forbidden();
    }

    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    const granted = new Set(user?.permissions ?? []);
    if (!required.every((code) => granted.has(code))) throw forbidden();
    return true;
  }
}

function forbidden() {
  return new BusinessException('FORBIDDEN', 'You do not have permission to perform this action', 403);
}

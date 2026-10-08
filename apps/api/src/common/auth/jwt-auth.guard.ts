import { type CanActivate, type ExecutionContext, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { BusinessException } from '../errors/business.exception.js';
import type { AppClsStore } from '../cls/app-cls-store.js';
import type { AccessTokenPayload, AuthUser } from './auth-user.js';
import { IS_PUBLIC_KEY } from './auth.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveTeamUserIds } from '../access/domain/data-scope.js';

/** Global guard: every route needs a valid Bearer access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly cls: ClsService<AppClsStore>,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = bearerToken(req);
    if (!token) throw unauthenticated();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw unauthenticated();
    }

    req.user = {
      id: payload.sub,
      username: payload.username,
      roles: payload.roles,
      permissions: payload.permissions,
      branchId: payload.branchId,
      dataScope: payload.dataScope,
    };
    this.cls.set('userId', payload.sub);
    this.cls.set('roles', payload.roles);
    this.cls.set('permissions', payload.permissions);
    this.cls.set('branchId', payload.branchId);
    if (payload.dataScope) {
      this.cls.set('dataScope', payload.dataScope);
    }

    if (
      (payload.dataScope === 'TEAM' || payload.roles?.some((r) => r === 'MANAGER' || r === 'SUPERVISOR')) &&
      this.prisma
    ) {
      try {
        const allUsers = await this.prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, managerId: true },
        });
        const teamUserIds = resolveTeamUserIds(payload.sub, allUsers);
        this.cls.set('teamUserIds', teamUserIds);
      } catch {
        this.cls.set('teamUserIds', [payload.sub]);
      }
    }

    return true;
  }
}

function bearerToken(req: Request): string | undefined {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : undefined;
}

function unauthenticated() {
  return new BusinessException('UNAUTHENTICATED', 'Authentication required', 401);
}

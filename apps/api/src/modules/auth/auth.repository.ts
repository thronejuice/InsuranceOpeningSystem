import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

const userWithPermissions = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} as const;

@Injectable()
export class AuthRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() {
    return this.txHost.tx;
  }

  findUserByUsername(username: string) {
    return this.db.user.findFirst({ where: { username, deletedAt: null }, include: userWithPermissions });
  }

  findUserById(id: string) {
    return this.db.user.findFirst({ where: { id, deletedAt: null }, include: userWithPermissions });
  }

  touchLastLogin(userId: string, at: Date) {
    return this.db.user.update({ where: { id: userId }, data: { lastLoginAt: at } });
  }

  createRefreshToken(data: { userId: string; tokenHash: string; expiresAt: Date; ipAddress?: string; userAgent?: string }) {
    return this.db.refreshToken.create({ data });
  }

  findRefreshToken(tokenHash: string) {
    return this.db.refreshToken.findUnique({ where: { tokenHash } });
  }

  /** Conditional update so two concurrent refreshes with the same token cannot both win. */
  async revokeRefreshToken(id: string, at: Date, replacedById?: string): Promise<boolean> {
    const { count } = await this.db.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: at, replacedById },
    });
    return count === 1;
  }

  revokeAllForUser(userId: string, at: Date) {
    return this.db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: at } });
  }
}

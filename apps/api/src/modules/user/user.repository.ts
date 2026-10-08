import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

const userInclude = {
  roles: { include: { role: true } },
  branch: true,
  manager: { select: { id: true, fullName: true, username: true } },
} as const;

@Injectable()
export class UserRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() {
    return this.txHost.tx;
  }

  findAll() {
    return this.db.user.findMany({
      where: { deletedAt: null },
      include: userInclude,
      orderBy: { username: 'asc' },
    });
  }

  findById(id: string) {
    return this.db.user.findFirst({ where: { id, deletedAt: null }, include: userInclude });
  }

  findByUsername(username: string) {
    return this.db.user.findFirst({ where: { username, deletedAt: null } });
  }

  findByEmail(email: string) {
    return this.db.user.findFirst({ where: { email, deletedAt: null } });
  }

  create(data: Prisma.UserCreateInput) {
    return this.db.user.create({ data, include: userInclude });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.db.user.update({ where: { id }, data, include: userInclude });
  }

  deleteRoles(userId: string) {
    return this.db.userRole.deleteMany({ where: { userId } });
  }

  addRoles(userId: string, roleIds: string[]) {
    return this.db.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId })),
      skipDuplicates: true,
    });
  }

  findRolesByIds(ids: string[]) {
    return this.db.role.findMany({ where: { id: { in: ids } } });
  }

  findAllRoles() {
    return this.db.role.findMany({ orderBy: { code: 'asc' } });
  }

  softDelete(id: string) {
    return this.db.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  }
}

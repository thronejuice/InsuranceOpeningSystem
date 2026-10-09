import { Injectable, Optional } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { Transactional } from '@nestjs-cls/transactional';
import { hash } from 'argon2';
import type { Prisma } from '../../generated/prisma/client.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { SystemSettingService } from '../system-setting/system-setting.service.js';
import { UserRepository } from './user.repository.js';
import type { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto.js';

@Injectable()
export class UserService {
  constructor(
    private readonly repo: UserRepository,
    @Optional() private readonly settings?: SystemSettingService,
  ) {}

  /** An agent's share and the manager override are both cut from the same gross commission. */
  private async assertShareFits(agentSharePct: string | null | undefined) {
    if (!agentSharePct || !this.settings) return;
    const { overridePct } = await this.settings.getCommissionSettings();
    if (new Decimal(agentSharePct).plus(overridePct).greaterThan(100)) {
      throw new BusinessException(
        'AGENT_SHARE_EXCEEDS_100',
        `Agent share + the ${overridePct}% manager override cannot exceed 100%`,
        422,
      );
    }
  }

  async listRoles() {
    return this.repo.findAllRoles();
  }

  async listUsers() {
    const users = await this.repo.findAll();
    return users.map(toUserResponse);
  }

  async getUser(id: string) {
    const user = await this.repo.findById(id);
    if (!user) throw new BusinessException('USER_NOT_FOUND', 'User not found', 404);
    return toUserResponse(user);
  }

  @Transactional()
  async createUser(dto: CreateUserDto) {
    if (await this.repo.findByUsername(dto.username)) {
      throw new BusinessException('USERNAME_TAKEN', 'Username already exists', 409);
    }
    if (await this.repo.findByEmail(dto.email)) {
      throw new BusinessException('EMAIL_TAKEN', 'Email already in use', 409);
    }
    await this.assertShareFits(dto.agentSharePct);
    const passwordHash = await hash(dto.password);
    const user = await this.repo.create({
      username: dto.username,
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
      branch: dto.branchId ? { connect: { id: dto.branchId } } : undefined,
      manager: dto.managerId ? { connect: { id: dto.managerId } } : undefined,
      agentSharePct: dto.agentSharePct,
    });
    if (dto.roleIds?.length) {
      await this.assignRoles(user.id, dto.roleIds);
    }
    const fresh = await this.repo.findById(user.id);
    return toUserResponse(fresh!);
  }

  @Transactional()
  async updateUser(id: string, dto: UpdateUserDto) {
    await this.getUser(id);
    if (dto.email) {
      const existing = await this.repo.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new BusinessException('EMAIL_TAKEN', 'Email already in use', 409);
      }
    }
    if (dto.managerId && dto.managerId === id) {
      throw new BusinessException('INVALID_MANAGER', 'User cannot be their own manager', 422);
    }
    await this.assertShareFits(dto.agentSharePct);
    const { roleIds, branchId, managerId, ...data } = dto;
    const updateData: Prisma.UserUpdateInput = {
      ...data,
      ...(branchId !== undefined && { branch: branchId ? { connect: { id: branchId } } : { disconnect: true } }),
      ...(managerId !== undefined && { manager: managerId ? { connect: { id: managerId } } : { disconnect: true } }),
    };
    await this.repo.update(id, updateData);
    if (roleIds !== undefined) {
      await this.assignRoles(id, roleIds);
    }
    const fresh = await this.repo.findById(id);
    return toUserResponse(fresh!);
  }

  @Transactional()
  async resetPassword(id: string, dto: ResetPasswordDto) {
    await this.getUser(id);
    const passwordHash = await hash(dto.password);
    await this.repo.update(id, { passwordHash });
  }

  @Transactional()
  async deactivateUser(id: string) {
    await this.getUser(id);
    await this.repo.softDelete(id);
  }

  private async assignRoles(userId: string, roleIds: string[]) {
    const roles = await this.repo.findRolesByIds(roleIds);
    if (roles.length !== roleIds.length) {
      throw new BusinessException('ROLE_NOT_FOUND', 'One or more roles not found', 422);
    }
    await this.repo.deleteRoles(userId);
    await this.repo.addRoles(userId, roleIds);
  }
}

type UserWithRoles = Awaited<ReturnType<UserRepository['findById']>>;

function toUserResponse(u: NonNullable<UserWithRoles>) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    isActive: u.isActive,
    branchId: u.branchId ?? null,
    branch: u.branch ? { id: u.branch.id, code: u.branch.code, name: u.branch.name } : null,
    managerId: u.managerId ?? null,
    agentSharePct: u.agentSharePct ? u.agentSharePct.toFixed(2) : null,
    manager: u.manager ? { id: u.manager.id, fullName: u.manager.fullName, username: u.manager.username } : null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    roles: u.roles.map((ur) => ({ id: ur.role.id, code: ur.role.code, name: ur.role.name })),
  };
}

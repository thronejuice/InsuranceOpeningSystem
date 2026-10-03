import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { hash } from 'argon2';
import { BusinessException } from '../../common/errors/business.exception.js';
import { UserRepository } from './user.repository.js';
import type { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto.js';

@Injectable()
export class UserService {
  constructor(private readonly repo: UserRepository) {}

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
    const passwordHash = await hash(dto.password);
    const user = await this.repo.create({
      username: dto.username,
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
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
    const { roleIds, ...data } = dto;
    await this.repo.update(id, data);
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
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    roles: u.roles.map((ur) => ({ id: ur.role.id, code: ur.role.code, name: ur.role.name })),
  };
}

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Transactional } from '@nestjs-cls/transactional';
import { hash, verify } from 'argon2';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AccessTokenPayload } from '../../common/auth/auth-user.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { AuthRepository } from './auth.repository.js';
import {
  flattenPermissions,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from './domain/refresh-token.js';
import type { MeResponse, TokenResponse } from './dto/auth.response.js';

type UserWithPermissions = NonNullable<Awaited<ReturnType<AuthRepository['findUserById']>>>;

export interface IssuedTokens {
  body: TokenResponse;
  refreshToken: string;
  refreshTokenId: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService implements OnModuleInit {
  /** Verified against when the username does not exist, so response time does not reveal valid usernames. */
  private dummyHash: string;

  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async onModuleInit() {
    this.dummyHash = await hash('dummy-password-for-timing');
  }

  async login(username: string, password: string): Promise<IssuedTokens> {
    const user = await this.repo.findUserByUsername(username);
    const passwordOk = await verify(user?.passwordHash ?? this.dummyHash, password);

    if (!user || !passwordOk) {
      // Outside any transaction so the failure record is kept even though the request fails
      await this.audit.log({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user?.id,
        userId: user?.id,
        newValue: { username },
        description: user ? 'Invalid password' : 'Unknown username',
      });
      throw new BusinessException('INVALID_CREDENTIALS', 'Invalid username or password', 401);
    }
    if (!user.isActive) {
      await this.audit.log({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        newValue: { username },
        description: 'Account disabled',
      });
      throw new BusinessException('ACCOUNT_DISABLED', 'This account has been disabled', 401);
    }

    return this.completeLogin(user);
  }

  @Transactional()
  private async completeLogin(user: UserWithPermissions): Promise<IssuedTokens> {
    const now = new Date();
    await this.repo.touchLastLogin(user.id, now);
    const tokens = await this.issueTokens(user, now);
    await this.audit.log({ action: 'LOGIN', entityType: 'User', entityId: user.id, userId: user.id });
    return tokens;
  }

  async refresh(rawToken: string | undefined): Promise<IssuedTokens> {
    if (!rawToken) throw invalidRefreshToken();
    const record = await this.repo.findRefreshToken(hashRefreshToken(rawToken));
    if (!record || record.expiresAt <= new Date()) throw invalidRefreshToken();

    if (record.revokedAt) {
      // A rotated token came back: assume it was stolen and end every session of this user
      await this.revokeAllAfterReuse(record.userId);
      throw invalidRefreshToken();
    }

    return this.rotate(record.id, record.userId);
  }

  @Transactional()
  private async rotate(oldTokenId: string, userId: string): Promise<IssuedTokens> {
    const user = await this.repo.findUserById(userId);
    if (!user || !user.isActive) throw invalidRefreshToken();

    const now = new Date();
    const tokens = await this.issueTokens(user, now);
    // Losing a concurrent race throws, which rolls back the token issued above
    const revoked = await this.repo.revokeRefreshToken(oldTokenId, now, tokens.refreshTokenId);
    if (!revoked) throw invalidRefreshToken();
    return tokens;
  }

  @Transactional()
  private async revokeAllAfterReuse(userId: string): Promise<void> {
    await this.repo.revokeAllForUser(userId, new Date());
    await this.audit.log({
      action: 'REFRESH_TOKEN_REUSED',
      entityType: 'User',
      entityId: userId,
      userId,
      description: 'Revoked refresh token was presented; all sessions revoked',
    });
  }

  /** Idempotent: an unknown or already-revoked token still results in a cleared cookie. */
  @Transactional()
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const record = await this.repo.findRefreshToken(hashRefreshToken(rawToken));
    if (!record || record.revokedAt) return;

    await this.repo.revokeRefreshToken(record.id, new Date());
    await this.audit.log({ action: 'LOGOUT', entityType: 'User', entityId: record.userId, userId: record.userId });
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.repo.findUserById(userId);
    if (!user || !user.isActive) throw new BusinessException('UNAUTHENTICATED', 'Authentication required', 401);
    return toMe(user);
  }

  private async issueTokens(user: UserWithPermissions, now: Date): Promise<IssuedTokens> {
    const me = toMe(user);
    const payload: AccessTokenPayload = {
      sub: me.id,
      username: me.username,
      roles: me.roles,
      permissions: me.permissions,
    };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = refreshTokenExpiry(now, this.config.getOrThrow<number>('JWT_REFRESH_TTL_DAYS'));
    const record = await this.repo.createRefreshToken({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiresAt,
      ipAddress: this.cls.get('ip'),
      userAgent: this.cls.get('userAgent'),
    });

    return {
      body: { accessToken, expiresIn: this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'), user: me },
      refreshToken,
      refreshTokenId: record.id,
      refreshExpiresAt,
    };
  }
}

function toMe(user: UserWithPermissions): MeResponse {
  const roles = user.roles.map((ur) => ur.role);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    roles: roles.map((role) => role.code).sort(),
    permissions: flattenPermissions(roles),
  };
}

function invalidRefreshToken() {
  return new BusinessException('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired', 401);
}

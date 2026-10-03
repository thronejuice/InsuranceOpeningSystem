import { createHash, randomBytes } from 'node:crypto';

/** Opaque refresh token (256-bit). Only its hash is stored (DESIGN §5.1). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}

export function flattenPermissions(roles: { permissions: { permission: { code: string } }[] }[]): string[] {
  return [...new Set(roles.flatMap((role) => role.permissions.map((rp) => rp.permission.code)))].sort();
}

import type { ClsStore } from 'nestjs-cls';

/** Request-scoped values read by AuditService; `userId`/`permissions` set by JwtAuthGuard, `ip`/`userAgent` by CLS middleware. */
export interface AppClsStore extends ClsStore {
  userId?: string;
  roles?: string[];
  permissions?: string[];
  ip?: string;
  userAgent?: string;
}

/** Identity attached to `req.user` by JwtAuthGuard; built from the access token only (no DB hit per request). */
export interface AuthUser {
  id: string;
  username: string;
  roles: string[];
  permissions: string[];
  branchId?: string | null;
  dataScope?: string;
}

/** Access token claims (DESIGN §8: permissions are embedded, so role changes apply on the next refresh). */
export interface AccessTokenPayload {
  sub: string;
  username: string;
  roles: string[];
  permissions: string[];
  branchId?: string | null;
  dataScope?: string;
}

import { PERMISSIONS, ROLE_DATA_SCOPE, ROLE_PERMISSIONS, ROLES, type RoleCode } from './seed-data.js';

/**
 * Markdown permission matrix generated from the seed data — the single source of truth for who may do what.
 * `docs/SYSTEM_FLOW_V2.md` embeds this output and a unit test fails when the two drift apart.
 *   npm run docs:matrix -w apps/api
 */
export function renderPermissionMatrix(): string {
  const roles = Object.keys(ROLES) as RoleCode[];
  const rows: string[] = [];
  rows.push(`| Permission | ${roles.join(' | ')} |`);
  rows.push(`|---|${roles.map(() => ':-:').join('|')}|`);
  rows.push(`| *data scope* | ${roles.map((r) => `\`${ROLE_DATA_SCOPE[r]}\``).join(' | ')} |`);
  for (const code of Object.keys(PERMISSIONS).sort()) {
    const cells = roles.map((r) => (ROLE_PERMISSIONS[r].includes(code as never) ? '✓' : ''));
    rows.push(`| \`${code}\` | ${cells.join(' | ')} |`);
  }
  return rows.join('\n');
}

if (process.argv[1]?.endsWith('permission-matrix.ts')) {
  console.log(renderPermissionMatrix());
}

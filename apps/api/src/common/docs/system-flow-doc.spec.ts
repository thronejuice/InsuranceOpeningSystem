import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderPermissionMatrix } from '../../../prisma/permission-matrix.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = readFileSync(resolve(here, '../../../../../docs/SYSTEM_FLOW_V2.md'), 'utf8');

/** The permission matrix in the docs is generated from the seed; this fails when someone edits one and not the other. */
describe('docs/SYSTEM_FLOW_V2.md', () => {
  it('embeds the permission matrix generated from seed-data.ts', () => {
    const match = doc.match(/<!-- PERMISSION-MATRIX:START -->\n([\s\S]*?)\n<!-- PERMISSION-MATRIX:END -->/);
    expect(match, 'matrix markers missing').not.toBeNull();
    expect(match![1].trim()).toBe(renderPermissionMatrix().trim());
  });
});

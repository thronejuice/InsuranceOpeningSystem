import { describe, expect, it } from 'vitest';
import { SETTING_DEFINITIONS, SETTING_KEYS, findDefinition, validatePercent } from './settings.js';

describe('validatePercent', () => {
  it.each(['0', '3', '12.5', '12.50', '100', '100.00', '0.01'])('accepts %s', (v) => {
    expect(validatePercent(v)).toBeNull();
  });

  it.each(['', '-1', '101', '100.01', '1.234', 'abc', '3%', ' 3', '1e2'])('rejects %j', (v) => {
    expect(validatePercent(v)).not.toBeNull();
  });
});

describe('SETTING_DEFINITIONS', () => {
  it('carries the agreed defaults: WHT 3%, agent share 50%, override 0%', () => {
    const d = Object.fromEntries(SETTING_DEFINITIONS.map((s) => [s.key, s.defaultValue]));
    expect(d).toEqual({
      [SETTING_KEYS.WHT_RATE]: '3',
      [SETTING_KEYS.DEFAULT_AGENT_SHARE]: '50',
      [SETTING_KEYS.OVERRIDE_RATE]: '0',
    });
    for (const def of SETTING_DEFINITIONS) expect(validatePercent(def.defaultValue)).toBeNull();
  });

  it('looks definitions up by key and returns undefined for unknown keys', () => {
    expect(findDefinition('commission.wht_rate')?.defaultValue).toBe('3');
    expect(findDefinition('nope')).toBeUndefined();
  });
});

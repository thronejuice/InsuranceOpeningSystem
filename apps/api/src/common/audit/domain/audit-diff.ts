export interface DiffResult {
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
}

export interface DiffOptions {
  ignoredKeys?: string[];
}

const DEFAULT_IGNORED_KEYS = new Set(['updatedAt', 'createdAt', 'version']);

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function normalizeValue(val: unknown): unknown {
  if (val === undefined || val === null) {
    return null;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  // Decimal or Decimal.js or similar
  if (
    typeof val === 'object' &&
    val !== null &&
    'toFixed' in val &&
    typeof (val as { toFixed?: unknown }).toFixed === 'function' &&
    'toString' in val &&
    typeof (val as { toString?: unknown }).toString === 'function'
  ) {
    return (val as { toString(): string }).toString();
  }
  return val;
}

function areValuesEqual(a: unknown, b: unknown): boolean {
  const normA = normalizeValue(a);
  const normB = normalizeValue(b);

  if (normA === normB) {
    return true;
  }

  if (normA === null || normB === null || normA === undefined || normB === undefined) {
    return normA === normB;
  }

  if (typeof normA === 'object' && typeof normB === 'object') {
    return JSON.stringify(normA) === JSON.stringify(normB);
  }

  return false;
}

/**
 * Pure helper returning only changed fields between before and after objects (spec §25).
 * Returns null if there are no detectable changes.
 */
export function diffChanges(
  before: unknown,
  after: unknown,
  options?: DiffOptions,
): DiffResult | null {
  const ignored = options?.ignoredKeys
    ? new Set(options.ignoredKeys)
    : DEFAULT_IGNORED_KEYS;

  const isBeforeObj = isObject(before);
  const isAfterObj = isObject(after);

  if (!isBeforeObj && !isAfterObj) {
    if (areValuesEqual(before, after)) {
      return null;
    }
    return {
      oldValue: (before !== undefined ? { value: before } : {}) as Record<string, unknown>,
      newValue: (after !== undefined ? { value: after } : {}) as Record<string, unknown>,
    };
  }

  const beforeRecord = isBeforeObj ? (before as Record<string, unknown>) : {};
  const afterRecord = isAfterObj ? (after as Record<string, unknown>) : {};

  const allKeys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  let hasChanges = false;

  for (const key of allKeys) {
    if (ignored.has(key)) {
      continue;
    }

    const valBefore = beforeRecord[key];
    const valAfter = afterRecord[key];

    if (!areValuesEqual(valBefore, valAfter)) {
      hasChanges = true;
      if (valBefore !== undefined) {
        oldValue[key] = normalizeValue(valBefore);
      }
      if (valAfter !== undefined) {
        newValue[key] = normalizeValue(valAfter);
      }
    }
  }

  if (!hasChanges) {
    return null;
  }

  return { oldValue, newValue };
}


export const REDACTED = '[REDACTED]';

// DESIGN §8: logs must never contain secrets or national IDs
const SENSITIVE_KEY = /password|token|secret|citizenid|taxid/i;

/** Returns a JSON-safe deep copy with sensitive keys replaced. Decimal/Date become strings via toJSON. */
export function redact(value: unknown): unknown {
  if (value === undefined) return undefined;
  return scrub(JSON.parse(JSON.stringify(value)));
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, SENSITIVE_KEY.test(key) ? REDACTED : scrub(v)]),
    );
  }
  return value;
}

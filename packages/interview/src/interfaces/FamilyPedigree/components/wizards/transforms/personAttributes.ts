import type { BiologicalSex, VariableValue } from '@codaco/shared-consts';

const KNOWN_PERSON_KEYS = new Set(['name', 'biologicalSex']);

export function extractCustomAttributes(
  obj: Record<string, unknown>,
): Record<string, VariableValue> | undefined {
  const attrs: Record<string, VariableValue> = {};
  let hasAttrs = false;
  for (const [key, val] of Object.entries(obj)) {
    if (!KNOWN_PERSON_KEYS.has(key) && val !== undefined) {
      attrs[key] = val as VariableValue;
      hasAttrs = true;
    }
  }
  return hasAttrs ? attrs : undefined;
}

/**
 * Validates that `v` is one of the canonical biological-sex values. Returns the
 * typed value, or `undefined` when absent or invalid. Accepts both a raw form
 * value (a bare string) and the stored categorical shape (a single-element
 * array), so it reads a captured field and a persisted attribute alike. Using
 * explicit equality checks avoids `as` casts while satisfying TypeScript.
 */
export function readBiologicalSex(v: unknown): BiologicalSex | undefined {
  const value = Array.isArray(v) ? v[0] : v;
  if (
    value === 'female' ||
    value === 'male' ||
    value === 'intersex' ||
    value === 'unknown' ||
    value === 'preferNotToSay'
  ) {
    return value;
  }
  return undefined;
}

import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import type { BiologicalSex } from '@codaco/protocol-validation';
import { type VariableValue, VariableValueSchema } from '@codaco/shared-consts';

import { writeOwnAttribute } from '../../../utils/writeOwnAttributes';

const KNOWN_PERSON_KEYS = new Set(['name', 'biologicalSex']);
type FormSubmissionFailure = Extract<FormSubmissionResult, { success: false }>;
const invalidSubmissionResult: FormSubmissionFailure = {
  success: false,
  formErrors: ['An error occurred while submitting the form.'],
};

class InvalidCustomAttributeValueError extends Error {}

export function runFamilyPedigreeTransform<T>(
  transform: () => T,
): T | FormSubmissionFailure {
  try {
    return transform();
  } catch (error) {
    if (!(error instanceof InvalidCustomAttributeValueError)) throw error;
    return invalidSubmissionResult;
  }
}

export function extractCustomAttributes(
  obj: Record<string, unknown>,
  knownKeys: ReadonlySet<string> = KNOWN_PERSON_KEYS,
): Record<string, VariableValue> | undefined {
  const attrs: Record<string, VariableValue> = {};
  let hasAttrs = false;
  for (const [key, val] of Object.entries(obj)) {
    if (knownKeys.has(key) || val === undefined) continue;

    const result = VariableValueSchema.safeParse(val);
    if (!result.success) {
      throw new InvalidCustomAttributeValueError(
        `Invalid custom attribute value for "${key}".`,
      );
    }

    writeOwnAttribute(attrs, key, result.data);
    hasAttrs = true;
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

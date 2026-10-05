import { createMessageError } from '@codaco/app-i18n/messages';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import type { BiologicalSex } from '@codaco/protocol-validation';
import { type VariableValue, VariableValueSchema } from '@codaco/shared-consts';

import { runtimeMessages } from '../../../../../i18n/runtimeMessages';
import { writeOwnAttribute } from '../../../utils/writeOwnAttributes';

/**
 * Each pedigree member's form values keep protocol-authored fields under this
 * key, apart from the interface's own controls (`name`, `biologicalSex`,
 * `is-donor`, `role`, …). Codebook variable IDs are author-chosen, so sharing
 * one namespace would let a variable alias a control and be read back as
 * pedigree structure.
 */
export const PERSON_ATTRIBUTES_KEY = 'attributes';

type FormSubmissionFailure = Extract<FormSubmissionResult, { success: false }>;
const invalidSubmissionResult: FormSubmissionFailure = {
  success: false,
  formErrors: [createMessageError(runtimeMessages.submissionFailed)],
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

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The protocol-authored field values submitted for one pedigree member. */
export function readPersonAttributeValues(
  person: Record<string, unknown>,
): Record<string, unknown> {
  const values = Object.hasOwn(person, PERSON_ATTRIBUTES_KEY)
    ? person[PERSON_ATTRIBUTES_KEY]
    : undefined;
  return isPlainRecord(values) ? values : {};
}

export function validateCustomAttributes(
  values: Record<string, unknown>,
  ignoredKeys: ReadonlySet<string> = new Set(),
): Record<string, VariableValue> | undefined {
  const attrs: Record<string, VariableValue> = {};
  let hasAttrs = false;
  for (const [key, val] of Object.entries(values)) {
    if (ignoredKeys.has(key) || val === undefined) continue;

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

export function extractCustomAttributes(
  person: Record<string, unknown>,
): Record<string, VariableValue> | undefined {
  return validateCustomAttributes(readPersonAttributeValues(person));
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

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';

const isFieldValueArrayItem = (
  value: unknown,
): value is string | number | boolean | Record<string, unknown> =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (typeof value === 'object' && value !== null && !Array.isArray(value));

const isFieldValue = (value: unknown): value is FieldValue =>
  value === undefined ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (Array.isArray(value) && value.every(isFieldValueArrayItem)) ||
  (typeof value === 'object' && value !== null && !Array.isArray(value));

/**
 * Narrows a dynamically addressed stage value without weakening the form
 * store's non-null contract. An invalid protocol or timeline value is an
 * invariant violation and must remain visible rather than being cleared.
 */
export const requireStageFieldValue = (value: unknown): FieldValue => {
  if (!isFieldValue(value)) {
    throw new TypeError('Stage field values must satisfy the form contract.');
  }

  return value;
};

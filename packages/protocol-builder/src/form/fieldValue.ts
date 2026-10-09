import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';

const isFieldValueArrayItem = (
  value: unknown,
): value is string | number | boolean | Record<string, unknown> =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (typeof value === 'object' && value !== null && !Array.isArray(value));

/**
 * Whether a value read out of a document by a dynamic path is one the form
 * store can hold, for a caller about to write it into a field.
 */
export const isFieldValue = (value: unknown): value is FieldValue =>
  value === undefined ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (Array.isArray(value) && value.every(isFieldValueArrayItem)) ||
  (typeof value === 'object' && value !== null && !Array.isArray(value));

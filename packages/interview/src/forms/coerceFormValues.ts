import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';

/**
 * Coerce raw form values to their declared codebook variable types at the
 * submit boundary. Number fields (rendered as InputField type="number") emit
 * raw strings, so the persisted network attribute would otherwise be a string
 * rather than the declared number. An empty value becomes undefined;
 * non-numeric input is left untouched (validation rejects it separately).
 */
export function coerceFormValues(
  values: Record<string, FieldValue>,
  numberFieldNames: ReadonlySet<string>,
): Record<string, FieldValue> {
  const coerced: Record<string, FieldValue> = { ...values };

  for (const name of numberFieldNames) {
    const value = coerced[name];

    if (value === undefined || value === null || value === '') {
      coerced[name] = undefined;
      continue;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized === '') {
        coerced[name] = undefined;
        continue;
      }
      const asNumber = Number(normalized);
      if (!Number.isNaN(asNumber)) {
        coerced[name] = asNumber;
      }
    }
  }

  return coerced;
}

import type { Variable } from '@codaco/protocol-validation';

/**
 * Bring a value into the domain the codebook declares for its variable, so a
 * validator comparing a form's in-progress value with values the network
 * already holds compares like with like.
 *
 * A number field is an `<input type="number">`, and the string it holds is
 * what the form store validates; the interview turns it into a real number
 * only at submit. Anything persisted for the same variable — an alter added a
 * moment ago, an attribute answered on an earlier stage — is therefore a
 * number, and strict equality calls '12' and 12 different. The reverse also
 * arises: a session saved before submit-time coercion existed, or a roster,
 * can hold the number as a string.
 *
 * Only `number` variables have this split representation, so every other
 * type passes through untouched. Blank and non-numeric strings are returned
 * as they are: `Number('')` is 0, and it is `required`'s business to reject
 * emptiness, not this helper's to invent a value for it.
 */
export default function coerceToVariableType<T>(
  value: T,
  type: Variable['type'] | undefined,
): T | number {
  if (type !== 'number' || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return value;
  const asNumber = Number(trimmed);
  return Number.isNaN(asNumber) ? value : asNumber;
}

/**
 * Is this value "unanswered" — i.e. the participant has supplied nothing?
 *
 * `undefined` is the single representation of "unanswered" in the form store,
 * but a control can also hand back the empty forms of its own value type
 * before anything meaningful has been chosen: whitespace-only text, an empty
 * multi-select array, or the `NaN` a number input produces from a partial
 * entry. All of them mean the same thing to a participant.
 *
 * `required` owns emptiness. Every OPTIONAL rule short-circuits on this
 * predicate so an unanswered field collects exactly one error (the required
 * one) rather than a second, nonsensical one about a value it does not have.
 * Sharing one predicate is what stops `required` and the optional rules from
 * drifting apart about what "empty" means.
 *
 * Deliberately NOT applied to `maxLength` or `pattern`: an empty string is a
 * present value for both (it trivially satisfies any maxLength, and `pattern`
 * prefaults to `''` so an absent value is checked against the regex).
 *
 * `false` and `0` are answers, not emptiness.
 */
export default function isUnanswered(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

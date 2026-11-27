/**
 * Is this value "unanswered" — i.e. the participant has supplied nothing?
 *
 * `undefined` is the single representation of "unanswered" in the form store,
 * but a control can also hand back the empty forms of its own value type
 * before anything meaningful has been chosen: whitespace-only text, an empty
 * multi-select array, or the `NaN` a number input produces from a partial
 * entry. All of them mean the same thing to a participant.
 *
 * The one definition of an empty answer. fresco-ui's form validation
 * (`form/validation/utils/isUnanswered` re-exports this function), what logic
 * and dynamic values read as missing (`logicInputsFor` in
 * `@codaco/network-query`), and the answers that synthetic data leaves out all
 * call it.
 *
 * In validation, `required` owns emptiness. Every OPTIONAL rule
 * short-circuits on this predicate so an unanswered field collects exactly one
 * error (the required one) rather than a second, nonsensical one about a value
 * it does not have. Deliberately NOT applied to `maxLength`: an empty string is
 * a present value for it, and trivially satisfies any maximum. `pattern` DOES
 * apply it, which is also what HTML5's `pattern` attribute does — an empty
 * field is the `required` rule's business, not the expression's.
 *
 * `false` and `0` are answers, not emptiness.
 */
export function isUnanswered(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

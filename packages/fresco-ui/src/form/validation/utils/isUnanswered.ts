/**
 * Is this value "unanswered" — i.e. the participant has supplied nothing?
 *
 * The definition lives in `@codaco/shared-consts`, so that the forms here, the
 * logic that the interview reads, and synthetic data all judge an empty answer
 * by the same function. See its documentation for which values count as empty
 * and why the optional validation rules short-circuit on it.
 */
export { isUnanswered as default } from '@codaco/shared-consts';

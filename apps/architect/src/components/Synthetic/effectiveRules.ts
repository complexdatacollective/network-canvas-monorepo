import {
  type EffectiveVariableRules,
  narrowVariableRules,
} from '@codaco/protocol-validation';

/**
 * The rules a generated value for one variable is actually held to: what the
 * codebook declares, narrowed by whatever the protocol's interfaces imply.
 *
 * `narrowVariableRules` is the schema's own intersection — the same call
 * generation's `buildVariableConstraints` makes — so no surface here can
 * disagree with the generator about the effective window.
 *
 * `binOnly` drops the DECLARED half. A variable the protocol only ever assigns
 * through a binning prompt is never rendered as a form field, so the interview
 * enforces none of its validation and generation reads it the same way: a
 * `minSelected: 2` on such a variable decides nothing, and a surface that
 * showed it would be describing work no run does.
 *
 * One home for that gate, because the codebook editor and the read-only
 * overview both answer this question about the same variables — and a screen
 * that disagreed with the editor beside it would be worse than either.
 */
export const effectiveSyntheticRules = (
  declared: EffectiveVariableRules,
  implied: EffectiveVariableRules = {},
  binOnly = false,
): EffectiveVariableRules =>
  narrowVariableRules(binOnly ? {} : declared, implied);

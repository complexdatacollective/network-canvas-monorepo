import {
  findValidationContradictions,
  type ValidationContradiction,
} from '@codaco/protocol-validation';

/**
 * The variables whose rules this run actually applies.
 *
 * Bin-assigned variables and unwritten pedigree-edge variables still receive a
 * generated value, but no participant-facing field validates that value. The
 * generation analyser has always excluded their declared rules; the delegated
 * analyser must receive the same view.
 */
function validatedVariables(
  variables: Record<string, unknown> | undefined,
  unvalidated: ReadonlySet<string>,
): Record<string, unknown> {
  if (variables === undefined) return {};

  return Object.fromEntries(
    Object.entries(variables).filter(([id]) => !unvalidated.has(id)),
  );
}

/**
 * Shared validation-rule contradictions owned by protocol-validation.
 *
 * Generation receives codebook records with NetworkComposer date controls
 * already folded in, so date-window analysis sees the effective rendering.
 * It does not have one resolved Boolean rendering for every stage occurrence,
 * however, and must keep the record-level Boolean interpretation. Passing
 * `stageEffectiveComponents: true` here would falsely pin singleton Boolean
 * options when every composer occurrence overrides the control to Toggle.
 */
export function delegatedValidationContradictions(
  variables: Record<string, unknown> | undefined,
  unvalidated: ReadonlySet<string>,
): ValidationContradiction[] {
  return findValidationContradictions(
    validatedVariables(variables, unvalidated),
  );
}

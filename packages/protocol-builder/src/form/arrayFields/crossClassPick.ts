import type { Variables } from '@codaco/protocol-validation';

/**
 * The two refusals this module answers with are the codebook's own words, so
 * they are declared once, there.
 *
 * This file and `codebook/variableValidation.ts` have always carried the same
 * two sentences — the same conflict, reported by the array field where the
 * researcher picks the attribute and by the codebook editor where they change
 * it. Left in two places as descriptors they would be two catalog entries for
 * one sentence: a translator would answer the same question twice, and the two
 * answers could drift apart with nothing to catch it. The functions stay here
 * so this module's callers are unchanged.
 */
export {
  draftValidatedElsewhereMessage,
  validatedElsewhereMessage,
} from '../../codebook/variableValidation.ts';

/** A variable's codebook display name, falling back to its id when absent. */
export const variableDisplayName = (
  variables: Readonly<Variables>,
  variableId: string,
): string => variables[variableId]?.name ?? variableId;

/**
 * The save-time exclusivity gate for one pick.
 *
 * `hasConflictingUse` reports whether the OPPOSITE writer class already claims
 * `variableId` for this subject; callers pass the role-map-backed check that
 * matches their own class. Escapes when the pick equals `originalVariableId`,
 * the field's PRE-EDIT committed value: re-saving an unchanged pick must never
 * be blocked by a conflict this edit did not introduce — one arising from a
 * stale draft, or already present in an imported protocol.
 */
export const crossClassPickIssue = ({
  variableId,
  originalVariableId,
  hasConflictingUse,
  allVariables,
  message,
}: {
  variableId: string;
  originalVariableId: string;
  hasConflictingUse: (variableId: string) => boolean;
  allVariables: Readonly<Variables>;
  message: (variableName: string) => string;
}): string | undefined => {
  if (!variableId || variableId === originalVariableId) return undefined;
  if (!hasConflictingUse(variableId)) return undefined;
  return message(variableDisplayName(allVariables, variableId));
};

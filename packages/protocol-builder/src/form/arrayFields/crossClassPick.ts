import type { Variables } from '@codaco/protocol-validation';

/** A variable's codebook display name, falling back to its id when absent. */
export const variableDisplayName = (
  variables: Readonly<Variables>,
  variableId: string,
): string => variables[variableId]?.name ?? variableId;

/**
 * Refusal earned when an UNVALIDATED writer — a stamp, a bin, a highlight —
 * picks a variable a form elsewhere already collects. Values written here
 * would bypass that form's validation, and the export would mix validated and
 * unvalidated answers under one name.
 */
export const validatedElsewhereMessage = (variableName: string): string =>
  `"${variableName}" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)`;

/** The same refusal, when the form doing the collecting is this stage's own. */
export const draftValidatedElsewhereMessage = (variableName: string): string =>
  `"${variableName}" is collected by this stage's form, so it cannot be assigned by this prompt (values assigned here would bypass its validation)`;

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

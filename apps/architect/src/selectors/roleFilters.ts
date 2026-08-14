import type { RootState } from '~/ducks/modules/root';

import {
  type ExclusiveSlotClaim,
  getExclusiveVariableSlotMap,
  getVariableRoleMap,
  getVariableRoleMapOutsideStage,
  roleMapKey,
} from './indexes';

type Subject = { entity: string; type?: string };
type Option = { value: string; label: string };

// The committed-value escape accepts either a single picker's current value
// or, for a surface whose rows share one pool (AssignAttributes'
// additionalAttributes FieldArray), every row's committed value at once.
const escapeSet = (currentValue?: string | readonly string[]): Set<string> =>
  new Set(typeof currentValue === 'string' ? [currentValue] : currentValue);

/** Options safe to offer a VALIDATED writer picker (form fields, quickAdd, otherVariable). */
export const excludeUnvalidatedUses = <T extends Option>(
  state: RootState,
  subject: Subject,
  options: T[],
  currentValue?: string | readonly string[],
  excludedStageIndex?: number,
): T[] => {
  const map = getVariableRoleMapOutsideStage(state, excludedStageIndex);
  const escaped = escapeSet(currentValue);
  return options.filter(
    (option) =>
      escaped.has(option.value) ||
      (map[roleMapKey(subject, option.value)]?.unvalidated ?? 0) === 0,
  );
};

/** Options safe to offer an UNVALIDATED writer picker (bins, highlight, census, etc.). */
export const excludeValidatedUses = <T extends Option>(
  state: RootState,
  subject: Subject,
  options: T[],
  currentValue?: string | readonly string[],
  excludedStageIndex?: number,
): T[] => {
  const map = getVariableRoleMapOutsideStage(state, excludedStageIndex);
  const escaped = escapeSet(currentValue);
  return options.filter(
    (option) =>
      escaped.has(option.value) ||
      (map[roleMapKey(subject, option.value)]?.validated ?? 0) === 0,
  );
};

/**
 * Options safe to offer a picker that is NOT an interface's own structural
 * slot. A Family Pedigree derives its ego marker, relationship and edge
 * variables from the structure the participant builds, so a second writer
 * would move people around their own family tree; the protocol schema rejects
 * that outright, and this keeps the picker from offering it in the first place.
 *
 * `ownSlot` is the slot the calling picker itself fills, if any. Passing it
 * keeps a variable that ANOTHER stage already binds in the SAME slot on offer —
 * two Family Pedigree stages over one node type legitimately share their
 * structural variables, and the schema rule is slot-aware for exactly that
 * reason.
 *
 * The committed-value escape matches the other exclusions: an imported
 * protocol's existing pick is always offered, so a picker never renders blank
 * and silently drops a selection. The save-time gate is what explains such a
 * pick to the researcher.
 */
export const excludeInterfaceOwned = <T extends Option>(
  state: RootState,
  subject: Subject,
  options: T[],
  currentValue?: string | readonly string[],
  ownSlot?: string,
): T[] => {
  const map = getExclusiveVariableSlotMap(state);
  const escaped = escapeSet(currentValue);
  return options.filter((option) => {
    if (escaped.has(option.value)) return true;
    const claim = map[roleMapKey(subject, option.value)];
    return claim === undefined || claim.slot === ownSlot;
  });
};

/**
 * The researcher-facing reason a variable may not be picked here, or undefined
 * when it may. Backs the save-time gate that catches a stale draft or an
 * imported protocol whose existing pick the picker deliberately still offers.
 */
export const interfaceOwnedPickIssue = (
  slotMap: Record<string, ExclusiveSlotClaim>,
  subject: Subject,
  variableId: string,
  ownSlot?: string,
): string | undefined => {
  if (!variableId) return undefined;
  const claim = slotMap[roleMapKey(subject, variableId)];
  if (!claim || claim.slot === ownSlot) return undefined;
  return `This variable is set by ${claim.owner}, so it cannot be used here. Choose a different variable.`;
};

/**
 * Whether a subject-scoped variable already has a VALIDATED (form) use —
 * backs the save-time gate an UNVALIDATED writer (bin/highlight/census/etc.)
 * applies to the variable it is about to pick. The mirror check (an
 * UNVALIDATED use, for a validated writer's gate) is inlined at each caller
 * instead (Form.tsx, NodeConfiguration.tsx, EditableAttributesList.tsx, and
 * CategoricalBinPrompts' withPromptChangeHandler for `otherVariable`) — those
 * already hold a `getVariableRoleMap` reference through their own
 * subscription, so a second state-taking helper here would save nothing.
 */
export const hasValidatedUse = (
  state: RootState,
  subject: Subject,
  variableId: string,
): boolean =>
  (getVariableRoleMap(state)[roleMapKey(subject, variableId)]?.validated ?? 0) >
  0;

import type { RootState } from '~/ducks/modules/root';

import {
  type ExclusiveSlotClaim,
  getExclusiveVariableSlotMap,
  getVariableRoleMapOutsideStage,
  roleMapKey,
  type VariableRoleMap,
} from './indexes';

type Subject = { entity: string; type?: string };
type Option = { value: string; label: string };

// The committed-value escape accepts either a single picker's current value
// or, for a surface whose rows share one pool (AssignAttributes'
// additionalAttributes FieldArray), every row's committed value at once.
const escapeSet = (currentValue?: string | readonly string[]): Set<string> =>
  new Set(typeof currentValue === 'string' ? [currentValue] : currentValue);

/**
 * Which class of writer a picker itself is.
 *
 * A form field collects its variable through that variable's own codebook
 * validation (`validated`); a bin, highlight, census, geospatial selection or
 * structural interface slot writes the value directly, with no validation of
 * its own (`unvalidated`). The two classes exclude opposite things, so this
 * one value decides both a picker's exclusion and the direction of its
 * save-time gate.
 */
export type WriterClass = 'validated' | 'unvalidated';

/**
 * Whether a subject-scoped variable already has a VALIDATED (form) use —
 * the question an UNVALIDATED writer's save-time gate asks about the variable
 * it is about to pick.
 *
 * Takes the role MAP, not the state: every caller either already holds one
 * through its own subscription (a component) or takes one store snapshot for
 * a whole save (an `onBeforeSave`/`editorValidate`), so a state-taking
 * signature would only add a second read. `getVariableRoleMap` and
 * `getVariableRoleMapOutsideStage` both produce this shape, which is how a
 * caller chooses whether its own stage's saved roles count.
 *
 * `roleFilters.test.ts` scans the app source for a hand-rolled
 * `roleMap[roleMapKey(…)]?.validated` and fails if one reappears, so these
 * three predicates stay the only readers of the map's counts.
 */
export const hasValidatedUse = (
  roleMap: VariableRoleMap,
  subject: Subject,
  variableId: string,
): boolean => (roleMap[roleMapKey(subject, variableId)]?.validated ?? 0) > 0;

/**
 * Whether a subject-scoped variable already has an UNVALIDATED (bin,
 * highlight, census, structural slot, …) use — the mirror of
 * `hasValidatedUse`, asked by a VALIDATED writer's save-time gate.
 */
export const hasUnvalidatedUse = (
  roleMap: VariableRoleMap,
  subject: Subject,
  variableId: string,
): boolean => (roleMap[roleMapKey(subject, variableId)]?.unvalidated ?? 0) > 0;

/**
 * Whether the writer class OPPOSITE to `writerClass` already claims the
 * variable. Picking the direction from the picker's OWN class is what keeps a
 * gate from checking the same class it belongs to — the mistake an inlined
 * `?.validated` / `?.unvalidated` makes silently.
 */
export const hasConflictingUse = (
  roleMap: VariableRoleMap,
  subject: Subject,
  variableId: string,
  writerClass: WriterClass,
): boolean =>
  writerClass === 'validated'
    ? hasUnvalidatedUse(roleMap, subject, variableId)
    : hasValidatedUse(roleMap, subject, variableId);

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
      !hasUnvalidatedUse(map, subject, option.value),
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
      escaped.has(option.value) || !hasValidatedUse(map, subject, option.value),
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
  return `This attribute is set by ${claim.owner}, so it cannot be used here. Choose a different attribute.`;
};

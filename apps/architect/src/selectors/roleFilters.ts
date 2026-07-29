import type { RootState } from '~/ducks/modules/root';

import {
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

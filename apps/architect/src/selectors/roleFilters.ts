import type { RootState } from '~/ducks/modules/root';

import { getVariableRoleMap, roleMapKey } from './indexes';

type Subject = { entity: string; type?: string };
type Option = { value: string; label: string };

/** Options safe to offer a VALIDATED writer picker (form fields, quickAdd, otherVariable). */
export const excludeUnvalidatedUses = <T extends Option>(
  state: RootState,
  subject: Subject,
  options: T[],
  currentValue?: string,
): T[] => {
  const map = getVariableRoleMap(state);
  return options.filter(
    (option) =>
      option.value === currentValue ||
      (map[roleMapKey(subject, option.value)]?.unvalidated ?? 0) === 0,
  );
};

/** Options safe to offer an UNVALIDATED writer picker (bins, highlight, census, etc.). */
export const excludeValidatedUses = <T extends Option>(
  state: RootState,
  subject: Subject,
  options: T[],
  currentValue?: string,
): T[] => {
  const map = getVariableRoleMap(state);
  return options.filter(
    (option) =>
      option.value === currentValue ||
      (map[roleMapKey(subject, option.value)]?.validated ?? 0) === 0,
  );
};

/**
 * Whether a subject-scoped variable already has a VALIDATED (form) use —
 * backs the save-time gate an UNVALIDATED writer (bin/highlight/census/etc.)
 * applies to the variable it is about to pick. The mirror check (an
 * UNVALIDATED use, for the form-field gate) is inlined at each hook-based
 * mount instead (Form.tsx, NodeConfiguration.tsx, EditableAttributesList.tsx)
 * — those already hold a subscribed `getVariableRoleMap` reference via
 * `useSelector`, so a second state-taking helper here would have no callers.
 */
export const hasValidatedUse = (
  state: RootState,
  subject: Subject,
  variableId: string,
): boolean =>
  (getVariableRoleMap(state)[roleMapKey(subject, variableId)]?.validated ?? 0) >
  0;

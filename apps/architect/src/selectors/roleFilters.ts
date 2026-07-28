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

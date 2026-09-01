import type { RootState } from '~/ducks/store';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { excludeUnvalidatedUses } from '~/selectors/roleFilters';

/**
 * NameGeneratorQuickAdd's quickAdd is a VALIDATED writer (its input now
 * honours the referenced variable's codebook validation): drop options an
 * unvalidated writer elsewhere already claims. Exported so this direction can
 * be pinned directly in `pickerExclusions.test.ts`, the same way
 * `getHighlightVariablesForSubject` is.
 */
export const getQuickAddOptionsForSubject = (
  state: RootState,
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string },
  currentValue?: string,
) => {
  const textOptionsForSubject = getVariableOptionsForSubject(
    state,
    subject,
  ).filter(({ type: variableType }) => variableType === 'text');

  return excludeUnvalidatedUses(
    state,
    subject,
    textOptionsForSubject,
    currentValue,
  );
};

import { createSelector } from '@reduxjs/toolkit';

import type { FilterRule } from '@codaco/protocol-validation';
import type { RootState } from '~/ducks/store';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { getCodebook } from '~/selectors/protocol';
import {
  excludeInterfaceOwned,
  excludeValidatedUses,
} from '~/selectors/roleFilters';
import { asOptions } from '~/selectors/utils';

export const getLayoutVariablesForSubject = (
  state: RootState,
  { entity, type }: { entity: string; type: string },
) => {
  const variableOptions = getVariableOptionsForSubject(state, {
    entity: entity as 'node' | 'edge' | 'ego',
    type,
  });
  const layoutOptions = variableOptions.filter(
    ({ type: variableType }) => variableType === 'layout',
  );

  return layoutOptions;
};

export const getHighlightVariablesForSubject = (
  state: RootState,
  { type, entity }: { type: string; entity: string },
  currentValue?: string,
) => {
  const subject = { entity: entity as 'node' | 'edge' | 'ego', type };
  // All defined variables that match nodeType
  const variableOptions = getVariableOptionsForSubject(state, subject);

  // Boolean variables which aren't already used (+ currently selected)
  const highlightVariables = variableOptions.filter(
    ({ type: variableType }) => variableType === 'boolean',
  );

  // The highlight-toggle picker is an UNVALIDATED writer: drop options a form
  // elsewhere already validates, and drop any variable an interface derives
  // from the structure a participant builds — highlighting writes the flag the
  // Family Pedigree uses to mark the participant.
  return excludeInterfaceOwned(
    state,
    subject,
    excludeValidatedUses(state, subject, highlightVariables, currentValue),
    currentValue,
  );
};

export const getEdgesForSubject = createSelector([getCodebook], (codebook) => {
  if (!codebook) return [];
  return asOptions(codebook.edge ?? {});
});

export type CurrentFilters = {
  rules?: FilterRule[];
  [key: string]: unknown;
};

/**
 * The stage-level network filter's edge rules. Takes the stage's `filter`
 * value directly (read via `useStageFormValue('filter')` at the call site —
 * the "deliberately unshadowed stageFormContext" reaching across from inside
 * the prompt-editor dialog to the stage form, per plan §2.4) rather than
 * selecting it from Redux state itself.
 */
export const getEdgeFilters = (
  currentFilters: CurrentFilters | undefined,
): FilterRule[] => {
  if (!currentFilters?.rules) {
    return [];
  }
  return currentFilters.rules.filter(
    (rule: FilterRule) => rule.type === 'edge',
  );
};

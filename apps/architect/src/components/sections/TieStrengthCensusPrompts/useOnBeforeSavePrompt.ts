import { useCallback } from 'react';
import { useStore } from 'react-redux';

import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import type { Variable } from '@codaco/protocol-validation';
import { useAppDispatch } from '~/ducks/hooks';
import { updateVariableAsync } from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/modules/root';
import { markExternalEdit } from '~/ducks/modules/stageEditorDraft';
import { getVariablesForSubject } from '~/selectors/codebook';
import { hasValidatedUse } from '~/selectors/roleFilters';

import {
  crossClassPickIssue,
  findDraftContradictions,
  validatedElsewhereMessage,
} from '../../Validations/contradictions';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The `DialogArrayField.onBeforeSave` replacement for the deleted
 * `withPromptChangeHandler` HOC. Unlike CategoricalBinPrompts's version, the
 * edge variable's subject (`{entity: 'edge', type: createEdge}`) is chosen
 * INSIDE the prompt being saved, not the stage's own subject — so, matching
 * the original enhancer, this reads the codebook fresh from the store at
 * save time rather than memoising a subject-scoped selector.
 */
export function useOnBeforeSaveTieStrengthPrompt() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  return useCallback(
    async (
      value: unknown,
    ): Promise<
      UnknownRecord | Extract<FormSubmissionResult, { success: false }>
    > => {
      if (!isRecord(value)) return value as UnknownRecord;

      const {
        createEdge,
        edgeVariable,
        variableOptions,
        _originalEdgeVariable,
        ...rest
      } = value;
      const createEdgeType = typeof createEdge === 'string' ? createEdge : '';
      const edgeVariableId =
        typeof edgeVariable === 'string' ? edgeVariable : '';
      const state = store.getState();
      const allVariables = getVariablesForSubject(state, {
        entity: 'edge',
        type: createEdgeType,
      });

      // Saving new options for the bound edge variable can make its own
      // committed validation rules (e.g. minSelected) impossible to satisfy —
      // check before writing, mirroring CategoricalBinPrompts's guard.
      const existingVariable: unknown = allVariables[edgeVariableId];
      const existingValidation =
        isRecord(existingVariable) && isRecord(existingVariable.validation)
          ? existingVariable.validation
          : {};
      const variableType =
        isRecord(existingVariable) && typeof existingVariable.type === 'string'
          ? existingVariable.type
          : undefined;
      if (variableType) {
        const contradiction = findDraftContradictions({
          allVariables,
          currentVariableId: edgeVariableId,
          variableType,
          validation: existingValidation,
          options: variableOptions,
        })[0];
        if (contradiction) {
          return {
            success: false,
            fieldErrors: { variableOptions: [contradiction.message] },
          };
        }
      }

      // Cross-class exclusivity gate: this census prompt is an UNVALIDATED
      // writer, so it may not save an edgeVariable a form elsewhere already
      // collects (the save-time backstop for a stale draft that bypassed the
      // picker exclusion).
      const crossClassIssue = crossClassPickIssue({
        variableId: edgeVariableId,
        originalVariableId:
          typeof _originalEdgeVariable === 'string'
            ? _originalEdgeVariable
            : '',
        hasConflictingUse: (variableId) =>
          hasValidatedUse(
            state,
            { entity: 'edge', type: createEdgeType },
            variableId,
          ),
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (crossClassIssue) {
        return {
          success: false,
          fieldErrors: { edgeVariable: [crossClassIssue] },
        };
      }

      dispatch(markExternalEdit());
      await dispatch(
        updateVariableAsync({
          entity: 'edge',
          type: createEdgeType,
          variable: edgeVariableId,
          configuration: { options: variableOptions } as Partial<Variable>,
        }),
      );

      return {
        edgeVariable: edgeVariableId,
        createEdge: createEdgeType,
        ...rest,
      };
    },
    [dispatch, store],
  );
}

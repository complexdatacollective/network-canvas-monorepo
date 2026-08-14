import { useCallback } from 'react';
import { useStore } from 'react-redux';

import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import type { Variable } from '@codaco/protocol-validation';
import { useAppDispatch } from '~/ducks/hooks';
import { updateVariableAsync } from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';
import {
  getExclusiveVariableSlotMap,
  getInterfaceOwnedOptionMap,
  roleMapKey,
} from '~/selectors/indexes';
import {
  hasValidatedUse,
  interfaceOwnedPickIssue,
} from '~/selectors/roleFilters';

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

      const edgeSubject = { entity: 'edge' as const, type: createEdgeType };

      // A variable an interface derives from the structure a participant
      // builds can never be a census answer. The picker already drops those,
      // so this catches a stale draft or an imported protocol — and it has no
      // unchanged-pick escape, because re-saving would keep overwriting the
      // interface's own value.
      const ownedIssue = interfaceOwnedPickIssue(
        getExclusiveVariableSlotMap(state),
        edgeSubject,
        edgeVariableId,
      );
      if (ownedIssue) {
        return { success: false, fieldErrors: { edgeVariable: [ownedIssue] } };
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
          hasValidatedUse(state, edgeSubject, variableId),
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (crossClassIssue) {
        return {
          success: false,
          fieldErrors: { edgeVariable: [crossClassIssue] },
        };
      }

      // An interface that branches on the variable's exact values owns its
      // option list. The editor renders those read-only, so a draft can only
      // differ if it is stale or came from an imported protocol; writing it
      // would invalidate the whole protocol behind the researcher's back.
      const isInterfaceOwned =
        getInterfaceOwnedOptionMap(state)[
          roleMapKey(edgeSubject, edgeVariableId)
        ] !== undefined;
      if (isInterfaceOwned) {
        const existingOptions =
          isRecord(existingVariable) && Array.isArray(existingVariable.options)
            ? existingVariable.options
            : [];
        if (
          Array.isArray(variableOptions) &&
          JSON.stringify(variableOptions) !== JSON.stringify(existingOptions)
        ) {
          return {
            success: false,
            fieldErrors: {
              variableOptions: [
                'These options are set by the interface that uses this variable and cannot be changed here. Close this dialog and reopen it to start from the current options.',
              ],
            },
          };
        }
        return {
          edgeVariable: edgeVariableId,
          createEdge: createEdgeType,
          ...rest,
        };
      }

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

import { useCallback, useMemo } from 'react';

import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import type { Variable } from '@codaco/protocol-validation';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableAsync } from '~/ducks/modules/protocol/codebook';
import { getVariablesForSubjectSelector } from '~/selectors/codebook';
import {
  getExclusiveVariableSlotMap,
  getInterfaceOwnedOptionMap,
  getVariableRoleMap,
  roleMapKey,
} from '~/selectors/indexes';
import { interfaceOwnedPickIssue } from '~/selectors/roleFilters';

import {
  crossClassPickIssue,
  findDraftContradictions,
  unvalidatedElsewhereMessage,
  validatedElsewhereMessage,
} from '../../Validations/contradictions';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The `DialogArrayField.onBeforeSave` replacement for the deleted
 * `withPromptChangeHandler` HOC. Shared with `OrdinalBinPrompts`, exactly as
 * that HOC was.
 *
 * A prompt row's PRE-EDIT `variable`/`otherVariable` no longer arrive as a
 * dialog-form `initialValues` prop — `CategoricalBinPrompts.tsx`'s
 * `itemSelector` stashes them on the row under `_originalVariable`/
 * `_originalOtherVariable` (distinct from the real field names, so a save
 * cannot resurrect them), which is where this reads its unchanged-pick
 * escape from.
 */
export function useOnBeforeSavePrompt(
  entity: 'node' | 'edge' | 'ego',
  type: string | null,
) {
  const dispatch = useAppDispatch();
  const subject = useMemo(
    () => ({ entity, type: type ?? undefined }),
    [entity, type],
  );
  const allVariables = useAppSelector((state) =>
    getVariablesForSubjectSelector(state, subject),
  );
  const roleMap = useAppSelector(getVariableRoleMap);
  const exclusiveSlotMap = useAppSelector(getExclusiveVariableSlotMap);
  const interfaceOwnedOptions = useAppSelector(getInterfaceOwnedOptionMap);

  const hasValidatedUseForSubject = useCallback(
    (variableId: string) =>
      (roleMap[roleMapKey(subject, variableId)]?.validated ?? 0) > 0,
    [roleMap, subject],
  );
  const hasUnvalidatedUseForSubject = useCallback(
    (variableId: string) =>
      (roleMap[roleMapKey(subject, variableId)]?.unvalidated ?? 0) > 0,
    [roleMap, subject],
  );

  return useCallback(
    async (
      value: unknown,
    ): Promise<
      UnknownRecord | Extract<FormSubmissionResult, { success: false }>
    > => {
      if (!isRecord(value)) return value as UnknownRecord;

      // Turning the "Other" section off clears its fields explicitly
      // (PromptFields.tsx), which `DialogArrayField`'s `mergeEditedRow` turns
      // into a deletion of those keys — so an absent `otherVariable` here
      // genuinely means "off" rather than "the section happened to be
      // collapsed", and needs no marker field of its own.
      const {
        variable,
        variableOptions,
        _originalVariable,
        _originalOtherVariable,
        ...rest
      } = value;
      const variableId = typeof variable === 'string' ? variable : '';
      const otherVariable = rest.otherVariable;

      // Saving new options for the bound variable can make its own committed
      // validation rules (e.g. minSelected) impossible to satisfy — check
      // before writing, the same way the field-editor dialog does. A
      // variable that only ever appears as the TARGET of another's
      // sameAs/comparator has no rules of its own, so `existingVariable` can
      // legitimately have no `validation` key at all; that must not skip the
      // check, so an absent/non-record validation runs the analyser with an
      // empty rule map instead.
      const existingVariable: unknown = allVariables[variableId];
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
          currentVariableId: variableId,
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

      // A variable an interface derives structurally can never be a bin: the
      // bin writes it through drag-and-drop. The picker already drops those,
      // so this catches a stale draft or an imported protocol — and it has no
      // unchanged-pick escape, because re-saving would keep overwriting the
      // interface's own value.
      const ownedIssue = interfaceOwnedPickIssue(
        exclusiveSlotMap,
        subject,
        variableId,
      );
      if (ownedIssue) {
        return { success: false, fieldErrors: { variable: [ownedIssue] } };
      }

      // Cross-class exclusivity gate: this bin is an UNVALIDATED writer, so
      // it may not save a variable a form elsewhere already collects (the
      // save-time backstop for a stale draft that bypassed the picker
      // exclusion).
      const crossClassIssue = crossClassPickIssue({
        variableId,
        originalVariableId:
          typeof _originalVariable === 'string' ? _originalVariable : '',
        hasConflictingUse: hasValidatedUseForSubject,
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (crossClassIssue) {
        return { success: false, fieldErrors: { variable: [crossClassIssue] } };
      }

      // The mirror gate for CategoricalBin's `otherVariable`, a VALIDATED
      // writer: reject a pick a bin/highlight/census/etc. elsewhere already
      // writes without validation. OrdinalBin prompts have no follow-up
      // option, so this is a no-op there.
      const otherVariableId =
        typeof otherVariable === 'string' ? otherVariable : '';
      const otherVariableIssue = crossClassPickIssue({
        variableId: otherVariableId,
        originalVariableId:
          typeof _originalOtherVariable === 'string'
            ? _originalOtherVariable
            : '',
        hasConflictingUse: hasUnvalidatedUseForSubject,
        allVariables,
        message: unvalidatedElsewhereMessage,
      });
      if (otherVariableIssue) {
        return {
          success: false,
          fieldErrors: { otherVariable: [otherVariableIssue] },
        };
      }

      // An interface that both writes and branches on the variable's exact
      // values owns its option list. The editor renders those read-only, so a
      // draft can only differ if it is stale or came from an imported
      // protocol; writing it would invalidate the whole protocol behind the
      // researcher's back, and silently dropping it would leave the dialog
      // claiming an edit it did not make. Refuse, and say why.
      const isInterfaceOwned =
        interfaceOwnedOptions[roleMapKey(subject, variableId)] !== undefined;
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
        return { variable: variableId, ...rest };
      }

      await dispatch(
        updateVariableAsync({
          entity,
          type: type ?? undefined,
          variable: variableId,
          configuration: { options: variableOptions } as Partial<Variable>,
        }),
      );

      return { variable: variableId, ...rest };
    },
    [
      allVariables,
      dispatch,
      entity,
      exclusiveSlotMap,
      hasUnvalidatedUseForSubject,
      hasValidatedUseForSubject,
      interfaceOwnedOptions,
      subject,
      type,
    ],
  );
}

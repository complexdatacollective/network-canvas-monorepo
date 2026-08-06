import { useCallback, useMemo } from 'react';

import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import type { Variable } from '@codaco/protocol-validation';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableAsync } from '~/ducks/modules/protocol/codebook';
import { markExternalEdit } from '~/ducks/modules/stageEditorDraft';
import { getVariablesForSubjectSelector } from '~/selectors/codebook';
import { getVariableRoleMap, roleMapKey } from '~/selectors/indexes';

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
 * `withPromptChangeHandler` HOC (`helpers.tsx`, `withPromptChangeHandler.tsx`
 * and their `withVariableHandlers`/`withVariableOptions` siblings stay in
 * place, unconverted, because `OrdinalBinPrompts` still imports them against
 * the legacy `~/components/Form/DialogArrayField`).
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

      // `hasOtherVariable` is a real, always-registered field
      // (PromptFields.tsx) tracking whether the toggleable "Other" section
      // is open THIS session — the only reliable signal here. Editing an
      // EXISTING row merges this session's submitted values OVER the row's
      // pre-edit ones (DialogArrayField's handleSave, to preserve properties
      // the editor never renders), so a collapsed "Other" section's
      // unregistered `otherVariable` does NOT make it absent from `value`:
      // the row's stale pre-edit pick silently survives the merge instead.
      // Without this flag that stale value would leak back into the saved
      // prompt even after the researcher explicitly turned "Other" off.
      const {
        variable,
        variableOptions,
        hasOtherVariable,
        _originalVariable,
        _originalOtherVariable,
        ...rest
      } = value;
      const variableId = typeof variable === 'string' ? variable : '';
      if (!hasOtherVariable) {
        delete rest.otherVariable;
        delete rest.otherOptionLabel;
        delete rest.otherVariablePrompt;
      }
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
      // writes without validation. Absent on OrdinalBin prompts (which no
      // longer share this hook — Ordinal keeps the legacy HOC), so this is a
      // no-op there.
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

      dispatch(markExternalEdit());
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
      hasUnvalidatedUseForSubject,
      hasValidatedUseForSubject,
      type,
    ],
  );
}

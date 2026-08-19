import { useCallback, useRef } from 'react';
import { useStore } from 'react-redux';

import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import {
  INTERFACE_OWNED_OPTION_SETS,
  optionsMatchInterfaceOwnedSet,
  type Variable,
} from '@codaco/protocol-validation';
import { useAppDispatch } from '~/ducks/hooks';
import { updateVariableAsync } from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';
import {
  getExclusiveVariableSlotMap,
  getInterfaceOwnedOptionMap,
  getVariableRoleMap,
  roleMapKey,
} from '~/selectors/indexes';
import {
  hasValidatedUse,
  interfaceOwnedPickIssue,
} from '~/selectors/roleFilters';

import {
  crossClassPickIssue,
  findDraftContradictions,
  unvalidatedElsewhereMessage,
  validatedElsewhereMessage,
} from '../Validations/contradictions';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The refusal a researcher reads when a draft would rewrite an option list the
 * interface owns. ONE constant: every editor that binds such a variable shows
 * the same refusal for the same protocol rule, and a second copy of the
 * sentence could drift from this one while both remained "correct".
 */
const INTERFACE_OWNED_OPTIONS_REFUSAL =
  'These options are set by the interface that uses this attribute and cannot be changed here. Close this dialog and reopen it to start from the current options.';

type OptionsCommitSubject = {
  entity: 'node' | 'edge' | 'ego';
  type?: string;
};

type VariableOptionsCommitConfig = {
  /** Row field naming the codebook variable whose options this editor writes. */
  variableField: string;
  /**
   * Row field holding that pick's PRE-EDIT value, which is the unchanged-pick
   * escape for the cross-class gate. The row's `itemSelector` stashes it under
   * a key distinct from the real field name, so a save cannot resurrect it.
   */
  originalVariableField: string;
  /** Row field holding the draft option list. */
  optionsField: string;
  /**
   * The codebook subject the pick belongs to, derived from the row being
   * saved. Tie-Strength Census chooses its edge type INSIDE the prompt, so
   * this cannot be fixed at mount for every caller.
   */
  subjectForRow: (row: UnknownRecord) => OptionsCommitSubject;
  /**
   * A second pick the same editor makes as a VALIDATED writer
   * (CategoricalBin's follow-up "other" attribute), gated in the mirror
   * direction. Omitted where the editor has no such field.
   */
  validatedPick?: {
    field: string;
    originalField: string;
  };
};

/** Narrows an unknown draft list to the shape the option comparison reads. */
const asOptionList = (
  value: unknown,
): { value: unknown; label?: unknown }[] | undefined =>
  Array.isArray(value)
    ? value.map((option) =>
        isRecord(option)
          ? { value: option.value, label: option.label }
          : { value: undefined },
      )
    : undefined;

/**
 * The `DialogArrayField.onBeforeSave` shared by every prompt editor that binds
 * a categorical/ordinal variable and edits its option list in place — the
 * replacement for the deleted `withPromptChangeHandler` HOC, which the same
 * editors shared for the same reason.
 *
 * The editors differ only in which row fields carry the pick, its pre-edit
 * value and the draft options, and in how the subject is reached, so those are
 * parameters rather than a second copy of the gates.
 *
 * The returned callback keeps one identity for the life of the editor: it runs
 * on save rather than on render, so it reads the latest config through a ref
 * and takes its store snapshot at save time.
 */
export function useVariableOptionsCommit(config: VariableOptionsCommitConfig) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const configRef = useRef(config);
  configRef.current = config;

  return useCallback(
    async (
      value: unknown,
    ): Promise<
      UnknownRecord | Extract<FormSubmissionResult, { success: false }>
    > => {
      if (!isRecord(value)) return value as UnknownRecord;

      const {
        variableField,
        originalVariableField,
        optionsField,
        subjectForRow,
        validatedPick,
      } = configRef.current;

      // Turning an optional section off clears its fields explicitly, which
      // `DialogArrayField`'s `mergeEditedRow` turns into a deletion of those
      // keys — so an absent optional pick here genuinely means "off" rather
      // than "the section happened to be collapsed", and needs no marker
      // field of its own. The editor's own bookkeeping keys never reach the
      // saved row.
      const rest: UnknownRecord = { ...value };
      delete rest[variableField];
      delete rest[optionsField];
      delete rest[originalVariableField];
      if (validatedPick) delete rest[validatedPick.originalField];

      const rawVariable = value[variableField];
      const variableId = typeof rawVariable === 'string' ? rawVariable : '';
      const draftOptions = value[optionsField];
      const subject = subjectForRow(value);
      const state = store.getState();
      const allVariables = getVariablesForSubject(state, subject);
      const saved: UnknownRecord = { [variableField]: variableId, ...rest };

      // Saving new options for the bound variable can make its own committed
      // validation rules (e.g. minSelected) impossible to satisfy — check
      // before writing, the same way the field-editor dialog does. A variable
      // that only ever appears as the TARGET of another's sameAs/comparator
      // has no rules of its own, so `existingVariable` can legitimately have
      // no `validation` key at all; that must not skip the check, so an
      // absent/non-record validation runs the analyser with an empty rule map
      // instead.
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
          options: draftOptions,
        })[0];
        if (contradiction) {
          return {
            success: false,
            fieldErrors: { [optionsField]: [contradiction.message] },
          };
        }
      }

      // A variable an interface derives from the structure a participant
      // builds can never be a prompt's answer: the interface writes it itself.
      // The picker already drops those, so this catches a stale draft or an
      // imported protocol — and it has no unchanged-pick escape, because
      // re-saving would keep overwriting the interface's own value.
      const ownedIssue = interfaceOwnedPickIssue(
        getExclusiveVariableSlotMap(state),
        subject,
        variableId,
      );
      if (ownedIssue) {
        return {
          success: false,
          fieldErrors: { [variableField]: [ownedIssue] },
        };
      }

      // Cross-class exclusivity gate: this prompt is an UNVALIDATED writer, so
      // it may not save a variable a form elsewhere already collects (the
      // save-time backstop for a stale draft that bypassed the picker
      // exclusion).
      const rawOriginalVariable = value[originalVariableField];
      const crossClassIssue = crossClassPickIssue({
        variableId,
        originalVariableId:
          typeof rawOriginalVariable === 'string' ? rawOriginalVariable : '',
        hasConflictingUse: (id) => hasValidatedUse(state, subject, id),
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (crossClassIssue) {
        return {
          success: false,
          fieldErrors: { [variableField]: [crossClassIssue] },
        };
      }

      // The mirror gate for a VALIDATED writer the same editor owns: reject a
      // pick a bin/highlight/census/etc. elsewhere already writes without
      // validation. `~/selectors/roleFilters` exports only the validated
      // direction, so the mirror is read from the same role map here.
      if (validatedPick) {
        const roleMap = getVariableRoleMap(state);
        const rawPick = value[validatedPick.field];
        const rawOriginalPick = value[validatedPick.originalField];
        const pickIssue = crossClassPickIssue({
          variableId: typeof rawPick === 'string' ? rawPick : '',
          originalVariableId:
            typeof rawOriginalPick === 'string' ? rawOriginalPick : '',
          hasConflictingUse: (id) =>
            (roleMap[roleMapKey(subject, id)]?.unvalidated ?? 0) > 0,
          allVariables,
          message: unvalidatedElsewhereMessage,
        });
        if (pickIssue) {
          return {
            success: false,
            fieldErrors: { [validatedPick.field]: [pickIssue] },
          };
        }
      }

      // An interface that both writes and branches on the variable's exact
      // values owns its option list, and the protocol schema refuses any other
      // list (see `optionsMatchInterfaceOwnedSet` in @codaco/protocol-
      // validation, which this calls rather than re-deciding the question).
      // The editor renders those read-only, so a draft can only differ if it
      // is stale or came from an imported protocol; writing it would
      // invalidate the whole protocol behind the researcher's back, and
      // silently dropping it would leave the dialog claiming an edit it did
      // not make. Refuse, and say why.
      const ownedOptionSet =
        getInterfaceOwnedOptionMap(state)[roleMapKey(subject, variableId)];
      if (ownedOptionSet) {
        const canonical = INTERFACE_OWNED_OPTION_SETS[ownedOptionSet].options;
        if (
          Array.isArray(draftOptions) &&
          !optionsMatchInterfaceOwnedSet(asOptionList(draftOptions), canonical)
        ) {
          return {
            success: false,
            fieldErrors: {
              [optionsField]: [INTERFACE_OWNED_OPTIONS_REFUSAL],
            },
          };
        }
        return saved;
      }

      await dispatch(
        updateVariableAsync({
          entity: subject.entity,
          type: subject.type,
          variable: variableId,
          configuration: { options: draftOptions } as Partial<Variable>,
        }),
      );

      return saved;
    },
    [dispatch, store],
  );
}

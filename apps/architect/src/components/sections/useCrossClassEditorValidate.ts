import { useCallback, useRef } from 'react';
import { useStore } from 'react-redux';

import type { DialogArrayEditorValidate } from '~/components/Form/arrayFields/DialogArrayField';
import {
  crossClassPickErrors,
  type CrossClassPick,
} from '~/components/Validations/crossClassPicks';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';
import { getVariableRoleMap } from '~/selectors/indexes';

type UnknownRecord = Record<string, unknown>;

type PickSubject = { entity: 'node' | 'edge' | 'ego'; type?: string };

export type CrossClassEditorValidateConfig = {
  /** Every variable picker this row editor owns, with its own writer class. */
  picks: readonly CrossClassPick[];
  /**
   * The codebook subject the row's picks belong to. Derived from the row
   * because Tie-Strength Census chooses its edge type INSIDE the prompt, so
   * this cannot be fixed at mount for every caller. `null` while the stage
   * has no subject yet, which skips the gate — there is nothing to conflict
   * with.
   */
  subjectForRow: (row: UnknownRecord) => PickSubject | null;
};

/**
 * The `DialogArrayField.editorValidate` shared by every row editor whose
 * pickers are cross-class writers.
 *
 * `editorValidate` rather than `onBeforeSave` because only the dialog's own
 * `context.initialValues` — the row as the dialog opened on it, which
 * `DialogArrayField` already supplies — carries the pre-edit pick the
 * unchanged-pick escape needs. `onBeforeSave` receives the already-merged
 * post-edit row, with no way to tell an unchanged pick from a changed one;
 * the editors that used it stashed marker fields (`_originalVariable` and
 * friends) on the row through their `itemSelector` to make up the difference,
 * which is the mechanism this replaces.
 *
 * The returned callback keeps one identity for the life of the editor: it
 * runs on submit rather than on render, so it reads the latest config through
 * a ref and takes its store snapshot then. That also means a component using
 * it subscribes to neither the codebook nor the role map for a question it
 * only ever asks at save time.
 */
export function useCrossClassEditorValidate(
  config: CrossClassEditorValidateConfig,
): DialogArrayEditorValidate {
  const store = useStore<RootState>();
  const configRef = useRef(config);
  configRef.current = config;

  return useCallback(
    (values, context) => {
      const { picks, subjectForRow } = configRef.current;
      const subject = subjectForRow(values);
      if (!subject) return undefined;

      const state = store.getState();
      return crossClassPickErrors({
        values,
        initialValues: context?.initialValues,
        picks,
        subject,
        roleMap: getVariableRoleMap(state),
        allVariables: getVariablesForSubject(state, subject),
      });
    },
    [store],
  );
}

import { get } from 'es-toolkit/compat';

import type { VariableRoleMap } from '~/selectors/indexes';
import { hasConflictingUse, type WriterClass } from '~/selectors/roleFilters';

import {
  crossClassConflictMessage,
  crossClassPickIssue,
} from './contradictions';

type Subject = { entity: string; type?: string };
type UnknownRecord = Record<string, unknown>;

/** One variable picker inside an array row's editor dialog. */
export type CrossClassPick = {
  /**
   * Dot path of the pick within the row — also the key its refusal is
   * reported under, so it must match the editor's own field name
   * (`highlight.variable`, not `highlight`).
   */
  path: string;
  /** The class of writer THIS picker is; the gate checks the other one. */
  writerClass: WriterClass;
};

const stringAt = (row: unknown, path: string): string => {
  const value: unknown = get(row, path);
  return typeof value === 'string' ? value : '';
};

/**
 * The cross-class exclusivity refusals for one array row's picks, keyed by
 * pick path — `undefined` when every pick is legal.
 *
 * `initialValues` is the row as the dialog opened on it, which
 * `DialogArrayField` passes to `editorValidate` as
 * `context.initialValues`. It is the unchanged-pick escape: re-saving a
 * prompt whose variable this edit did not touch must never be refused for a
 * conflict the edit did not introduce (an imported protocol's pre-existing
 * one, above all — the timeline alert reports those non-destructively rather
 * than trapping the researcher in a dialog that will not close).
 *
 * A pick absent from `values` needs no gate: the editor either never
 * registered that field — in which case `DialogArrayField`'s `mergeEditedRow`
 * carries the row's own pre-edit value through unchanged, which is the escape
 * — or the researcher cleared it, and a cleared key is deleted from the saved
 * row.
 */
export const crossClassPickErrors = ({
  values,
  initialValues,
  picks,
  subject,
  roleMap,
  allVariables,
}: {
  values: UnknownRecord;
  /** The row the dialog opened on (`context.initialValues`). */
  initialValues: unknown;
  picks: readonly CrossClassPick[];
  subject: Subject;
  roleMap: VariableRoleMap;
  allVariables: UnknownRecord;
}): Record<string, string> | undefined => {
  const errors: Record<string, string> = {};

  for (const { path, writerClass } of picks) {
    const issue = crossClassPickIssue({
      variableId: stringAt(values, path),
      originalVariableId: stringAt(initialValues, path),
      hasConflictingUse: (variableId) =>
        hasConflictingUse(roleMap, subject, variableId, writerClass),
      allVariables,
      message: crossClassConflictMessage[writerClass],
    });
    if (issue) errors[path] = issue;
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
};

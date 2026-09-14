import { isEqual } from 'es-toolkit';
import { useCallback, useMemo } from 'react';

import { useSetVariableOptions } from '../codebook/useCodebookVariableEdits.ts';
import {
  optionsForShape,
  optionsShapeFor,
} from '../codebook/variableOptions.ts';
import type {
  RowSaveContext,
  RowSaveOutcome,
  RowValues,
} from '../form/rowDialog.tsx';
import {
  variablesForSubject,
  type CodebookSubject,
} from '../protocol-context.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { attributeOptionsFieldFor } from './AttributeValueFields.tsx';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * The two halves of authoring an attribute's answers inside a prompt's row.
 *
 * Declared together because neither is any use without the other: the save can
 * only tell an edited list from a seeded one if the dialog opened holding what
 * the codebook had. A section wires both or neither.
 */
export type OptionsRowCommit = Readonly<{
  /** `RowListConfig['expand']` — the row as the dialog opens on it. */
  expand: (row: RowValues) => RowValues;
  /** The part of `RowListConfig['beforeSave']` this list owns. */
  commit: (row: RowValues, context: RowSaveContext) => Promise<RowSaveOutcome>;
}>;

/**
 * Writes the answers a prompt's attribute offers, in that prompt's own save.
 *
 * The three prompt families that bind a list-valued attribute — the two bins
 * and the tie-strength scale — author it inline under the picker
 * (`AttributeValueFields`) and commit it here, which is what Architect did
 * from one shared gate of its own (`sections/useVariableOptionsCommit.ts`, run
 * as the row dialog's `onBeforeSave`). The list belongs to the codebook
 * attribute, so the write takes that section's own lock; the draft key is the
 * dialog's working state and never reaches the prompt.
 *
 * A list nobody edited is not written at all, and that is what `expand` is
 * for. The control is SEEDED from the codebook, so the row carries the
 * attribute's whole list whether or not the researcher touched it — and a save
 * about the prompt's wording would otherwise write that seeded snapshot back,
 * taking away a point a collaborator had added in the meantime with neither
 * researcher seeing anything happen. `expand` puts the list as the dialog
 * opened on it into the row, `beforeSave` is handed that same row back as
 * `openedOn`, and a draft that still matches it is a list nobody wrote.
 *
 * Where the researcher DID write it, their list is written whole. That is the
 * ownership every codebook surface in this package writes under — an editor
 * writes the properties it set and the host keeps the rest
 * (`documentWithRebasedVariable`, and `replaceProperties` here) — so a
 * collaborator's rename, rules or control survive this save while their edit
 * to the same LIST does not. Refusing instead would be a third answer to a
 * question the codebook's own option editor already answers this way.
 *
 * Refusals come back on the list the researcher typed, which is the thing
 * there is to correct, and leave the row open holding it.
 */
export function useOptionsRowCommit(
  variableField: string,
  /**
   * Whose codebook the attribute this row binds lives in. A function of the
   * ROW because a tie-strength prompt names the connection type it is about,
   * so the type is part of the row rather than of the stage.
   */
  subjectForRow: (row: RowValues) => CodebookSubject | undefined,
): OptionsRowCommit {
  const setOptions = useSetVariableOptions();
  const protocolContext = useProtocolContext();
  const optionsField = attributeOptionsFieldFor(variableField);

  /**
   * The list the attribute a row binds holds, read from the codebook.
   *
   * `undefined` for a row binding nothing, an attribute the codebook does not
   * have, and an attribute carrying no list. All three are "there is no list
   * here", which is also what an untouched control is seeded with.
   */
  const heldOptions = useCallback(
    (row: RowValues): unknown => {
      const subject = subjectForRow(row);
      const variableId = asString(row[variableField]) ?? '';
      if (subject === undefined || variableId === '') return undefined;
      const held = variablesForSubject(protocolContext, subject)[variableId];
      return held === undefined ? undefined : Reflect.get(held, 'options');
    },
    [protocolContext, subjectForRow, variableField],
  );

  const expand = useCallback(
    (row: RowValues): RowValues => {
      const asOpened = heldOptions(row);
      // Absent stays absent: a yes-or-no attribute that names no answers
      // carries no `options` key at all, and a row holding the key with
      // nothing under it is not the same row.
      return asOpened === undefined
        ? row
        : { ...row, [optionsField]: asOpened };
    },
    [heldOptions, optionsField],
  );

  const commit = useCallback(
    async (
      row: RowValues,
      context: RowSaveContext,
    ): Promise<RowSaveOutcome> => {
      const { [optionsField]: draft, ...committed } = row;
      const subject = subjectForRow(row);
      if (draft === undefined || subject === undefined) {
        return { row: committed };
      }
      const variableId = asString(row[variableField]) ?? '';
      if (variableId === '') return { row: committed };

      // Only while the row still binds the attribute it opened on: a picker
      // moved to another attribute re-seeds the control from THAT attribute's
      // list, and what the row opened on says nothing about the list on
      // screen. The codebook as it stands is the nearest thing to a seed
      // there is then, which is the reading `useSetVariableOptions` makes for
      // itself.
      const boundAsOpened =
        asString(context.openedOn[variableField]) === variableId;
      const held = variablesForSubject(protocolContext, subject)[variableId];
      const heldNow =
        held === undefined ? undefined : Reflect.get(held, 'options');
      const asOpened = boundAsOpened ? context.openedOn[optionsField] : heldNow;

      const writing = optionsForShape(
        optionsShapeFor(held?.type, held && Reflect.get(held, 'component')),
        draft,
        asOpened,
      );
      // Nothing the researcher wrote, so nothing to write: the control was
      // showing them the codebook's own list and they left it alone.
      if (boundAsOpened && isEqual(writing, asOpened)) {
        return { row: committed };
      }

      const outcome = await setOptions(subject, variableId, writing);
      return outcome.status === 'refused'
        ? { refused: { fieldErrors: { [optionsField]: outcome.message } } }
        : { row: committed };
    },
    [optionsField, protocolContext, setOptions, subjectForRow, variableField],
  );

  return useMemo(() => ({ expand, commit }), [commit, expand]);
}

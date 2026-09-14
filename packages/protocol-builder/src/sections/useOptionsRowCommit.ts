import { useCallback } from 'react';

import { useSetVariableOptions } from '../codebook/useCodebookVariableEdits.ts';
import {
  optionsForShape,
  optionsShapeFor,
} from '../codebook/variableOptions.ts';
import type { RowSaveOutcome, RowValues } from '../form/rowDialog.tsx';
import {
  variablesForSubject,
  type CodebookSubject,
} from '../protocol-context.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { attributeOptionsFieldFor } from './AttributeValueFields.tsx';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

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
): (row: RowValues) => Promise<RowSaveOutcome> {
  const setOptions = useSetVariableOptions();
  const protocolContext = useProtocolContext();
  const optionsField = attributeOptionsFieldFor(variableField);

  return useCallback(
    async (row: RowValues): Promise<RowSaveOutcome> => {
      const { [optionsField]: draft, ...committed } = row;
      const subject = subjectForRow(row);
      if (draft === undefined || subject === undefined) {
        return { row: committed };
      }
      const variableId = asString(row[variableField]) ?? '';
      if (variableId === '') return { row: committed };

      const held = variablesForSubject(protocolContext, subject)[variableId];
      const outcome = await setOptions(
        subject,
        variableId,
        optionsForShape(
          optionsShapeFor(held?.type, held && Reflect.get(held, 'component')),
          draft,
          held === undefined ? undefined : Reflect.get(held, 'options'),
        ),
      );
      return outcome.status === 'refused'
        ? { refused: { fieldErrors: { [optionsField]: outcome.message } } }
        : { row: committed };
    },
    [optionsField, protocolContext, setOptions, subjectForRow, variableField],
  );
}

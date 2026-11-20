import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedInputField } from '../../fields/LocalizedStringField.tsx';
import type {
  RowEditorProps,
  RowPreviewProps,
  RowSaveContext,
  RowSaveOutcome,
  RowValues,
} from '../../form/rowDialog.tsx';
import { resolveTranslation } from '../../localization/localizedText.ts';
import { useLocalizedText } from '../../localization/ProtocolLocalization.tsx';

/**
 * A stand-in for one family's prompt fields.
 *
 * Deliberately plain: what these tests are about is the list around the row —
 * its identity, its ordering, its rule that a stage must ask something — and a
 * row editor that did anything clever would make a failure ambiguous between
 * the shared machinery and the family's own fields.
 *
 * The controls are `Field`s, because the row dialog mounts a form
 * store of its own and seeds it from the row it opened on. A field bound to
 * the stage's form would register the row's cells against the STAGE, which is
 * exactly what the array primitives exist to avoid: a deleted row's dormant
 * value resurrecting itself on save.
 */
export function TestPromptEditor({ item, editIndex, form }: RowEditorProps) {
  return (
    <>
      {/* The three things the row dialog promises a family's fields, put on
          screen so a test can read them back. A row editor that could not see
          which row it was editing, or which form its own controls belong to,
          would be a contract nothing observes. */}
      <dl>
        <dt>Editing row</dt>
        <dd>{editIndex === undefined ? 'a new row' : String(editIndex)}</dd>
        <dt>Row keys</dt>
        <dd>{Object.keys(item).toSorted().join(', ')}</dd>
        <dt>Editor form</dt>
        <dd>{form}</dd>
      </dl>
      <Field
        name="text"
        label="Prompt text"
        component={LocalizedInputField}
        required="Enter the question this prompt asks."
      />
      <Field
        name="negativeLabel"
        label="Negative label"
        component={LocalizedInputField}
      />
    </>
  );
}

export function TestPromptPreview({ item }: RowPreviewProps) {
  const localize = useLocalizedText();
  const text = localize(item.text).text;
  return (
    <span>
      {text === '' ? 'Empty prompt' : text}
      {/* The list's own presentation flag is not part of the row, so a
          preview that can see it is being handed something the stage document
          does not hold. */}
      {Object.hasOwn(item, 'sortable') ? ' [sortable leaked]' : ''}
    </span>
  );
}

/**
 * A family's row editor with a defect in it.
 *
 * The shared list field mounts fields this package did not write, so one of
 * them throwing is a real failure mode rather than a hypothetical — a picker
 * reading a codebook variable that has been deleted, say. What the tests using
 * this are about is what the researcher is left with when it happens.
 */
export function ExplodingRowEditor(): never {
  throw new Error('The row editor could not be rendered.');
}

const isRow = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The question the shared fixture protocol's name generator already asks. */
export const SEEDED_QUESTION = 'Who are the people you know?';

const textOf = (value: unknown): string =>
  isRow(value) ? resolveTranslation(value.text, undefined, undefined).text : '';

/**
 * A family's own rule about one prompt, checked when its dialog is submitted.
 *
 * The shape only a save-time gate can serve: it needs the whole row AND the row
 * as the dialog opened on it, because asking the same question twice is a
 * refusal while the prompt that already asks it is not asking it twice.
 */
export const refuseADuplicateQuestion = (
  values: RowValues,
  context: RowSaveContext,
): RowSaveOutcome => {
  const asked = textOf(values).trim();
  if (asked !== SEEDED_QUESTION || textOf(context.openedOn) === asked) {
    return { row: values };
  }
  return {
    refused: { fieldErrors: { text: 'Another prompt already asks this.' } },
  };
};

/**
 * A family's own collapse of a saved prompt.
 *
 * Composed with the section's own rule rather than replacing it, so it does
 * only the part that the field owning the list can decide: the shared rule
 * keeps an empty array, because it cannot tell "emptied on purpose" from
 * "never used", and a prompt that assigns nothing should carry no key at all
 * rather than an empty one.
 */
export function dropUnusedAssignments(row: unknown): unknown {
  if (!isRow(row)) return row;
  const assigned = row.additionalAttributes;
  if (!Array.isArray(assigned) || assigned.length > 0) return row;
  const { additionalAttributes: _unused, ...rest } = row;
  return rest;
}

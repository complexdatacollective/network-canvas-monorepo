import { expect, type Locator } from '@playwright/test';

import { inventAttributeInFieldDialog } from './forms.js';
import { type OptionRow } from './variables.js';

// Extended form-field authoring — the full-parameter sibling of forms.ts's
// minimal `addFormField`. Both drive `@codaco/protocol-builder`'s
// `FormFieldsSection`; this one also reaches the CODEBOOK editors the field
// dialog launches, which is where an attribute's values, its settings and its
// rules are authored now.
//
// The shape of the interaction, read off the source:
//
// - A form field row says which attribute it collects and how it asks for it.
//   Everything ABOUT the attribute — its values, what its control accepts, the
//   rules an answer must satisfy — belongs to the codebook and is reached
//   through `AttributeCodebookControls`, rendered inside the row dialog as a
//   row of buttons named for what they open.
// - Those buttons are offered against an attribute that EXISTS. While one is
//   still being invented the row holds a sentinel, so `Set rules for this
//   answer` and `Set what this field accepts` are not on screen at all — which
//   is why anything beyond values and scale labels needs the field to be added
//   first and then reopened. See `addConfiguredFormField`'s two phases.
// - "Create this attribute and its values" / "Create this attribute and what
//   it accepts" are the exception: a list of answers and a scale cannot be
//   made from a name, so those two are authored during creation (forms.ts's
//   `inventAttributeInFieldDialog`, through `inEditor`).

export type BooleanOptionSpec = {
  /** The words this answer shows the participant. */
  label: string;
  // 'omit' → leave the switch where the editor put it; otherwise require it
  // to end up in the named state.
  negative: 'omit' | boolean;
};

export type FormFieldSpec = {
  variableName: string;
  promptText: string;
  /** A `CONTROL_LABELS` label — see forms.ts's `VARIABLE_TYPE_FOR_CONTROL`. */
  inputControl: string;
  /** Only where the control does not already say it. */
  variableType?: string;
  options?: OptionRow[];
  booleanOptions?: { positive: BooleanOptionSpec; negative: BooleanOptionSpec };
  scalarParameters?: { minLabel: string; maxLabel: string };
  dateMin?: string;
  required?: boolean;
};

/**
 * Open the rules a participant's answer has to satisfy, for the attribute the
 * given form-field dialog collects, and hand back the editor.
 *
 * The rules used to be a section of the field dialog itself. They are the
 * CODEBOOK's — one attribute is checked the same way wherever it is asked for
 * — so they now live behind this button, in an editor of their own
 * (`CodebookVariableValidationEditor`) whose own submit reads "Save
 * validation". The button is offered only for an attribute that already
 * exists, which is what makes this reachable from a reopened field and not
 * from the dialog that invents one.
 */
export async function openValidationSection(dialog: Locator): Promise<Locator> {
  const label = 'Set rules for this answer';
  await dialog.getByRole('button', { name: label, exact: true }).click();
  // The editor takes the button's own words as its title
  // (`AttributeCodebookControls`'s `editorTitle`), which is what tells it from
  // the field dialog underneath while both are open.
  const rules = dialog.page().getByRole('dialog', { name: label, exact: true });
  await expect(rules).toBeVisible();
  return rules;
}

/**
 * Fill an attribute editor's list of allowed values.
 *
 * `VariableEditor`'s own rows, not the array field forms use elsewhere: each
 * row is a pair of plain inputs named "Option {n} label" / "Option {n} value"
 * (1-based), and "Add option" appends an empty one. Nothing is committed until
 * the editor's own submit, so the rows are filled in one pass.
 */
async function fillCodebookOptions(
  editor: Locator,
  rows: readonly OptionRow[],
): Promise<void> {
  const add = editor.getByRole('button', { name: 'Add option', exact: true });
  for (const [index, row] of rows.entries()) {
    await add.click();
    const position = index + 1;
    await editor
      .getByRole('textbox', { name: `Option ${position} label`, exact: true })
      .fill(row.label);
    await editor
      .getByRole('textbox', { name: `Option ${position} value`, exact: true })
      .fill(row.value);
  }
}

/**
 * One of a yes/no attribute's two answers.
 *
 * `records` is the value the answer stores — the editor names its controls for
 * that rather than for a position, because which of the two reads as "yes" is
 * the researcher's to write. The quotation marks in those names are the
 * typographic pair the catalog uses (`VariableBooleanAnswerFields`'s
 * `answerLabel`/`negativeLabel`), not the ASCII one.
 */
async function setBooleanAnswer(
  editor: Locator,
  records: 'true' | 'false',
  spec: BooleanOptionSpec,
): Promise<void> {
  await editor
    .getByRole('textbox', {
      name: `Label for “${records}”`,
      exact: true,
    })
    .fill(spec.label);
  if (spec.negative === 'omit') return;
  const negative = editor.getByRole('switch', {
    name: `Style “${records}” as negative`,
    exact: true,
  });
  // Driven to a state rather than clicked a counted number of times: the
  // editor seeds these from the codebook, so a click count only lands on the
  // right answer for one starting position.
  if ((await negative.isChecked()) !== spec.negative) {
    await negative.click();
  }
  await expect(negative).toBeChecked({ checked: spec.negative });
}

/** Open a codebook editor from a field dialog, run `fill`, and save it. */
async function inCodebookEditor(
  dialog: Locator,
  label: string,
  fill: (editor: Locator) => Promise<void>,
): Promise<void> {
  await dialog.getByRole('button', { name: label, exact: true }).click();
  const editor = dialog
    .page()
    .getByRole('dialog', { name: label, exact: true });
  await fill(editor);
  await editor
    .getByRole('button', { name: 'Save attribute', exact: true })
    .click();
  await editor.waitFor({ state: 'detached' });
}

export async function addConfiguredFormField(
  section: Locator,
  spec: FormFieldSpec,
): Promise<void> {
  const page = section.page();

  // Phase one: the row, and everything the attribute cannot exist without.
  await section
    .getByRole('button', { name: 'Create new form field', exact: true })
    .click();
  const addDialog = page.getByRole('dialog', { name: 'Create form field' });
  await inventAttributeInFieldDialog(addDialog, {
    variableName: spec.variableName,
    ...(spec.variableType === undefined
      ? {}
      : { variableType: spec.variableType }),
    inputControl: spec.inputControl,
    inEditor: async (editor) => {
      if (spec.options) await fillCodebookOptions(editor, spec.options);
      if (spec.scalarParameters) {
        await editor
          .getByRole('textbox', { name: 'Minimum label', exact: true })
          .fill(spec.scalarParameters.minLabel);
        await editor
          .getByRole('textbox', { name: 'Maximum label', exact: true })
          .fill(spec.scalarParameters.maxLabel);
      }
    },
  });

  const prompt = addDialog.getByRole('textbox', { name: 'Question text' });
  await prompt.click();
  await prompt.fill(spec.promptText);
  await addDialog.getByRole('button', { name: 'Add', exact: true }).click();
  // Full unmount, not just hidden: phase two reopens the same dialog, and the
  // row's own Edit control is behind this one until it has gone.
  await addDialog.waitFor({ state: 'detached' });

  const needsSecondPass =
    spec.booleanOptions !== undefined ||
    spec.dateMin !== undefined ||
    spec.required === true;
  if (!needsSecondPass) return;

  // Phase two: everything that is ABOUT an attribute, and so is only offered
  // once one exists. The row just added is the last in the list.
  await section
    .getByRole('button', { name: 'Edit field', exact: true })
    .last()
    .click();
  const editDialog = page.getByRole('dialog', { name: 'Edit form field' });
  await expect(editDialog).toBeVisible();

  const booleanOptions = spec.booleanOptions;
  if (booleanOptions) {
    await inCodebookEditor(
      editDialog,
      'Change this attribute’s answer labels',
      async (editor) => {
        await setBooleanAnswer(editor, 'true', booleanOptions.positive);
        await setBooleanAnswer(editor, 'false', booleanOptions.negative);
      },
    );
  }

  const dateMin = spec.dateMin;
  if (dateMin) {
    await inCodebookEditor(
      editDialog,
      'Set what this field accepts',
      async (editor) => {
        await editor
          .getByRole('textbox', { name: 'Earliest date', exact: true })
          .fill(dateMin);
      },
    );
  }

  if (spec.required) {
    const rules = await openValidationSection(editDialog);
    await rules
      .getByRole('checkbox', { name: 'Required', exact: true })
      .check();
    await rules
      .getByRole('button', { name: 'Save validation', exact: true })
      .click();
    await rules.waitFor({ state: 'detached' });
  }

  await editDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await editDialog.waitFor({ state: 'detached' });
}

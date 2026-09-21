import { expect, type Locator } from '@playwright/test';

import { writeRichText } from '../rich-text.js';
import { inventAttributeInFieldDialog } from './forms.js';
import { type OptionRow } from './variables.js';

// Extended form-field authoring — the full-parameter sibling of forms.ts's
// minimal `addFormField`. Both drive `@codaco/protocol-builder`'s
// `FormFieldsSection`.

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
 * given form-field dialog collects, and hand back the section holding them.
 *
 * A nested, toggleable "Validation" section at the end of the field dialog, as
 * Architect had it (`sections/ValidationSection.tsx`) — not a dialog of its
 * own, and with no submit: the rules belong to the CODEBOOK attribute and each
 * answerable change is written to it as the researcher makes it. The section is
 * rendered only against an attribute that exists, which is what makes this
 * reachable from a reopened field and not from the dialog that invents one.
 *
 * Switched on if it is not already: an attribute that arrives carrying rules
 * has it open, and clicking then would clear them.
 */
export async function openValidationSection(dialog: Locator): Promise<Locator> {
  const label = 'Validation';
  const toggle = dialog.getByRole('switch', { name: label, exact: true });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
  }
  const rules = dialog.getByRole('region', { name: label, exact: true });
  await expect(rules).toBeVisible();
  return rules;
}

async function fillInlineOptions(
  dialog: Locator,
  rows: readonly OptionRow[],
): Promise<void> {
  const values = dialog.getByRole('region', {
    name: 'Choice values',
    exact: true,
  });
  for (const row of rows) {
    await values
      .getByRole('button', { name: 'Create new option', exact: true })
      .click();
    await writeRichText(
      values.getByRole('textbox', { name: 'Label', exact: true }),
      row.label,
    );
    await values
      .getByRole('textbox', { name: 'Value', exact: true })
      .fill(row.value);
    await values
      .getByRole('button', { name: 'Finish editing option', exact: true })
      .click();
  }
}

function controlSettings(dialog: Locator): Locator {
  return dialog.getByRole('region', { name: 'Control settings', exact: true });
}

/**
 * One of a yes/no attribute's two answers.
 *
 * `records` is the value the answer stores — the editor names its controls for
 * that rather than for a position, because which of the two reads as "yes" is
 * the researcher's to write. The quotation marks in those names are the
 * typographic pair the catalog uses (`VariableBooleanAnswerFields`'s
 * `answerLabel`/`negativeLabel`), not the ASCII one.
 *
 * Takes whichever surface holds the pair — the row's own dialog, or the
 * codebook editor — because the same fieldset is rendered in both.
 *
 * The words are markdown, and the sample protocol's consent answers are the
 * reason it matters: they read `**Yes**. I wish to participate…`, so the
 * emphasis has to be typed into the box for the protocol to hold a bold run
 * rather than four escaped asterisks.
 */
async function setBooleanAnswer(
  editor: Locator,
  records: 'true' | 'false',
  spec: BooleanOptionSpec,
): Promise<void> {
  await writeRichText(
    editor.getByRole('textbox', {
      name: `Label for “${records}”`,
      exact: true,
    }),
    spec.label,
  );
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
    inRow: async (dialog) => {
      if (spec.options) await fillInlineOptions(dialog, spec.options);
      if (spec.scalarParameters) {
        const settings = controlSettings(dialog);
        await settings
          .getByRole('textbox', { name: 'Minimum label', exact: true })
          .fill(spec.scalarParameters.minLabel);
        await settings
          .getByRole('textbox', { name: 'Maximum label', exact: true })
          .fill(spec.scalarParameters.maxLabel);
      }
      if (spec.dateMin !== undefined) {
        await controlSettings(dialog)
          .getByRole('textbox', { name: 'Earliest date', exact: true })
          .fill(spec.dateMin);
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
    spec.booleanOptions !== undefined || spec.required === true;
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
    // Authored in the ROW's own dialog rather than through a codebook editor
    // opened from it: the words on a yes-or-no attribute's two answers are
    // shown beside the question that asks them (`AttributeValueFields`), and
    // the row's own save is what records them on the attribute.
    await setBooleanAnswer(editDialog, 'true', booleanOptions.positive);
    await setBooleanAnswer(editDialog, 'false', booleanOptions.negative);
  }

  if (spec.required) {
    const rules = await openValidationSection(editDialog);
    const required = rules.getByRole('switch', {
      name: 'Required answer',
      exact: true,
    });
    await required.click();
    // The switch carries the rule, and the section writes it to the codebook
    // as it moves — there is no submit to wait for, so what says the gesture
    // landed is the switch holding it.
    await expect(required).toBeChecked();
  }

  await editDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await editDialog.waitFor({ state: 'detached' });
}

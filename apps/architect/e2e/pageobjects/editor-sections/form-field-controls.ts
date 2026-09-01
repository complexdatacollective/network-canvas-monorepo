import { expect, type Locator, type Page } from '@playwright/test';

import { typeInlineRun } from '../stage-editor.js';
import {
  createVariableViaSpotlight,
  fillOptionRows,
  type OptionRow,
} from './variables.js';

// Extended form-field authoring for the 'Edit Field' dialog
// (sections/Form/FieldFields.tsx) — the full-parameter sibling of forms.ts's
// minimal addFormField. Facts verified against source:
// - The codebook variable is created ONLY at dialog submit
//   (withFormHandlers.handleChangeFields → createVariableAsync), assembled
//   from the chosen Input control's derived type plus whatever
//   options/parameters/validation the dialog holds — configure everything
//   BEFORE clicking 'Add', and pick the Input control before options/
//   parameters/validation (a component change nulls all three).
// - 'Input control' is a native select (labels from config/variables.ts:
//   'Text Input', 'Text Area', 'DatePicker', 'Toggle Button Group',
//   'Radio Group', 'LikertScale', 'VisualAnalogScale', 'Checkbox Group',
//   'BooleanChoice', …).
// - DatePicker writes parameters:{type:'full'} by default (mount effect);
//   'Start range' is a native date input reached via getByLabel.
// - VisualAnalogScale exposes required 'Minimum label'/'Maximum label'
//   plain inputs.
// - BooleanChoice seeds options [{label:'Yes',value:true},
//   {label:'No',value:false,negative:true}]; labels are block RichText
//   fields both named 'Label' (scoped via their data-field-name); the
//   negative switches are 'Style Option One as negative' / 'Style Option
//   Two as negative'. A toggle click writes the boolean explicitly and the
//   key can never be removed once written — so: omit → never touch,
//   explicit false on option one → click twice (on→off), explicit false on
//   option two → click once (its default is true).
// - Field dialogs keep validation in an optional Section. Open that Section
//   before interacting with an individual rule such as 'Required'.
export type BooleanOptionSpec = {
  label: string;
  // 'omit' → never touch the toggle (option one only — option two defaults
  // to true); true → leave option two untouched; false → explicit false.
  negative: 'omit' | boolean;
};

export type FormFieldSpec = {
  variableName: string;
  promptText: string;
  inputControl: string;
  options?: OptionRow[];
  booleanOptions?: { positive: BooleanOptionSpec; negative: BooleanOptionSpec };
  scalarParameters?: { minLabel: string; maxLabel: string };
  dateMin?: string;
  required?: boolean;
};

export async function openValidationSection(dialog: Locator): Promise<void> {
  const toggle = dialog.getByRole('switch', {
    name: 'Validation',
    exact: true,
  });
  if (!(await toggle.isChecked())) {
    await toggle.click();
  }
  await expect(toggle).toBeChecked();
}

async function replaceRichTextContent(
  page: Page,
  editorBox: Locator,
  text: string,
): Promise<void> {
  await editorBox.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await typeInlineRun(page, text);
}

async function setBooleanOption(
  page: Page,
  dialog: Locator,
  index: 0 | 1,
  spec: BooleanOptionSpec,
): Promise<void> {
  await replaceRichTextContent(
    page,
    dialog
      .locator(`[data-field-name="options[${index}].label"]`)
      .getByRole('textbox'),
    spec.label,
  );
  const toggleName =
    index === 0
      ? 'Style Option One as negative'
      : 'Style Option Two as negative';
  if (index === 0) {
    if (spec.negative === false) {
      // Defaults to no key; on→off writes an explicit false.
      await dialog.getByRole('switch', { name: toggleName }).click();
      await dialog.getByRole('switch', { name: toggleName }).click();
    } else if (spec.negative === true) {
      await dialog.getByRole('switch', { name: toggleName }).click();
    }
  } else {
    // Option two defaults to negative: true.
    if (spec.negative === false) {
      await dialog.getByRole('switch', { name: toggleName }).click();
    } else if (spec.negative === 'omit') {
      throw new Error('option two always carries a negative key (seeded true)');
    }
  }
}

export async function addConfiguredFormField(
  section: Locator,
  spec: FormFieldSpec,
): Promise<void> {
  const page = section.page();
  const dialog = page.getByRole('dialog', { name: 'Edit Field' });

  const create = section.getByRole('button', {
    name: 'Create new form field',
    exact: true,
  });
  await create.click();
  // Fresh-dialog guard (see prompts.ts): a genuinely new field dialog shows
  // the unset variable picker. If the shared dialog form resurrected the
  // previous field's state, cancel — forcing the unmount that destroys the
  // form — and reopen.
  const freshSign = dialog.getByRole('button', { name: 'Select attribute' });
  try {
    await freshSign.waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await cancel.click();
    await cancel.waitFor({ state: 'detached' });
    await create.click();
    await freshSign.waitFor({ state: 'visible' });
  }
  await createVariableViaSpotlight(page, {
    variableName: spec.variableName,
    until: dialog.getByRole('button', { name: 'Change attribute' }),
  });

  const prompt = page.getByRole('textbox', { name: 'Question text' });
  await prompt.click();
  await prompt.fill(spec.promptText);

  await page
    .getByLabel('Input control')
    .selectOption({ label: spec.inputControl });

  if (spec.options) {
    await fillOptionRows(dialog, spec.options);
  }

  if (spec.booleanOptions) {
    await setBooleanOption(page, dialog, 0, spec.booleanOptions.positive);
    await setBooleanOption(page, dialog, 1, spec.booleanOptions.negative);
  }

  if (spec.scalarParameters) {
    await page
      .getByRole('textbox', { name: 'Minimum label' })
      .fill(spec.scalarParameters.minLabel);
    await page
      .getByRole('textbox', { name: 'Maximum label' })
      .fill(spec.scalarParameters.maxLabel);
  }

  if (spec.dateMin) {
    await page.getByLabel('Start range').fill(spec.dateMin);
  }

  if (spec.required) {
    await openValidationSection(dialog);
    await dialog.getByRole('switch', { name: 'Required', exact: true }).click();
  }

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  // Full unmount, not just hidden: the shared 'editable-list-form' dialog
  // form never reinitializes while mounted (see prompts.ts) — a
  // back-to-back field add would otherwise reuse this field's values/id.
  await dialog.waitFor({ state: 'detached' });
}

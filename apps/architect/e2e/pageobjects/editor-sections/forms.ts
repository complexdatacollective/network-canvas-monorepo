import { type Locator } from '@playwright/test';

import { createAttribute } from './variables.js';

// AlterForm/AlterEdgeForm/EgoForm's `form.fields` array is authored by
// `@codaco/protocol-builder`'s `FormFieldsSection`
// (`sections/form-fields/FormFieldsSection.tsx`). The section is titled "Form
// fields" and its add button names what it adds — "Create new form field" —
// so a stage showing two lists at once (a name generator shows this one and
// its prompts) keeps them apart.
//
// Takes the enclosing section `Locator` (`editor.section('Form configuration')`)
// rather than the Page, and scopes the OPEN click to it, so the helper stays
// honest about which list it is driving. The dialog it opens is a page-level
// portal, so everything after that is reached through `section.page()` and
// scoped by the dialog's own accessible name instead.
export async function openFormFieldDialog(section: Locator): Promise<Locator> {
  const page = section.page();
  await section
    .getByRole('button', { name: 'Create new form field', exact: true })
    .click();
  // A brand-new row's dialog is titled "Create form field"; the same dialog
  // reads "Edit form field" for a row that already exists (`rowDialog.tsx`'s
  // `addTitle`/`editTitle`). Naming it here is what makes the fields below
  // unambiguous without a second scope.
  return page.getByRole('dialog', { name: 'Create form field' });
}

/**
 * The half of the field dialog that shows the question as the participant will
 * meet it.
 *
 * A named region (`FieldPreviewPane`), beside the named form the settings are
 * in — so a test reading the preview and a test filling in the settings cannot
 * reach each other's controls, which matters because the two render the same
 * roles: a question box on the left and the box that answers it on the right.
 */
export function fieldPreview(dialog: Locator): Locator {
  return dialog.getByRole('region', { name: 'Interactive preview' });
}

/**
 * The other half: the field's own settings.
 *
 * Scope every settings control to this rather than to the dialog, wherever the
 * control the participant answers with is of the same kind as a control the
 * researcher fills in — a slider, a date box, a set of options. Both halves
 * are on screen at once, and an unscoped query would resolve to two elements.
 */
export function fieldSettings(dialog: Locator): Locator {
  return dialog.getByRole('form', { name: 'Configuration' });
}

/** Authors one whole form field, from an attribute that does not exist yet. */
export async function addFormField(
  section: Locator,
  opts: {
    variableName: string;
    promptText: string;
    /** A `TYPE_OPTIONS` label. Derived from `inputControl` when absent. */
    variableType?: string;
    /** A `CONTROL_LABELS` label allowed for that type. */
    inputControl?: string;
  },
): Promise<void> {
  const dialog = await openFormFieldDialog(section);
  await inventAttributeInFieldDialog(dialog, opts);
  const prompt = dialog.getByRole('textbox', { name: 'Question text' });
  await prompt.click();
  await prompt.fill(opts.promptText);
  // "Add" for a new row, "Save" for an existing one (`rowDialog.tsx`:
  // `session.isNewItem ? messages.addSubmit : commonMessages.save`).
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  // Full unmount, not just hidden: the next add reopens the same dialog, and
  // a stale one still on screen would take the next helper's clicks.
  await dialog.waitFor({ state: 'detached' });
}

/**
 * Which kind of answer an input control collects.
 *
 * Not a guess and not a shortcut: `VARIABLE_TYPE_COMPONENTS`
 * (protocol-validation's schema module) lists the controls each type may be
 * rendered with, and every control appears under exactly ONE type — so a
 * caller that has said which control the participant answers with has already
 * said what the attribute holds, and asking again would only create a second
 * place for the two to disagree.
 *
 * Keys are the researcher-facing control names (`collectableTypes.ts`'s
 * `CONTROL_LABELS`); values are the type names the dialog uses
 * (`variableTypeLabels.ts`'s `VARIABLE_TYPE_OPTIONS`). `layout` and `location`
 * are absent from both: they hold a position rather than an answer.
 */
const VARIABLE_TYPE_FOR_CONTROL: Readonly<Record<string, string>> = {
  'Text Input': 'Text',
  'Text Area': 'Text',
  'Number Input': 'Number',
  'Boolean Choice': 'Boolean',
  'Toggle': 'Boolean',
  'Radio Group': 'Ordinal',
  'Likert Scale': 'Ordinal',
  'Checkbox Group': 'Categorical',
  'Toggle Button Group': 'Categorical',
  'Visual Analog Scale': 'Scalar',
  'Date Picker': 'Date',
  'Relative Date Picker': 'Date',
};

export type InventAttributeOptions = {
  variableName: string;
  variableType?: string;
  inputControl?: string;
  inRow?: (dialog: Locator) => Promise<void>;
};

/**
 * Fill in the codebook half of an open form-field dialog: an attribute that
 * does not exist yet, and the control the participant answers it with.
 *
 * `FormFieldEditor` (`sections/form-fields/FormFieldsSection.tsx`) asks which
 * attribute the answer is recorded under through the attribute picker
 * (`fields/VariablePickerField.tsx`), and passes it an `onCreateOption` — so
 * inventing one here is the window's own create row, taken on the name typed
 * into its search box. The row decides nothing and promises everything: it
 * writes the name onto the field row and closes the window, and what is left
 * to ask appears underneath.
 *
 * The dialog asks for no kind of answer: "Input control" is the only question,
 * and the kind follows from it. It opens on its placeholder, so it is always
 * selected here rather than merely confirmed.
 *
 * Nothing reaches the codebook until something is submitted: the row carries
 * `_newVariableName`/`_component` and `useCommitFormField` turns them into the
 * attribute when the ROW is saved.
 */
export async function inventAttributeInFieldDialog(
  dialog: Locator,
  opts: InventAttributeOptions,
): Promise<void> {
  const inputControl = opts.inputControl ?? 'Text Input';
  const variableType =
    opts.variableType ?? VARIABLE_TYPE_FOR_CONTROL[inputControl];
  if (variableType === undefined) {
    throw new Error(
      `No codebook type is known for the input control "${inputControl}". Use one of the labels in CONTROL_LABELS (packages/protocol-builder/src/sections/collectableTypes.ts), or pass variableType.`,
    );
  }

  // Addressed by the field's own name rather than by its label: "Attribute" is
  // also the heading of the dialog's first Section and the prefix of
  // "Attribute name".
  //
  // `createAttribute` rather than a choose-or-create: this helper's whole job
  // is to INVENT, and a name the subject already holds has to fail here rather
  // than quietly bind the attribute that was already there and leave the
  // controls below unanswered.
  await createAttribute(
    dialog.locator('[data-field-name="variable"]'),
    opts.variableName,
  );
  const control = dialog.getByRole('combobox', {
    name: 'Input control',
    exact: true,
  });
  await control.selectOption({ label: inputControl });
  await opts.inRow?.(dialog);
}

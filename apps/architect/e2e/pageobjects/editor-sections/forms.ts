import { type Locator } from '@playwright/test';

// AlterForm/AlterEdgeForm/EgoForm's `form.fields` array is authored by
// `@codaco/protocol-builder`'s `FormFieldsSection`
// (`sections/form-fields/FormFieldsSection.tsx`). The section is titled "Form
// fields" and its add button names what it adds — "Create new form field" —
// so a stage showing two lists at once (a name generator shows this one and
// its prompts) keeps them apart.
//
// Takes the enclosing section `Locator` (`editor.section('Form fields')`)
// rather than the Page, and scopes the OPEN click to it, so the helper stays
// honest about which list it is driving. The dialog it opens is a page-level
// portal, so everything after that is reached through `section.page()` and
// scoped by the dialog's own accessible name instead.
export async function addFormField(
  section: Locator,
  opts: {
    variableName: string;
    promptText: string;
    /** A `TYPE_OPTIONS` label — the codebook type the new attribute holds. */
    variableType?: string;
    /** A `CONTROL_LABELS` label allowed for that type. */
    inputControl?: string;
  },
): Promise<void> {
  const page = section.page();
  await section
    .getByRole('button', { name: 'Create new form field', exact: true })
    .click();
  // A brand-new row's dialog is titled "Create form field"; the same dialog
  // reads "Edit form field" for a row that already exists (`rowDialog.tsx`'s
  // `addTitle`/`editTitle`). Naming it here is what makes the fields below
  // unambiguous without a second scope.
  const dialog = page.getByRole('dialog', { name: 'Create form field' });
  await inventAttribute(dialog, opts);
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
 * Fill in the codebook half of an open form-field dialog: an attribute that
 * does not exist yet, and the control the participant answers it with.
 *
 * There is no attribute search here. `FormFieldEditor` (same file) asks which
 * attribute the answer is recorded under through a native `<select>`
 * (`fields/VariablePickerField.tsx` -> fresco-ui's `NativeSelectField`, so
 * `selectOption` drives it directly) listing the subject's collectable
 * codebook attributes plus one sentinel option, "Create a new attribute…".
 * Choosing that option IS the request to invent one, and it reveals the two
 * things a name alone cannot supply:
 *
 * - "Kind of answer" — the codebook type (`TYPE_OPTIONS`), asked first
 *   because it decides what else the attribute needs; and
 * - "Attribute name" — what the codebook and the exported data call it.
 *
 * "Input control" then lists only the controls that type allows
 * (`collectableTypes.ts`'s `controlsForType`) and arrives already showing the
 * first of them, so it is selected explicitly only to say which one is meant.
 *
 * Only for a kind of answer a name and a type finish. A list of answers
 * (categorical, ordinal) or a scale carries something a name cannot —
 * `needsCodebookEditorToCreate` — and the dialog replaces "Attribute name"
 * with the codebook editor's own button for those, which is a different flow.
 *
 * Nothing is written to the codebook until the dialog is submitted: the row
 * carries `_newVariableType`/`_newVariableName`/`_component` as its own
 * fields and `useCommitFormField` turns them into the attribute, which is why
 * every control above has to be answered before "Add" rather than after.
 */
async function inventAttribute(
  dialog: Locator,
  opts: {
    variableName: string;
    variableType?: string;
    inputControl?: string;
  },
): Promise<void> {
  // `exact: true` on every name: "Attribute" is also the heading of the
  // dialog's first Section and the prefix of "Attribute name", and a
  // substring match would resolve to more than one control.
  await dialog
    .getByRole('combobox', { name: 'Attribute', exact: true })
    .selectOption({ label: 'Create a new attribute…' });
  await dialog
    .getByRole('combobox', { name: 'Kind of answer', exact: true })
    .selectOption({ label: opts.variableType ?? 'Text' });
  await dialog
    .getByRole('textbox', { name: 'Attribute name', exact: true })
    .fill(opts.variableName);
  await dialog
    .getByRole('combobox', { name: 'Input control', exact: true })
    .selectOption({ label: opts.inputControl ?? 'Text input' });
}

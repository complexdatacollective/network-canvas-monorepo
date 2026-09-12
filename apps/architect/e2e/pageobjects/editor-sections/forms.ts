import { type Locator } from '@playwright/test';

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
 * `CONTROL_LABELS`); values are the type names the "Kind of answer" control
 * offers (`variableTypeLabels.ts`'s `VARIABLE_TYPE_OPTIONS`). `layout` and
 * `location` are absent from both: they hold a position rather than an answer
 * and no form can ask for one.
 */
const VARIABLE_TYPE_FOR_CONTROL: Readonly<Record<string, string>> = {
  'Text input': 'Text',
  'Text area': 'Text',
  'Number input': 'Number',
  'Yes or no buttons': 'Boolean',
  'Toggle': 'Boolean',
  'Radio group': 'Ordinal',
  'Likert scale': 'Ordinal',
  'Checkbox group': 'Categorical',
  'Toggle button group': 'Categorical',
  'Visual analogue scale': 'Scalar',
  'Date picker': 'Date',
  'Relative date picker': 'Date',
};

/**
 * The kinds of answer a name and a type alone cannot finish, so the dialog
 * sends the researcher to the codebook's own editor to invent one.
 *
 * `needsCodebookEditorToCreate` (`collectableTypes.ts`) decides this in the
 * app: a list of answers IS its values, which the schema refuses fewer than
 * two of, and a scale IS the two labels saying which end is which.
 */
const NEEDS_CODEBOOK_EDITOR = new Set(['Categorical', 'Ordinal', 'Scalar']);

/** The button that opens that editor, which is named for what it creates. */
const createInEditorLabel = (variableType: string): string =>
  variableType === 'Scalar'
    ? 'Create this attribute and what it accepts'
    : 'Create this attribute and its values';

export type InventAttributeOptions = {
  variableName: string;
  variableType?: string;
  inputControl?: string;
  /**
   * Fills in whatever the codebook editor asks for beyond a name — the values
   * of a list, the two ends of a scale. Called with the editor dialog, after
   * its "Attribute name" is filled and before "Create attribute" is pressed.
   * Only reached for the types in `NEEDS_CODEBOOK_EDITOR`.
   */
  inEditor?: (editor: Locator) => Promise<void>;
};

/**
 * Fill in the codebook half of an open form-field dialog: an attribute that
 * does not exist yet, and the control the participant answers it with.
 *
 * There is no attribute search here. `FormFieldEditor`
 * (`sections/form-fields/FormFieldsSection.tsx`) asks which attribute the
 * answer is recorded under through a native `<select>`
 * (`fields/VariablePickerField.tsx` -> fresco-ui's `NativeSelectField`, so
 * `selectOption` drives it directly) listing the subject's collectable
 * codebook attributes plus one sentinel option, "Create a new attribute…".
 * Choosing that option IS the request to invent one, and it reveals:
 *
 * - "Kind of answer" — the codebook type, asked first because it decides what
 *   else the attribute needs; and then either
 * - "Attribute name", for a kind a name finishes, or
 * - the codebook editor's own button, for a kind it does not.
 *
 * "Input control" lists only the controls that type allows and arrives already
 * showing the first of them, so selecting it says which one is meant rather
 * than supplying a value the field would otherwise lack.
 *
 * Nothing reaches the codebook until something is submitted: for a kind a name
 * finishes, the row carries `_newVariableType`/`_newVariableName`/`_component`
 * and `useCommitFormField` turns them into the attribute when the ROW is
 * saved; for the others, the editor's own "Create attribute" writes it and the
 * row is then pointed at what it made.
 */
export async function inventAttributeInFieldDialog(
  dialog: Locator,
  opts: InventAttributeOptions,
): Promise<void> {
  const page = dialog.page();
  const inputControl = opts.inputControl ?? 'Text input';
  const variableType =
    opts.variableType ?? VARIABLE_TYPE_FOR_CONTROL[inputControl];
  if (variableType === undefined) {
    throw new Error(
      `No codebook type is known for the input control "${inputControl}". Use one of the labels in CONTROL_LABELS (packages/protocol-builder/src/sections/collectableTypes.ts), or pass variableType.`,
    );
  }

  // `exact: true` on every name: "Attribute" is also the heading of the
  // dialog's first Section and the prefix of "Attribute name", and a
  // substring match would resolve to more than one control.
  await dialog
    .getByRole('combobox', { name: 'Attribute', exact: true })
    .selectOption({ label: 'Create a new attribute…' });
  await dialog
    .getByRole('combobox', { name: 'Kind of answer', exact: true })
    .selectOption({ label: variableType });

  if (NEEDS_CODEBOOK_EDITOR.has(variableType)) {
    const openLabel = createInEditorLabel(variableType);
    await dialog.getByRole('button', { name: openLabel, exact: true }).click();
    // The editor is a dialog of its own, over the row's, and it takes the
    // button's own words as its title (`AttributeCodebookControls`'s
    // `editorTitle`) — which is what tells the two apart while both are open.
    const editor = page.getByRole('dialog', { name: openLabel, exact: true });
    await editor
      .getByRole('textbox', { name: 'Attribute name', exact: true })
      .fill(opts.variableName);
    await opts.inEditor?.(editor);
    await editor
      .getByRole('button', { name: 'Create attribute', exact: true })
      .click();
    // The attribute has to EXIST before the row's own controls are driven:
    // "Input control" is derived from the attribute the row now points at,
    // and it is not on screen at all while one is still being invented.
    await editor.waitFor({ state: 'detached' });
  } else {
    await dialog
      .getByRole('textbox', { name: 'Attribute name', exact: true })
      .fill(opts.variableName);
  }

  await dialog
    .getByRole('combobox', { name: 'Input control', exact: true })
    .selectOption({ label: inputControl });
}

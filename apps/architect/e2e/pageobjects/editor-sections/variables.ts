import { type Page } from '@playwright/test';

// VariableSpotlight (Form/Fields/VariablePicker/VariableSpotlight.tsx) is
// opened by VariablePickerControl's own button, whose text is
// `value ? 'Change variable' : 'Select variable'` (lower-case "variable" —
// the task brief's 'Select Variable' guess had the wrong case). The search
// box's real aria-label is `'Find or create a variable'` (verified
// character-for-character against VariableSpotlight.tsx), rendered on an
// `<InputField type="search" .../>` — a native `type="search"` input's
// *implicit* ARIA role is `searchbox`, not `textbox` (confirmed live: Task
// 15's first real exercise of this helper timed out on
// `getByRole('textbox', ...)` even though the field was on screen and
// focused). Each result row carries `data-testid="spotlight-list-item"`;
// the row that creates a new variable reads `Create new variable called
// "${filterTerm}".`.
//
// This is the *simple* creation path: VariablePickerControl's
// `handleCreateOption` hands the typed name straight to the caller's
// `onCreateOption`, which for most pickers (e.g. NodeConfiguration's
// quick-add/layout variable, Form/FieldFields.tsx's `variable` field used by
// `addFormField` in forms.ts) either creates a plain variable directly or
// just stashes the name as a placeholder — no further dialog opens here. For
// flows whose `onCreateOption` instead opens NewVariableWindow (ordinal /
// categorical pickers such as "Group hull variable" or the bin/tie-strength
// interfaces' locked-options pickers), use `createVariableWithOptions`
// below once that dialog is open.
export async function createVariableViaSpotlight(
  page: Page,
  opts: { variableName: string; buttonName?: string },
): Promise<void> {
  await page
    .getByRole('button', { name: opts.buttonName ?? 'Select variable' })
    .click();
  const search = page.getByRole('searchbox', {
    name: 'Find or create a variable',
  });
  await search.fill(opts.variableName);
  const createRow = page
    .getByTestId('spotlight-list-item')
    .filter({ hasText: 'Create new variable called' })
    .first();
  if (await createRow.count()) {
    await createRow.click();
  } else {
    // No exact "create" row (e.g. the typed name exactly matches an existing
    // option) — Enter selects the single filtered match
    // (VariableSpotlight.tsx's `handleInputKeyDown`).
    await search.press('Enter');
  }
}

// NewVariableWindow (components/NewVariableWindow/NewVariableWindow.tsx) is
// opened by callers whose picker wires `onCreateOption` to
// `openNewVariableWindow` (e.g. NodeConfiguration.tsx's "Group hull
// variable", CategoricalBinPrompts/OrdinalBinPrompts/TieStrengthCensusPrompts'
// locked-type pickers). This helper assumes that dialog is *already open*.
//
// "Variable name" and "Variable type" are the exact accessible names
// (NewVariableWindow.tsx's `Field`/`ValidatedField` `label`s, both
// `labelHidden`). "Variable type" is a Base UI `Select`
// (fresco-ui/form/fields/Select/Styled.tsx) rather than a native `<select>`,
// so it can't be driven with `selectOption` — its trigger has role
// "combobox" and each option role "option" (the same pattern already proven
// in `apps/interviewer/e2e/specs/settings.spec.ts`). Every call site
// discovered in source pre-locks the type via `initialValues.type`
// (NewVariableWindow.tsx disables the selector whenever `initialValues?.type`
// is set), so the combobox is often already showing the right value and
// disabled — only click through it when it's actually interactive.
//
// Options (components/Options/Options.tsx) only reveal once an
// ordinal/categorical type is set; "Add new" appends a row immediately
// (`immediateAdd`, no separate confirm step). Each row's Label field is
// itself a RichText/Tiptap control (components/Options/Option.tsx,
// `label: 'Label'`) — role "textbox" — and its Value field is a plain input
// named "Value"; both names repeat per row, hence `.nth(i)`.
export async function createVariableWithOptions(
  page: Page,
  opts: {
    variableName: string;
    options: string[];
    type?: 'ordinal' | 'categorical';
  },
): Promise<void> {
  await page
    .getByRole('textbox', { name: 'Variable name' })
    .fill(opts.variableName);

  const typeLabel = opts.type === 'ordinal' ? 'Ordinal' : 'Categorical';
  const typeCombobox = page.getByRole('combobox', { name: 'Variable type' });
  if (await typeCombobox.isEnabled()) {
    await typeCombobox.click();
    await page.getByRole('option', { name: typeLabel }).click();
  }

  for (const [index, optionLabel] of opts.options.entries()) {
    await page.getByRole('button', { name: 'Add new' }).click();
    await page
      .getByRole('textbox', { name: 'Label' })
      .nth(index)
      .fill(optionLabel);
    await page
      .getByRole('textbox', { name: 'Value' })
      .nth(index)
      .fill(optionLabel.toLowerCase());
  }

  await page.getByRole('button', { name: 'Save and Close' }).click();
}

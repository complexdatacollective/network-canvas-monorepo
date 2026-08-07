import { type Locator, type Page } from '@playwright/test';

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
//
// `opts.scope`: NodeConfiguration.tsx (NetworkComposer) renders three
// `VariablePicker`s at once (quickAdd/layoutVariable/convexHullVariable),
// each still showing the unselected-state "Select variable" button
// (VariablePicker.tsx: `value ? 'Change variable' : 'Select variable'`) — an
// unscoped `page.getByRole('button', { name: 'Select variable' })` hits all
// three and Playwright strict-mode throws. Pass the enclosing field's
// `Locator` (e.g. `editor.field('quickAdd')` — `data-field-name` seam, Task
// 2) to disambiguate the trigger click; the spotlight dialog itself is a
// page-level portal (not a descendant of that field), so everything after
// the click still resolves against `page`, same as the unscoped case.
export async function createVariableViaSpotlight(
  page: Page,
  opts: {
    variableName: string;
    buttonName?: string;
    scope?: Locator;
    // A locator that becomes visible once the pick/create actually took
    // effect (the picker's own 'Change variable' button for simple-create
    // pickers; the NewVariableWindow's 'Variable name' textbox for
    // locked-type pickers whose create path opens that window instead).
    // When set, the outcome is REQUIRED and the whole interaction retries
    // once if it doesn't materialize: a concurrent codebook commit (a
    // variable created moments earlier validates asynchronously) can
    // re-render the spotlight list mid-click and swallow the row click
    // entirely — observed live via trace: the click completed, the
    // spotlight closed, and nothing was created. Deliberately NOT
    // defaulted: each caller knows what its picker's success looks like,
    // and a wrong default (waiting for 'Change variable' while
    // NewVariableWindow is open) would retry into a modal.
    until?: Locator;
  },
): Promise<void> {
  const trigger = (opts.scope ?? page).getByRole('button', {
    name: opts.buttonName ?? 'Select variable',
  });

  const attempt = async () => {
    await trigger.click();
    const search = page.getByRole('searchbox', {
      name: 'Find or create a variable',
    });
    await search.fill(opts.variableName);
    // The list may still show the pre-filter rows for a beat after the
    // fill; branching on a count() taken then either misses the create row
    // or presses Enter against a stale filter. Wait until some row reflects
    // the typed term — both the create row (`Create new variable called
    // "<term>".`) and any existing-match row contain it.
    const rows = page.getByTestId('spotlight-list-item');
    await rows.filter({ hasText: opts.variableName }).first().waitFor();
    const createRow = rows
      .filter({ hasText: 'Create new variable called' })
      .first();
    if (await createRow.count()) {
      await createRow.click();
    } else {
      // No "create" row (the typed name exactly matches an existing
      // option) — Enter selects the single filtered match
      // (VariableSpotlight.tsx's `handleInputKeyDown`).
      await search.press('Enter');
    }
  };

  await attempt();
  if (opts.until) {
    try {
      await opts.until.waitFor({ state: 'visible', timeout: 4_000 });
    } catch {
      await attempt();
      await opts.until.waitFor({ state: 'visible' });
    }
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
// ordinal/categorical type is set. "Add new" commits a blank row straight
// into the array (`immediateAdd` — no separate confirm-to-add step), but
// Option.tsx's own mount effect immediately opens that blank row into edit
// mode. Only one option can be "being edited" at a time (ArrayField tracks a
// single editingId) — opening a row collapses whichever one was previously
// edited back to a read-only summary line ("label — value") and unmounts its
// inputs, so exactly one Label/Value pair ever exists in the DOM (no
// `.nth(i)` needed). Each row's Label field is itself a RichText/Tiptap
// control (`label: 'Label'`) — role "textbox" — and its Value field is a
// plain input named "Value". Both fields commit live via direct Redux Form
// binding on every keystroke, so the row doesn't need to be "saved" before
// moving on; the Check-icon button (aria-label "Finish editing option") just
// collapses it back to summary. We click that after each option, before
// adding the next, to avoid depending on the auto-open effect racing our own
// next "Add new" click.
export async function createVariableWithOptions(
  page: Page,
  opts: {
    variableName: string;
    options: (string | OptionRow)[];
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

  // Scope to this dialog (InlineEditScreen renders `Dialog title="Create New
  // Variable"`). The prompt editor underneath has its own "Variable Options"
  // list with an identically-labelled 'Add new' — it only mounts once the
  // prompt's `variable` is set, which is after this runs, but relying on that
  // ordering would make a strict-mode collision one refactor away.
  await fillOptionRows(
    page.getByRole('dialog', { name: 'Create New Variable' }),
    opts.options.map((option) =>
      typeof option === 'string'
        ? { label: option, value: option.toLowerCase() }
        : option,
    ),
  );

  const saveAndClose = page.getByRole('button', { name: 'Save and Close' });
  await saveAndClose.click();
  // Wait out the dialog's exit animation before the caller interacts with
  // controls behind it (see prompts.ts for the shared-dialog-form hazard).
  await saveAndClose.waitFor({ state: 'detached' });
}

export type OptionRow = { label: string; value: string };

// Fill an Options editor's rows (components/Options/*), shared between the
// NewVariableWindow flow above and the form-field dialog's
// 'Categorical/Ordinal options' section (editor-sections/
// form-field-controls.ts). `scope` bounds the 'Add new' click — several
// sections can show identically-labelled 'Add new' buttons at once; the row
// edit fields themselves are page-unique because only one option row is ever
// open (see the Option.tsx notes above). The Value input coerces
// number-like strings to numbers on write (Option.tsx parseOptionValue:
// `'5'` → 5, `'-2'` → -2), so callers pass raw strings for both numeric and
// string-valued options.
export async function fillOptionRows(
  scope: Locator,
  rows: OptionRow[],
): Promise<void> {
  const page = scope.page();
  for (const row of rows) {
    await scope.getByRole('button', { name: 'Add new', exact: true }).click();
    await page.getByRole('textbox', { name: 'Label' }).fill(row.label);
    await page.getByRole('textbox', { name: 'Value' }).fill(row.value);
    await page.getByRole('button', { name: 'Finish editing option' }).click();
  }
}

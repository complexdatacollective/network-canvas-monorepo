import { type Locator, type Page } from '@playwright/test';

// Every interface's `prompts` array is backed by the same DialogArrayField
// (Form/DialogArrayField.tsx) pattern — verified against
// DyadCensusPrompts.tsx (`addTitle: 'Edit Prompt'`, `editorTitle: 'Edit
// Prompt'`) and the same shape recurs across the other prompt-array sections.
// Each add button names what it adds ("Create new prompt", "Create new
// preset", "Create new disease" — DialogArrayField requires the label, there
// is no default), so `addButtonLabel` names the list this helper is driving.
// The dialog's submit button reads "Add" for a brand-new item
// (DialogArrayField.tsx's `DialogEditor`: `isNewItem ? 'Add' : 'Save'`).
//
// Still takes the enclosing section `Locator` rather than the Page: a stage
// can render two lists of the SAME kind (a Network Composer's per-edge-type
// attribute lists), and scoping keeps the click on the intended one. The
// opened dialog is a page-level portal, so the "Add" submit is unambiguous and
// is targeted via `section.page()`.
//
// `fill` fills whatever fields the specific interface's prompt editor exposes
// (typically `StageEditor.fillRichText` for the prompt text, plus any
// per-interface extras) before the dialog is submitted.
export async function addPrompt(
  section: Locator,
  fill: () => Promise<void>,
  opts: {
    // A locator that is VISIBLE only in a genuinely fresh dialog (e.g. an
    // unset picker's 'Select variable' button). The item dialogs share one
    // never-reinitializing redux-form ('editable-list-form'); if the next
    // dialog opens before the previous unmount completed, it resurrects the
    // PREVIOUS item's values and id (observed live). When the sign doesn't
    // show, cancel — a full close cycle forces the unmount — and reopen.
    freshSign?: (page: Page) => Locator;
    /** The list's own add-button label. */
    addButtonLabel?: string;
  } = {},
): Promise<void> {
  const create = section.getByRole('button', {
    name: opts.addButtonLabel ?? 'Create new prompt',
    exact: true,
  });
  await create.click();
  if (opts.freshSign) {
    const sign = opts.freshSign(section.page());
    try {
      await sign.waitFor({ state: 'visible', timeout: 3_000 });
    } catch {
      // Scoped to the dialog: the stage editor's own toolbar also has a
      // 'Cancel' button.
      const cancel = section
        .page()
        .getByRole('dialog')
        .getByRole('button', { name: 'Cancel', exact: true });
      await cancel.click();
      await cancel.waitFor({ state: 'detached' });
      await create.click();
      await sign.waitFor({ state: 'visible' });
    }
  }
  await fill();
  const submit = section
    .page()
    .getByRole('button', { name: 'Add', exact: true });
  await submit.click();
  // Wait for the dialog subtree to actually LEAVE the DOM, not just hide:
  // the dialog form (InlineEditScreen/Form) has `enableReinitialize: false`
  // and every item dialog shares the 'editable-list-form' name, so opening
  // the next dialog while this one is still mounted mid-exit-animation
  // reuses the PREVIOUS item's form state (stale values and — worse — a
  // duplicate item id that the app then rejects at commit). Unmount destroys
  // the form state (redux-form destroyOnUnmount), guaranteeing a fresh
  // initialize on the next open. Observed live before this guard existed.
  await submit.waitFor({ state: 'detached' });
}

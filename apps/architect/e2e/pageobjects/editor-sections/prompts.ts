import { type Locator, type Page } from '@playwright/test';

// Every interface's `prompts` array is the same list-in-a-dialog pattern from
// `@codaco/protocol-builder` (`form/rowDialog.tsx`'s `RowList`/`RowDialog`,
// wired by `sections/PromptsSection.tsx` and the per-interface prompt
// sections). Each list names what it adds on its own add button ("Create new
// prompt", "Create new preset", "Create new disease" — `addButtonLabel` is
// required, there is no default), so `addButtonLabel` names the list this
// helper is driving. The dialog's submit reads "Add" for a brand-new row and
// "Save" for one being edited (`RowDialog`: `isNewItem ? messages.addSubmit :
// commonMessages.save`).
//
// Still takes the enclosing section/field `Locator` rather than the Page: a
// stage can render two lists of the SAME kind (a Network Composer's per-edge-
// type attribute lists), and scoping keeps the click on the intended one. The
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
    // unset picker's own empty state). Each row dialog now mounts a form store
    // of its own, keyed to the row it opened on, so a caller that does not
    // care can leave this out; passing it is how a caller REQUIRES that the
    // dialog it is about to fill is the empty one, and reopens once when the
    // sign does not show.
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
  // Wait for the dialog subtree to actually LEAVE the DOM, not just hide: the
  // next row's dialog animates in over this one's exit, and a locator resolved
  // while both are mounted can land on the closing copy. Waiting for the
  // submit to detach is waiting for the dialog that owned it to be gone.
  await submit.waitFor({ state: 'detached' });
}

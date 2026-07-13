import { type Locator } from '@playwright/test';

// Every interface's `prompts` array is backed by the same DialogArrayField
// (Form/DialogArrayField.tsx) pattern — verified against
// DyadCensusPrompts.tsx (`addTitle: 'Edit Prompt'`, `editorTitle: 'Edit
// Prompt'`) and the same shape recurs across the other prompt-array sections.
// "Create new" is DialogArrayField's default `addButtonLabel`; the dialog's
// submit button reads "Add" for a brand-new item
// (DialogArrayField.tsx's `DialogEditor`: `isNewItem ? 'Add' : 'Save'`).
//
// Takes the enclosing section `Locator` (e.g. `editor.section('NameGeneratorPrompts')`)
// rather than the Page, and scopes the "Create new" OPEN click to it: several
// interfaces render two DialogArrayFields at once (e.g. NameGenerator's `Form`
// AND `NameGeneratorPrompts`, per StageEditor/Interfaces.tsx), both using the
// same default "Create new" label — an unscoped match hits 2+ buttons and
// Playwright strict-mode throws. The opened dialog is a page-level portal, so
// the "Add" submit is unambiguous and is targeted via `section.page()`.
//
// `fill` fills whatever fields the specific interface's prompt editor exposes
// (typically `StageEditor.fillRichText` for the prompt text, plus any
// per-interface extras) before the dialog is submitted.
export async function addPrompt(
  section: Locator,
  fill: () => Promise<void>,
): Promise<void> {
  await section
    .getByRole('button', { name: 'Create new', exact: true })
    .click();
  await fill();
  await section
    .page()
    .getByRole('button', { name: 'Add', exact: true })
    .click();
}

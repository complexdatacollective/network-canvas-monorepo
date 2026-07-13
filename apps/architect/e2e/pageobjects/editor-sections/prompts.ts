import { type Page } from '@playwright/test';

// Every interface's `prompts` array is backed by the same DialogArrayField
// (Form/DialogArrayField.tsx) pattern — verified against
// DyadCensusPrompts.tsx (`addTitle: 'Edit Prompt'`, `editorTitle: 'Edit
// Prompt'`) and the same shape recurs across the other prompt-array sections.
// "Create new" is DialogArrayField's default `addButtonLabel`; the dialog's
// submit button reads "Add" for a brand-new item
// (DialogArrayField.tsx's `DialogEditor`: `isNewItem ? 'Add' : 'Save'`).
// `fill` fills whatever fields the specific interface's prompt editor exposes
// (typically `StageEditor.fillRichText` for the prompt text, plus any
// per-interface extras) before the dialog is submitted.
export async function addPrompt(
  page: Page,
  fill: () => Promise<void>,
): Promise<void> {
  await page.getByRole('button', { name: 'Create new' }).click();
  await fill();
  await page.getByRole('button', { name: 'Add' }).click();
}

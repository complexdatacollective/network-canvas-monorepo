import { expect, type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { createVariableViaSpotlight } from './variables.js';

// QuickAdd section (sections/QuickAdd/QuickAdd.tsx, `Section title="Quick Add
// Variable"`; returns null entirely until `subject.type` is set — pick the
// node type first). Creating a variable through this picker hard-codes
// `validation: { required: true }` onto the codebook entry
// (QuickAdd.tsx `handleCreateVariable(value, 'text', 'quickAdd', { required:
// true })`); the canonical sample-protocol `name` variable has no validation,
// so this helper then toggles OFF the Validation subsection that mounts under
// the picker — ValidationSection dispatches `validation: null`, and
// CodebookVariableValidationSection's `updateVariableAsync` with
// `replaceProperties: ['validation']` deletes the key from the codebook
// immediately (not at stage save).
export async function createQuickAddVariable(
  editor: StageEditor,
  page: Page,
  variableName: string,
  opts: { clearRequiredValidation?: boolean } = {},
): Promise<void> {
  await createVariableViaSpotlight(page, {
    variableName,
    scope: editor.field('quickAdd'),
    until: editor
      .field('quickAdd')
      .getByRole('button', { name: 'Change variable' }),
  });
  if (opts.clearRequiredValidation) {
    const validation = page.locator('[data-name="Validation"]');
    const toggle = validation.getByRole('switch', {
      name: 'Validation',
    });
    // The created variable carries `required`, so the section starts
    // expanded (`startExpanded={!!hasValidation}`); one click turns it off.
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
  }
}

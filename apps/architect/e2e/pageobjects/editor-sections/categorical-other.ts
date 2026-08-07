import { type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { createVariableViaSpotlight } from './variables.js';

// CategoricalBin prompt dialog's follow-up "Other" subsection
// (sections/CategoricalBinPrompts/PromptFields.tsx). Facts verified against
// source:
// - The section title contains straight double quotes — `Follow-up "Other"
//   Option` — which break StageEditor.section()'s double-quoted CSS
//   attribute selector, hence the single-quoted locator here.
// - It is disabled until the main categorical `variable` is picked, and its
//   toggle initializes nothing.
// - The otherVariable picker creates `{ name, type: 'text', validation:
//   { required: true } }` directly (no NewVariableWindow). The forced
//   validation CANNOT be cleared from inside the prompt dialog — toggling
//   the nested Validation section OFF writes `_modified` into the DIALOG
//   form, which rides into the saved prompt and fails the schema's strict
//   object (verified live) — so the comparison layer drops it instead
//   (helpers/normalize-protocol.ts dropForcedRequiredValidation).
// - otherOptionLabel ('Label for Bin') and otherVariablePrompt ('Question
//   Prompt for Dialog') are visible-labelled inline RichText fields; all
//   three fields are required once the section is on.
export async function enableOtherOption(
  editor: StageEditor,
  page: Page,
  opts: {
    variableName: string;
    optionLabel: string;
    variablePrompt: string;
  },
): Promise<void> {
  const section = page.locator(`section[data-name='Follow-up "Other" Option']`);
  await section
    .getByRole('switch', { name: 'Turn this feature on or off' })
    .first()
    .click();
  await createVariableViaSpotlight(page, {
    variableName: opts.variableName,
    scope: section,
    until: section.getByRole('button', { name: 'Change variable' }),
  });
  await editor.fillRichText('Label for Bin', opts.optionLabel);
  await editor.fillRichText('Question Prompt for Dialog', opts.variablePrompt);
}

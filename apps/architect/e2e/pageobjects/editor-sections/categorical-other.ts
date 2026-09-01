import { type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { createVariableViaSpotlight } from './variables.js';

// CategoricalBin prompt dialog's follow-up other-option nested section
// (sections/CategoricalBinPrompts/PromptFields.tsx). Facts verified against
// source:
// - The toggleable region and its switch are both named "Follow-up other
//   option" by the Section heading.
// - It is disabled until the main categorical `variable` is picked, and its
//   toggle initializes nothing.
// - The otherVariable picker creates `{ name, type: 'text', validation:
//   { required: true } }` directly (no NewVariableWindow). The forced
//   validation CANNOT be cleared from inside the prompt dialog — toggling
//   the nested Validation section OFF writes `_modified` into the DIALOG
//   form, which rides into the saved prompt and fails the schema's strict
//   object (verified live) — so the comparison layer drops it instead
//   (helpers/normalize-protocol.ts dropForcedRequiredValidation).
// - otherOptionLabel ("Other bin label") and otherVariablePrompt
//   ("Follow-up question") are visible-labelled inline RichText fields; all
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
  const section = editor.section('Follow-up other option');
  await section
    .getByRole('switch', { name: 'Follow-up other option', exact: true })
    .click();
  await createVariableViaSpotlight(page, {
    variableName: opts.variableName,
    scope: section,
    until: section.getByRole('button', { name: 'Change attribute' }),
  });
  await editor.fillRichText('Other bin label', opts.optionLabel);
  await editor.fillRichText('Follow-up question', opts.variablePrompt);
}

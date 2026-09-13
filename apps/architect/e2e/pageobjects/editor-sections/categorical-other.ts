import { type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';

// CategoricalBin's follow-up bin, a nested toggleable section of the prompt
// row dialog (@codaco/protocol-builder's CategoricalBinPromptsSection.tsx).
// Facts verified against source:
// - The section is headed "Follow-up other option", and fresco-ui's `Section`
//   labels its toggle from that same heading (`aria-labelledby={titleId}`), so
//   region and switch share the name.
// - It is disabled until the main "Categorical response" attribute is picked,
//   and it opens
//   closed (`defaultOpen={committedOther !== undefined}`).
// - The attribute the typed answer is stored in is a `BinAttributeField`
//   restricted to text attributes: a picker labelled "Other attribute", plus
//   a `CreateVariableButton` labelled "Create a new text
//   attribute" that opens the codebook's own attribute editor. A text
//   attribute has no values to author, so the editor needs only "Attribute
//   name" before "Create attribute" commits it — and, unlike the Architect
//   editor this replaced, it forces no `validation: { required: true }` onto
//   the attribute.
// - otherOptionLabel ("Other bin label") and otherVariablePrompt ("Follow-up
//   question") are visible-labelled RichText fields; all three fields are
//   required once the section is open.
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
  // Scoped to the attribute editor's own dialog: the bins picker above has a
  // "Create a new attribute" button of its own, and the prompt dialog behind
  // this one is still mounted.
  const attributeEditor = page.getByRole('dialog', {
    name: 'Create a new text attribute',
    exact: true,
  });
  await page
    .getByRole('button', { name: 'Create a new text attribute', exact: true })
    .click();
  await attributeEditor
    .getByRole('textbox', { name: 'Attribute name', exact: true })
    .fill(opts.variableName);
  await attributeEditor
    .getByRole('button', { name: 'Create attribute', exact: true })
    .click();
  // The dialog holds itself open until the codebook write lands, renaming its
  // submit while the request is in flight — so the DIALOG going is the signal
  // that the attribute exists and has been bound to this prompt, not the
  // button. Waiting matters for the reason prompts.ts gives: the prompt dialog
  // behind this one must not be driven through a modal still on screen.
  await attributeEditor.waitFor({ state: 'hidden' });
  await editor.fillRichText('Other bin label', opts.optionLabel);
  await editor.fillRichText('Follow-up question', opts.variablePrompt);
}

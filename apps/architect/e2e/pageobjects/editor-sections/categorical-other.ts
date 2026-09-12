import { type StageEditor } from '../stage-editor.js';
import { createAttribute } from './variables.js';

// CategoricalBin's follow-up bin, a nested toggleable section of the prompt
// row dialog (@codaco/protocol-builder's CategoricalBinPromptsSection.tsx).
// Facts verified against source:
// - The section is headed "A bin for anything else", and fresco-ui's `Section`
//   labels its toggle from that same heading (`aria-labelledby={titleId}`), so
//   region and switch share the name.
// - It is disabled until the main "The bins" attribute is picked, and it opens
//   closed (`defaultOpen={committedOther !== undefined}`).
// - The attribute the typed answer is stored in is a `BinAttributeField`
//   restricted to text attributes: a picker labelled "Attribute the answer is
//   stored in", and nothing beside it. A text attribute has no values to
//   author, so its create row writes the codebook and binds the result
//   directly — no editor opens — and, unlike the Architect control this
//   replaced, it forces no `validation: { required: true }` onto the
//   attribute.
// - otherOptionLabel ("Bin label") and otherVariablePrompt ("Follow-up
//   question") are visible-labelled RichText fields; all three fields are
//   required once the section is open.
export async function enableOtherOption(
  editor: StageEditor,
  opts: {
    variableName: string;
    optionLabel: string;
    variablePrompt: string;
  },
): Promise<void> {
  const section = editor.section('A bin for anything else');
  await section
    .getByRole('switch', { name: 'A bin for anything else', exact: true })
    .click();
  // The follow-up answer's own field, which is a different slot from the bins
  // picker above it (`otherVariable` against `variable`) even though both are
  // on screen at once.
  await createAttribute(editor.field('otherVariable'), opts.variableName);
  await editor.fillRichText('Bin label', opts.optionLabel);
  await editor.fillRichText('Follow-up question', opts.variablePrompt);
}

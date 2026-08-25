import { type StageEditor } from '../stage-editor.js';

// IntroductionPanel section (sections/IntroductionPanel.tsx, `Section
// title="Task introduction"`, always-on, never gated; present only on
// EgoForm / AlterForm / AlterEdgeForm / DyadCensus / TieStrengthCensus).
// Both fields are required. `introductionPanel.title` is a plain input whose
// accessible name is 'Title'; the text field is a block-mode RichText whose
// accessible name is the explicit `label: 'Introduction text'` (see
// ego-form.spec.ts for the label-vs-name reasoning). Multi-paragraph /
// list-bearing canonical texts go through `fillRichTextMarkdown` so Tiptap's
// input rules build real document structure.
export async function fillIntroductionPanel(
  editor: StageEditor,
  title: string,
  markdown: string,
): Promise<void> {
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill(title);
  await editor.fillRichTextMarkdown('Introduction text', markdown);
}

import { type StageEditor } from '../stage-editor.js';

// The task introduction is `@codaco/protocol-builder`'s shared
// `sections/introduction/IntroductionSection.tsx` (`Task introduction`,
// always on, never gated; composed by EgoForm / AlterForm / AlterEdgeForm /
// DyadCensus / TieStrengthCensus). Both halves are required and keep their
// schema paths, `introductionPanel.title` and `introductionPanel.text`, while
// the CONTROLS are named for what they are: "Introduction heading" and
// "Introduction text".
//
// The heading is reached through the `data-field-name` seam rather than by its
// label, because that is the path this helper is about. The text is a
// block-mode RichText whose accessible name is its own label (see
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

import type { z } from 'zod';

import {
  type LocalizedTextShape,
  localizedTextShapeAt,
} from '@codaco/protocol-validation';

/** A localized field's declared shape, for a field that holds markdown. */
export type MarkdownTextShape = Readonly<{
  format: 'markdown';
  lines: LocalizedTextShape['lines'];
}>;

/**
 * The declared shape of the markdown field at `path` in `schema` (see
 * `localizedTextShapeAt`), for an editor that names the field it edits
 * rather than restating what the field may hold. Throws, as the editor's
 * module loads, when the field is not markdown: such a field is edited as
 * plain text (`LocalizedInputField`).
 */
export const markdownTextShapeAt = (
  schema: z.ZodType,
  path: readonly (string | number)[],
): MarkdownTextShape => {
  const { format, lines } = localizedTextShapeAt(schema, path);
  if (format !== 'markdown') {
    throw new Error(
      `The localized text at ${path.join('.')} is plain, not markdown.`,
    );
  }
  return { format, lines };
};

/** How a text field edits text of one declared shape. */
type TextFieldShapeProps = Readonly<{
  /** The text is markdown, edited with formatting. */
  markdown: boolean;
  /**
   * The text is one paragraph: Enter moves on rather than breaking the line,
   * and the editor offers formatting for words (bold, italics) only.
   */
  singleLine: boolean;
}>;

/**
 * The props a text field takes for text of the shape `shape` declares. Every
 * surface that edits a localized field configures itself through this, from
 * the field's own declaration: the stage and codebook editors and the
 * translation table, so a field is edited the same way wherever it is.
 */
export const textFieldPropsFor = ({
  format,
  lines,
}: LocalizedTextShape): TextFieldShapeProps => ({
  markdown: format === 'markdown',
  singleLine: lines === 'single',
});

/**
 * The formatting the rich text editor's toolbar offers for a one-line or a
 * several-line text: one line holds one paragraph, so it has no blocks —
 * headings, lists, rules — and no links. `disallowed` withholds more.
 */
export const richTextToolbarFor = (
  singleLine: boolean,
  disallowed: readonly string[] = [],
) => ({
  bold: !disallowed.includes('bold'),
  italic: !disallowed.includes('italic'),
  links: !singleLine,
  headings: !singleLine && !disallowed.includes('headings'),
  lists: !singleLine && !disallowed.includes('lists'),
  thematicBreak: !singleLine && !disallowed.includes('thematic_break'),
  history: !disallowed.includes('history'),
});

import { DYNAMIC_VALUE_MARKER } from './dynamicValueMessages.ts';
import { markdownTree } from './markdownTree.ts';

/** A node of the markdown tree, as far as its text goes. */
type TextNode = Readonly<{
  type: string;
  value?: string;
  children?: readonly TextNode[];
}>;

/**
 * The words a node shows: its text, code and raw HTML as written (the
 * interview shows HTML as typed, never as markup), a line break as a space.
 * Blocks are joined by a space.
 */
const wordsOf = (node: TextNode): string => {
  if (
    node.type === 'text' ||
    node.type === 'inlineCode' ||
    node.type === 'html'
  ) {
    return node.value ?? '';
  }
  if (node.type === 'break') return ' ';
  const children = node.children ?? [];
  return children
    .map(wordsOf)
    .join(node.type === 'root' || node.type === 'list' ? ' ' : '');
};

const MARKED = new RegExp(
  `${DYNAMIC_VALUE_MARKER}(\\d+)${DYNAMIC_VALUE_MARKER}`,
  'g',
);

/**
 * One line of markdown written in pieces, with values between them (a
 * string is markdown; anything else is a value), as the plain text that it
 * shows: the same pieces in order, with each run of markdown replaced by its
 * words, without bold, italics or any other markup. The markdown is read as
 * one text, so markup that spans a value (`**{name}**`) is read as it would
 * be shown. For a place that shows text without formatting, such as a node's
 * label, and for a summary of wording in one line.
 */
export const inlineMarkdownText = <Value>(
  parts: readonly (string | Value)[],
): (string | Value)[] => {
  const values: Value[] = [];
  let markdown = '';
  for (const part of parts) {
    if (typeof part === 'string') {
      markdown += part.replaceAll(DYNAMIC_VALUE_MARKER, '');
    } else {
      markdown += `${DYNAMIC_VALUE_MARKER}${values.length}${DYNAMIC_VALUE_MARKER}`;
      values.push(part);
    }
  }
  const words = wordsOf(markdownTree(markdown));
  const pieces: (string | Value)[] = [];
  let at = 0;
  for (const match of words.matchAll(MARKED)) {
    if (match.index > at) pieces.push(words.slice(at, match.index));
    const value = values[Number(match[1])];
    if (value !== undefined) pieces.push(value);
    at = match.index + match[0].length;
  }
  if (at < words.length) pieces.push(words.slice(at));
  return pieces;
};

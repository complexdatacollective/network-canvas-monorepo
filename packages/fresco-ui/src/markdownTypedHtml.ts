/**
 * How HTML in stored text is shown. Stored text is read as standard
 * CommonMark, and HTML is not part of it: whatever the parser reads as HTML
 * (an `html` node) is shown as the characters typed. HTML inside a paragraph
 * stays where it is, a line ending in it read as the space it is between the
 * words of a paragraph; a block of HTML becomes a paragraph of its own, each
 * line of it on a line of its own.
 *
 * The interview's renderer (`RenderMarkdown`) and Architect's rich text
 * editor both read text through this, so the two show the same thing.
 */

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
};

const isMarkdownNode = (node: unknown): node is MarkdownNode =>
  typeof node === 'object' &&
  node !== null &&
  'type' in node &&
  typeof node.type === 'string';

// The nodes whose children are blocks. HTML among them is a block of HTML.
const BLOCK_CONTAINERS = new Set(['root', 'blockquote', 'listItem']);

/**
 * A block of HTML's characters as text, with a line break at each line
 * ending, so that each line of it is a line of its own.
 */
const blockCharacters = (value: string): MarkdownNode[] =>
  value
    .split('\n')
    .flatMap((line, index) => [
      ...(index === 0 ? [] : [{ type: 'break' }]),
      ...(line === '' ? [] : [{ type: 'text', value: line }]),
    ]);

/**
 * HTML inside a paragraph as its characters, where a line ending is what it
 * is between words of a paragraph: a space.
 */
const inlineCharacters = (value: string): MarkdownNode[] =>
  value === '' ? [] : [{ type: 'text', value }];

const replaceHtml = (node: MarkdownNode) => {
  if (node.children === undefined) return;
  const holdsBlocks = BLOCK_CONTAINERS.has(node.type);
  node.children = node.children.flatMap((child): MarkdownNode[] => {
    if (child.type !== 'html') {
      replaceHtml(child);
      return [child];
    }
    if (!holdsBlocks) return inlineCharacters(child.value ?? '');
    const characters = blockCharacters(child.value ?? '');
    return characters.length === 0
      ? []
      : [{ type: 'paragraph', children: characters }];
  });
};

/**
 * Replaces each `html` node in a markdown tree, in place, with the characters
 * typed.
 */
export const showHtmlAsTyped = (tree: unknown): void => {
  if (isMarkdownNode(tree)) replaceHtml(tree);
};

/**
 * How HTML in stored text is shown. Stored text is read as standard
 * CommonMark, and HTML is not part of it: whatever the parser reads as HTML
 * (an `html` node) is shown as the characters typed, each line of it on a
 * line of its own. HTML inside a paragraph stays where it is; a block of HTML
 * becomes a paragraph of its own.
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

/** HTML's characters as text, with a line break at each newline. */
const typedCharacters = (value: string): MarkdownNode[] =>
  value
    .split('\n')
    .flatMap((line, index) => [
      ...(index === 0 ? [] : [{ type: 'break' }]),
      ...(line === '' ? [] : [{ type: 'text', value: line }]),
    ]);

const replaceHtml = (node: MarkdownNode) => {
  if (node.children === undefined) return;
  const holdsBlocks = BLOCK_CONTAINERS.has(node.type);
  node.children = node.children.flatMap((child): MarkdownNode[] => {
    if (child.type !== 'html') {
      replaceHtml(child);
      return [child];
    }
    const characters = typedCharacters(child.value ?? '');
    if (!holdsBlocks) return characters;
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

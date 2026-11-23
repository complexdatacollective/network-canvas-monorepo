import type {
  RichTextAssetBlockAttributes,
  RichTextAssetBlockContent,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { linkAddress } from '@codaco/fresco-ui/linkAddress';
import { showHtmlAsTyped } from '@codaco/fresco-ui/markdownTypedHtml';
import {
  assetBlockMarkdown,
  assetBlockSettings,
  ASCII_PUNCTUATION,
  escapeMarkdownText,
  isAssetBlockAlignment,
  isAssetBlockSize,
  linkDestinationMarkdown,
  linkTitleMarkdown,
  markdownTree,
  readAssetBlockUrl,
} from '@codaco/protocol-validation';

export type RichTextMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type RichTextContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: RichTextContent[];
  marks?: RichTextMark[];
  text?: string;
};

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  url?: string;
  title?: string | null;
  alt?: string | null;
  identifier?: string;
};

const EMPTY_DOCUMENT: RichTextContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const cloneEmptyDocument = (): RichTextContent => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

/** Where each link label a text defines leads (`[label]: address`). */
type Definitions = ReadonlyMap<string, LinkTargetNode>;
type LinkTargetNode = Readonly<{ url?: string; title?: string | null }>;

const definitionsIn = (
  node: MarkdownNode,
  found = new Map<string, LinkTargetNode>(),
): Definitions => {
  if (node.type === 'definition' && node.identifier !== undefined) {
    // The first definition of a label is the one markdown uses.
    if (!found.has(node.identifier)) found.set(node.identifier, node);
  }
  for (const child of node.children ?? []) definitionsIn(child, found);
  return found;
};

type InlineParseOptions = {
  links?: boolean;
  definitions?: Definitions;
};

type SerializeInlineOptions = {
  links?: boolean;
};

const addMark = (
  content: RichTextContent[],
  mark: RichTextMark,
): RichTextContent[] =>
  content.map((node) => {
    if (node.type === 'text') {
      return {
        ...node,
        marks: [...(node.marks ?? []), mark],
      };
    }

    return {
      ...node,
      content: node.content ? addMark(node.content, mark) : undefined,
    };
  });

const inlineFromMarkdown = (
  node: MarkdownNode,
  options: InlineParseOptions = {},
): RichTextContent[] => {
  switch (node.type) {
    case 'text':
      return node.value ? [{ type: 'text', text: node.value }] : [];

    case 'strong':
      return addMark(childrenAsInline(node, options), { type: 'bold' });

    case 'emphasis':
      return addMark(childrenAsInline(node, options), { type: 'italic' });

    case 'link':
    case 'linkReference': {
      const target =
        node.type === 'link'
          ? node
          : node.identifier === undefined
            ? undefined
            : options.definitions?.get(node.identifier);
      const href = linkAddress(target?.url);
      const content = childrenAsInline(node, options);

      if (!href || options.links === false) {
        return content;
      }

      return addMark(content, {
        type: 'link',
        attrs: {
          href,
          title: target?.title ?? null,
        },
      });
    }

    case 'break':
      return [{ type: 'hardBreak' }];

    // Code is shown as its characters; the editor has no code of its own.
    case 'inlineCode':
    case 'code':
      return node.value ? [{ type: 'text', text: node.value }] : [];

    case 'image':
      return node.alt ? [{ type: 'text', text: node.alt }] : [];

    default:
      return childrenAsInline(node, options);
  }
};

const childrenAsInline = (
  node: MarkdownNode,
  options: InlineParseOptions = {},
): RichTextContent[] =>
  (node.children ?? []).flatMap((child) => inlineFromMarkdown(child, options));

const paragraphFromInline = (content: RichTextContent[]): RichTextContent =>
  content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };

/** The editor's node for a file shown as a block (fresco-ui's). */
const ASSET_BLOCK = 'assetBlock' satisfies RichTextAssetBlockContent['type'];

type BlockParseOptions = {
  /** Whether a markdown image naming a file of the protocol is a block. */
  assetBlocks?: boolean;
  definitions?: Definitions;
};

/**
 * The block a markdown image stands for, when its address names a file of
 * the protocol (see protocol-validation's `AssetBlock`). The node carries
 * every setting, with the ones the address leaves out at their defaults, as
 * the editor's node holds them.
 */
const assetBlockFromImage = (
  node: MarkdownNode,
): RichTextAssetBlockContent | undefined => {
  if (node.type !== 'image' || typeof node.url !== 'string') return undefined;
  const reading = readAssetBlockUrl(node.url);
  if (reading === undefined) return undefined;
  const { size, ...settings } = assetBlockSettings(reading.block);
  return {
    type: ASSET_BLOCK,
    attrs: {
      assetId: reading.block.assetId,
      description: node.alt ?? '',
      size: size ?? null,
      ...settings,
    },
  };
};

// The line break markdown leaves between an image and the text beside it
// belongs to neither once the image is a block of its own, whether it was a
// plain one (a space) or a hard one.
const withoutEdgeSpace = (run: RichTextContent[]): RichTextContent[] => {
  const trimmed = [...run];
  for (;;) {
    const first = trimmed[0];
    if (first?.type === 'hardBreak') {
      trimmed.shift();
      continue;
    }
    if (first?.type !== 'text') break;
    const text = (first.text ?? '').trimStart();
    if (text !== '') {
      trimmed[0] = { ...first, text };
      break;
    }
    trimmed.shift();
  }
  for (;;) {
    const last = trimmed.at(-1);
    if (last?.type === 'hardBreak') {
      trimmed.pop();
      continue;
    }
    if (last?.type !== 'text') break;
    const text = (last.text ?? '').trimEnd();
    if (text !== '') {
      trimmed[trimmed.length - 1] = { ...last, text };
      break;
    }
    trimmed.pop();
  }
  return trimmed;
};

/**
 * A paragraph that may name files: each becomes a block of its own, and the
 * words on either side of it a paragraph of their own. Written by the
 * editor, a file is always alone in its paragraph; written by hand it may
 * sit in a sentence, which is split around it, as the interview shows it.
 */
const paragraphWithAssetBlocks = (
  node: MarkdownNode,
  options: InlineParseOptions,
): RichTextContent[] => {
  const blocks: RichTextContent[] = [];
  let run: RichTextContent[] = [];
  const endRun = () => {
    const words = withoutEdgeSpace(run);
    if (words.length > 0) blocks.push(paragraphFromInline(words));
    run = [];
  };
  for (const child of node.children ?? []) {
    const block = assetBlockFromImage(child);
    if (block === undefined) {
      run.push(...inlineFromMarkdown(child, options));
      continue;
    }
    endRun();
    blocks.push(block);
  }
  endRun();
  return blocks.length > 0 ? blocks : [paragraphFromInline([])];
};

const blockFromMarkdown = (
  node: MarkdownNode,
  options: BlockParseOptions = {},
): RichTextContent[] => {
  const inline = { definitions: options.definitions };
  switch (node.type) {
    case 'paragraph':
      return options.assetBlocks === true
        ? paragraphWithAssetBlocks(node, inline)
        : [paragraphFromInline(childrenAsInline(node, inline))];

    case 'heading': {
      const level = Math.min(Math.max(node.depth ?? 1, 1), 4);
      return [
        {
          type: 'heading',
          attrs: { level },
          content: childrenAsInline(node, inline),
        },
      ];
    }

    case 'list':
      return [
        {
          type: node.ordered ? 'orderedList' : 'bulletList',
          attrs: node.ordered ? { start: node.start ?? 1 } : undefined,
          content: (node.children ?? []).map((child) => ({
            type: 'listItem',
            content: blockChildrenFromMarkdown(child, options),
          })),
        },
      ];

    case 'thematicBreak':
      return [{ type: 'horizontalRule' }];

    // A quotation is shown as the interview shows it: its content, without
    // a quotation, which the editor has no way to write.
    case 'blockquote':
      return (node.children ?? []).flatMap((child) =>
        blockFromMarkdown(child, options),
      );

    // Code is shown as its characters, in a paragraph of its own.
    case 'code': {
      const content = inlineFromMarkdown(node, inline);
      return content.length > 0 ? [paragraphFromInline(content)] : [];
    }

    default: {
      const content = childrenAsInline(node, inline);
      return content.length > 0 ? [paragraphFromInline(content)] : [];
    }
  }
};

const blockChildrenFromMarkdown = (
  node: MarkdownNode,
  options: BlockParseOptions,
): RichTextContent[] => {
  if (node.type !== 'listItem') {
    return blockFromMarkdown(node, options);
  }

  const children = (node.children ?? []).flatMap((child) =>
    blockFromMarkdown(child, options),
  );
  if (children.length === 0) return [{ type: 'paragraph' }];
  // The editor's list item opens with a paragraph, so an item that opens
  // with a file is given an empty one to open with.
  return children[0]?.type === ASSET_BLOCK
    ? [{ type: 'paragraph' }, ...children]
    : children;
};

const inlineDocumentFromMarkdown = (
  root: MarkdownNode,
  options: InlineParseOptions,
): RichTextContent => {
  const inlineContent = (root.children ?? []).flatMap((node, index) => {
    const content =
      node.type === 'paragraph' || node.type === 'heading'
        ? childrenAsInline(node, options)
        : inlineFromMarkdown(node, options);

    if (index === 0 || content.length === 0) {
      return content;
    }

    return [{ type: 'text', text: ' ' }, ...content];
  });

  return {
    type: 'doc',
    content: [paragraphFromInline(inlineContent)],
  };
};

type MarkdownReadOptions = Readonly<{
  /** Whether the text is one line, read as a single paragraph. */
  inline?: boolean;
  /** Whether a line (`inline`) keeps its links. A document always does. */
  links?: boolean;
  /**
   * Whether a document's images that name a file of the protocol are read as
   * blocks, for a field declared to hold them. Elsewhere, and in a line, an
   * image is its description.
   */
  assetBlocks?: boolean;
}>;

export const markdownToRichTextContent = (
  value: string | null | undefined,
  {
    inline = false,
    links = false,
    assetBlocks = false,
  }: MarkdownReadOptions = {},
): RichTextContent => {
  if (!value || !/\S/.test(value)) {
    return cloneEmptyDocument();
  }

  const root: MarkdownNode = markdownTree(value);
  // Raw HTML is not part of schema 9 text: it is shown as the characters
  // typed, as the interview shows it.
  showHtmlAsTyped(root);
  const definitions = definitionsIn(root);

  if (inline) {
    return inlineDocumentFromMarkdown(root, { links, definitions });
  }

  const content = (root.children ?? []).flatMap((node) =>
    blockFromMarkdown(node, { assetBlocks, definitions }),
  );

  if (content.length === 0) {
    return cloneEmptyDocument();
  }

  return {
    type: 'doc',
    content,
  };
};

const getMark = (
  node: RichTextContent,
  markType: string,
): RichTextMark | undefined =>
  node.marks?.find((mark) => mark.type === markType);

type LinkTarget = {
  href: string;
  title: string | null;
};

const getLinkTarget = (node: RichTextContent): LinkTarget | undefined => {
  const link = getMark(node, 'link');
  const href = link?.attrs?.href;

  if (typeof href !== 'string') {
    return undefined;
  }

  const safeHref = linkAddress(href);

  if (!safeHref) {
    return undefined;
  }

  const title = link?.attrs?.title;

  return {
    href: safeHref,
    title: typeof title === 'string' && title.trim() !== '' ? title : null,
  };
};

const isSameLinkTarget = (
  target: LinkTarget,
  other: LinkTarget | undefined,
): boolean =>
  other !== undefined &&
  target.href === other.href &&
  target.title === other.title;

const serializeTextNode = (node: RichTextContent): string => {
  const text = escapeMarkdownText(node.text ?? '');
  const isBold = Boolean(getMark(node, 'bold'));
  const isItalic = Boolean(getMark(node, 'italic'));

  if (isBold && isItalic) {
    return `***${text}***`;
  }

  if (isBold) {
    return `**${text}**`;
  }

  if (isItalic) {
    return `_${text}_`;
  }

  return text;
};

const serializeLink = (content: string, target: LinkTarget): string => {
  const titleText = target.title ? ` ${linkTitleMarkdown(target.title)}` : '';

  return `[${content}](${linkDestinationMarkdown(target.href)}${titleText})`;
};

const serializeInlineNode = (
  node: RichTextContent,
  options: SerializeInlineOptions,
): string => {
  if (node.type === 'text') {
    return serializeTextNode(node);
  }

  if (node.type === 'hardBreak') {
    return '  \n';
  }

  return serializeInline(node.content, options);
};

/**
 * A single link spanning mixed formatting is stored as one text node per
 * formatting run, each carrying the same link mark. Find how far the run
 * extends so it serializes as one markdown link rather than one per node.
 */
const findLinkRunEnd = (
  nodes: RichTextContent[],
  start: number,
  target: LinkTarget,
): number => {
  let end = start + 1;

  while (end < nodes.length) {
    const node = nodes[end];

    if (!node) {
      break;
    }

    if (node.type === 'text' && isSameLinkTarget(target, getLinkTarget(node))) {
      end += 1;
      continue;
    }

    break;
  }

  return end;
};

/**
 * Pieces of text side by side with the same formatting, as one piece, as the
 * editor holds them. Escaping reads a character's line so far (a `>` is
 * escaped after a `<`), so text escaped in pieces could be written one way
 * and, once the editor had joined it, another.
 */
const joinedTextRuns = (nodes: RichTextContent[]): RichTextContent[] =>
  nodes.reduce<RichTextContent[]>((joined, node) => {
    const last = joined.at(-1);
    if (
      last?.type === 'text' &&
      node.type === 'text' &&
      JSON.stringify(last.marks ?? []) === JSON.stringify(node.marks ?? [])
    ) {
      joined[joined.length - 1] = {
        ...last,
        text: `${last.text ?? ''}${node.text ?? ''}`,
      };
      return joined;
    }
    joined.push(node);
    return joined;
  }, []);

/**
 * Whether markdown reads `char` as neither white space nor punctuation.
 * Beside such a character `_` can neither open nor close emphasis, since an
 * underscore inside a word (`snake_case`) is read as typed; `*` can.
 */
const isWordCharacter = (char: string | undefined): boolean =>
  char !== undefined &&
  !/\s/u.test(char) &&
  !ASCII_PUNCTUATION.test(char) &&
  !/\p{P}/u.test(char);

type InlinePiece = Readonly<{ node?: RichTextContent; markdown: string }>;

/**
 * Inline pieces as markdown, each italic one written with `*` in place of
 * `_` where what is written beside it is a letter, a digit, an emoji or
 * another word character, so that the emphasis is still read there.
 */
const joinWithItalicDelimiters = (pieces: readonly InlinePiece[]): string =>
  pieces
    .map(({ node, markdown }, index) => {
      if (
        node?.type !== 'text' ||
        !getMark(node, 'italic') ||
        getMark(node, 'bold') ||
        !markdown.startsWith('_')
      ) {
        return markdown;
      }
      const before = Array.from(pieces[index - 1]?.markdown ?? '').at(-1);
      const after = Array.from(pieces[index + 1]?.markdown ?? '')[0];
      return isWordCharacter(before) || isWordCharacter(after)
        ? `*${markdown.slice(1, -1)}*`
        : markdown;
    })
    .join('');

const serializeInline = (
  content: RichTextContent[] | undefined,
  options: SerializeInlineOptions = {},
): string => {
  const nodes = joinedTextRuns(content ?? []);
  const parts: InlinePiece[] = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];

    if (!node) {
      index += 1;
      continue;
    }

    const target = options.links === false ? undefined : getLinkTarget(node);

    if (!target || node.type !== 'text') {
      parts.push({ node, markdown: serializeInlineNode(node, options) });
      index += 1;
      continue;
    }

    const end = findLinkRunEnd(nodes, index, target);
    const inner = joinWithItalicDelimiters(
      nodes.slice(index, end).map((runNode) => ({
        node: runNode,
        markdown: serializeInlineNode(runNode, options),
      })),
    );

    parts.push({ markdown: serializeLink(inner, target) });
    index = end;
  }

  return joinWithItalicDelimiters(parts);
};

const getInlineContent = (node: RichTextContent): RichTextContent[] => {
  switch (node.type) {
    case 'text':
    case 'hardBreak':
      return [node];

    case 'paragraph':
    case 'heading':
      return node.content ?? [];

    case undefined:
    default:
      return flattenInlineContent(node.content);
  }
};

/**
 * Every block's text, run together on one line with a space between blocks.
 *
 * The space goes between blocks that SAID something, not after every block
 * that was not the first one. A block contributing nothing is dropped, so
 * counting it as a predecessor puts a separator where there is nothing to
 * separate from: a document whose first paragraph is empty — which an editor
 * leaves behind whenever a selection is cleared and the caret lands in a
 * sibling — serialised with a leading space, and the space was then saved as
 * part of the researcher's question.
 */
const flattenInlineContent = (
  content: RichTextContent[] | undefined,
): RichTextContent[] =>
  (content ?? []).reduce<RichTextContent[]>((flattened, node) => {
    const inlineContent = getInlineContent(node);

    if (inlineContent.length === 0) {
      return flattened;
    }

    if (flattened.length === 0) {
      return inlineContent;
    }

    return [...flattened, { type: 'text', text: ' ' }, ...inlineContent];
  }, []);

// What a list is written with. Two lists of one kind with nothing between
// them read back as one list, so the second of a pair is written with the
// other marker, which starts a new list wherever markdown is read.
type ListMarker = Readonly<{ bullet: '-' | '*'; delimiter: '.' | ')' }>;
const FIRST_MARKER: ListMarker = { bullet: '-', delimiter: '.' };
const OTHER_MARKER: ListMarker = { bullet: '*', delimiter: ')' };

const isList = (node: RichTextContent | undefined): boolean =>
  node?.type === 'bulletList' || node?.type === 'orderedList';

type WrittenBlock = Readonly<{ node: RichTextContent; text: string }>;

/**
 * Sibling blocks as each is written, leaving out those written as nothing.
 * A list that follows a list of its own kind takes the other marker.
 */
const writtenBlocks = (
  content: RichTextContent[] | undefined,
): WrittenBlock[] => {
  const written: WrittenBlock[] = [];
  let previousMarker = FIRST_MARKER;
  for (const node of content ?? []) {
    const previous = written.at(-1)?.node;
    const marker =
      isList(node) && previous?.type === node.type
        ? previousMarker === FIRST_MARKER
          ? OTHER_MARKER
          : FIRST_MARKER
        : FIRST_MARKER;
    const text = serializeBlock(node, marker);
    if (text === '') continue;
    written.push({ node, text });
    previousMarker = marker;
  }
  return written;
};

const indentBlock = (value: string, width: number): string =>
  value
    .split('\n')
    .map((line) => `${' '.repeat(width)}${line}`)
    .join('\n');

// A list straight after the paragraph an item opens with is written on the
// next line, which keeps the list tight. It can be, because such a list
// interrupts a paragraph: a bulleted one always, a numbered one when it
// starts at 1.
const followsOnNextLine = (
  previous: WrittenBlock,
  next: WrittenBlock,
  previousIsFirst: boolean,
): boolean => {
  if (!previousIsFirst || previous.node.type !== 'paragraph') return false;
  if (next.node.type === 'bulletList') return true;
  if (next.node.type !== 'orderedList') return false;
  const start = next.node.attrs?.start;
  return start === undefined || start === 1;
};

/**
 * A list item: its marker, then its blocks, each line after the first set in
 * by the marker's width, which is what makes it part of the item ("10. " is
 * four wide where "- " is two). The blocks are parted by a blank line, as
 * blocks are anywhere, or a paragraph would run on into the one before it.
 * An item that opens with something written as nothing, such as the empty
 * paragraph an item opening with a file is given, opens with what follows.
 */
const serializeListItem = (
  node: RichTextContent,
  index: number,
  ordered: boolean,
  start: number,
  { bullet, delimiter }: ListMarker,
): string => {
  const marker = ordered ? `${start + index}${delimiter} ` : `${bullet} `;
  const [first, ...rest] = writtenBlocks(node.content);
  if (first === undefined) return marker;

  // A paragraph's own later lines carry on wherever they start, and stay as
  // they were written before; anything else an item opens with is set in.
  const opening =
    first.node.type === 'paragraph'
      ? first.text
      : indentBlock(first.text, marker.length).slice(marker.length);
  let item = `${marker}${opening}`;
  let previous = first;
  for (const [position, block] of rest.entries()) {
    const separator = followsOnNextLine(previous, block, position === 0)
      ? '\n'
      : '\n\n';
    item += `${separator}${indentBlock(block.text, marker.length)}`;
    previous = block;
  }
  return item;
};

// A block that names no file shows nothing and is written as nothing. The
// node is read as the editor's (`RichTextAssetBlockAttributes`), each
// setting checked, since a value saved by hand may hold anything.
const serializeAssetBlock = (node: RichTextContent): string => {
  const attributes: Partial<
    Record<keyof RichTextAssetBlockAttributes, unknown>
  > = node.attrs ?? {};
  const { assetId, description, size, align, autoplay, loop } = attributes;
  if (typeof assetId !== 'string' || assetId === '') return '';
  return assetBlockMarkdown({
    assetId,
    ...(typeof description === 'string' &&
      description.trim() !== '' && { description }),
    ...(isAssetBlockSize(size) && { size }),
    ...(isAssetBlockAlignment(align) && { align }),
    ...(autoplay === false && { autoplay }),
    ...(loop === false && { loop }),
  });
};

// A line break that ends a paragraph shows nothing, and markdown does not
// keep one: written out, it came back gone, so the text changed the second
// time it was saved. A paragraph that is only a break is a blank line the
// researcher asked for, and is left alone.
const withoutClosingBreaks = (
  content: RichTextContent[] | undefined,
): RichTextContent[] | undefined => {
  if (content === undefined) return content;
  let end = content.length;
  while (end > 0 && content[end - 1]?.type === 'hardBreak') end -= 1;
  return end === 0 || end === content.length ? content : content.slice(0, end);
};

// White space that opens a paragraph is never drawn, and four columns of it
// would make the paragraph a code block, so it is not written.
const withoutOpeningSpace = (
  content: RichTextContent[] | undefined,
): RichTextContent[] | undefined => {
  const [first, ...rest] = content ?? [];
  if (first?.type !== 'text') return content;
  const text = (first.text ?? '').trimStart();
  return text === ''
    ? withoutOpeningSpace(rest)
    : [{ ...first, text }, ...rest];
};

const serializeBlock = (
  node: RichTextContent,
  marker: ListMarker = FIRST_MARKER,
): string => {
  switch (node.type) {
    case 'doc':
      return serializeBlocks(node.content);

    case 'paragraph':
      return serializeInline(
        withoutOpeningSpace(withoutClosingBreaks(node.content)),
      );

    case 'heading': {
      const rawLevel = node.attrs?.level;
      const level =
        typeof rawLevel === 'number' ? Math.min(Math.max(rawLevel, 1), 4) : 1;
      return `${'#'.repeat(level)} ${serializeInline(node.content)}`;
    }

    case 'bulletList':
      return (node.content ?? [])
        .map((child, index) =>
          serializeListItem(child, index, false, 1, marker),
        )
        .join('\n');

    case 'orderedList': {
      const rawStart = node.attrs?.start;
      const start = typeof rawStart === 'number' ? rawStart : 1;
      return (node.content ?? [])
        .map((child, index) =>
          serializeListItem(child, index, true, start, marker),
        )
        .join('\n');
    }

    case 'listItem':
      return serializeBlocks(node.content);

    case 'horizontalRule':
      return '---';

    case ASSET_BLOCK:
      return serializeAssetBlock(node);

    case 'hardBreak':
      return '  \n';

    case undefined:
      return serializeInline(node.content);

    default:
      return serializeInline(node.content);
  }
};

const serializeBlocks = (content: RichTextContent[] | undefined): string =>
  writtenBlocks(content)
    .map(({ text }) => text)
    .join('\n\n');

const containsContent = (node: RichTextContent): boolean => {
  if (node.type === 'horizontalRule') {
    return true;
  }

  if (node.type === ASSET_BLOCK) {
    return typeof node.attrs?.assetId === 'string' && node.attrs.assetId !== '';
  }

  if (node.type === 'text') {
    return Boolean(node.text && /\S/.test(node.text));
  }

  return (node.content ?? []).some(containsContent);
};

export const richTextContentToMarkdown = (
  content: RichTextContent | null | undefined = EMPTY_DOCUMENT,
  inline = false,
  /** Whether a line (`inline`) keeps its links. A document always does. */
  links = false,
): string => {
  if (!content || !containsContent(content)) {
    return '';
  }

  if (inline) {
    return serializeInline(flattenInlineContent(content.content), { links });
  }

  return serializeBlock(content);
};

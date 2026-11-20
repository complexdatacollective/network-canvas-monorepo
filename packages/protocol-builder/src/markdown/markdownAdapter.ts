import markdown from 'remark-parse';
import { unified } from 'unified';

import {
  ASSET_BLOCK_ALIGNMENTS,
  ASSET_BLOCK_DEFAULTS,
  ASSET_BLOCK_SIZES,
  assetBlockMarkdown,
  escapeMarkdownText,
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
};

const EMPTY_DOCUMENT: RichTextContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const cloneEmptyDocument = (): RichTextContent => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

// An image whose address is written between angle brackets, as markdown
// allows (`![alt](<asset:id>)`): up to and with the bracket that closes it.
const IMAGE_WITH_BRACKETED_ADDRESS =
  /!\[(?:[^[\]\\]|\\.)*\]\([ \t]*<(?:[^<>\n\\]|\\.)*>/;

const BRACKETED_ADDRESS_OR_ANGLE_BRACKET = new RegExp(
  `(${IMAGE_WITH_BRACKETED_ADDRESS.source})|>`,
  'g',
);

/**
 * Matches the legacy Slate editor: literal ">" characters should remain text
 * instead of turning existing protocol content into block quotes on first edit.
 *
 * The one that closes an image's address is not text. Escaped, the image
 * would be read as the words it is written in, where the interview draws the
 * file it names: a block opened here and saved would lose its file.
 */
const escapeAngleBracket = (value = ''): string =>
  value
    .replace(
      BRACKETED_ADDRESS_OR_ANGLE_BRACKET,
      (bracket: string, image: string | undefined) => image ?? '&gt;',
    )
    .replace(/<br&gt;/g, '<br>');

const escapeLinkDestination = (value: string): string =>
  value
    .replace(/\\/g, '%5C')
    .replace(/\s/g, '%20')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/>/g, '%3E');

const escapeLinkTitle = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const LINK_PROTOCOL_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const SCHEME_DELIMITER_PATTERN = /[/?#]/;

type InlineParseOptions = {
  links?: boolean;
};

type SerializeInlineOptions = {
  links?: boolean;
};

const hasUnsafeSchemeCharacters = (href: string): boolean => {
  const colonIndex = href.indexOf(':');

  if (colonIndex === -1) {
    return false;
  }

  const delimiterIndex = href.search(SCHEME_DELIMITER_PATTERN);

  if (delimiterIndex !== -1 && delimiterIndex < colonIndex) {
    return false;
  }

  return /\s/.test(href.slice(0, colonIndex));
};

const hasControlCharacter = (href: string): boolean =>
  Array.from(href).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });

const sanitizeLinkDestination = (
  value: string | null | undefined,
): string | undefined => {
  const href = value?.trim();

  if (!href) {
    return undefined;
  }

  if (hasControlCharacter(href) || hasUnsafeSchemeCharacters(href)) {
    return undefined;
  }

  if (href.startsWith('//')) {
    try {
      const url = new URL(href, 'https://networkcanvas.local');
      return SAFE_LINK_PROTOCOLS.has(url.protocol) ? href : undefined;
    } catch {
      return undefined;
    }
  }

  if (!LINK_PROTOCOL_PATTERN.test(href)) {
    return href;
  }

  try {
    const url = new URL(href);
    return SAFE_LINK_PROTOCOLS.has(url.protocol) ? href : undefined;
  } catch {
    return undefined;
  }
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

    case 'link': {
      const href = sanitizeLinkDestination(node.url);
      const content = childrenAsInline(node, options);

      if (!href || options.links === false) {
        return content;
      }

      return addMark(content, {
        type: 'link',
        attrs: {
          href,
          title: node.title ?? null,
        },
      });
    }

    case 'break':
      return [{ type: 'hardBreak' }];

    case 'inlineCode':
      return node.value ? [{ type: 'text', text: node.value }] : [];

    case 'html':
      return node.value?.toLowerCase() === '<br>'
        ? [{ type: 'hardBreak' }]
        : [];

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
const ASSET_BLOCK = 'assetBlock';

type BlockParseOptions = {
  /** Whether a markdown image naming a file of the protocol is a block. */
  assetBlocks?: boolean;
};

/**
 * The block a markdown image stands for, when its address names a file of
 * the protocol (see protocol-validation's `AssetBlock`). The node carries
 * every setting, with the ones the address leaves out at their defaults, as
 * the editor's node holds them.
 */
const assetBlockFromImage = (
  node: MarkdownNode,
): RichTextContent | undefined => {
  if (node.type !== 'image' || typeof node.url !== 'string') return undefined;
  const reading = readAssetBlockUrl(node.url);
  if (reading === undefined) return undefined;
  const { assetId, size, align, autoplay, loop } = reading.block;
  return {
    type: ASSET_BLOCK,
    attrs: {
      assetId,
      description: node.alt ?? '',
      size: size ?? null,
      align: align ?? ASSET_BLOCK_DEFAULTS.align,
      autoplay: autoplay ?? ASSET_BLOCK_DEFAULTS.autoplay,
      loop: loop ?? ASSET_BLOCK_DEFAULTS.loop,
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
const paragraphWithAssetBlocks = (node: MarkdownNode): RichTextContent[] => {
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
      run.push(...inlineFromMarkdown(child));
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
  switch (node.type) {
    case 'paragraph':
      return options.assetBlocks === true
        ? paragraphWithAssetBlocks(node)
        : [paragraphFromInline(childrenAsInline(node))];

    case 'heading': {
      const level = Math.min(Math.max(node.depth ?? 1, 1), 4);
      return [
        {
          type: 'heading',
          attrs: { level },
          content: childrenAsInline(node),
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

    case 'html':
      if (node.value?.toLowerCase() === '<hr>') {
        return [{ type: 'horizontalRule' }];
      }
      if (node.value?.toLowerCase() === '<br>') {
        return [paragraphFromInline([{ type: 'hardBreak' }])];
      }
      return [];

    default: {
      const content = childrenAsInline(node);
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
  links: boolean,
): RichTextContent => {
  const inlineContent = (root.children ?? []).flatMap((node, index) => {
    const content =
      node.type === 'paragraph' || node.type === 'heading'
        ? childrenAsInline(node, { links })
        : inlineFromMarkdown(node, { links });

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

export const markdownToRichTextContent = (
  value: string | null | undefined,
  inline = false,
  /** Whether a line (`inline`) keeps its links. A document always does. */
  links = false,
  /**
   * Whether a document's images that name a file of the protocol are read as
   * blocks, for a field declared to hold them. Elsewhere, and in a line, an
   * image is its description, as before.
   */
  assetBlocks = false,
): RichTextContent => {
  if (!value || !/\S/.test(value)) {
    return cloneEmptyDocument();
  }

  const root: MarkdownNode = unified()
    .use(markdown)
    .parse(escapeAngleBracket(value));

  if (inline) {
    return inlineDocumentFromMarkdown(root, links);
  }

  const content = (root.children ?? []).flatMap((node) =>
    blockFromMarkdown(node, { assetBlocks }),
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

  const safeHref = sanitizeLinkDestination(href);

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
  const titleText = target.title ? ` "${escapeLinkTitle(target.title)}"` : '';

  return `[${content}](${escapeLinkDestination(target.href)}${titleText})`;
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

const serializeInline = (
  content: RichTextContent[] | undefined,
  options: SerializeInlineOptions = {},
): string => {
  const nodes = content ?? [];
  const parts: string[] = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];

    if (!node) {
      index += 1;
      continue;
    }

    const target = options.links === false ? undefined : getLinkTarget(node);

    if (!target || node.type !== 'text') {
      parts.push(serializeInlineNode(node, options));
      index += 1;
      continue;
    }

    const end = findLinkRunEnd(nodes, index, target);
    const inner = nodes
      .slice(index, end)
      .map((runNode) => serializeInlineNode(runNode, options))
      .join('');

    parts.push(serializeLink(inner, target));
    index = end;
  }

  return parts.join('');
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

const isOneOf = <Value extends string>(
  values: readonly Value[],
  value: unknown,
): value is Value => values.some((candidate) => candidate === value);

// A block that names no file shows nothing and is written as nothing.
const serializeAssetBlock = (node: RichTextContent): string => {
  const { assetId, description, size, align, autoplay, loop } =
    node.attrs ?? {};
  if (typeof assetId !== 'string' || assetId === '') return '';
  return assetBlockMarkdown({
    assetId,
    ...(typeof description === 'string' &&
      description.trim() !== '' && { description }),
    ...(isOneOf(ASSET_BLOCK_SIZES, size) && { size }),
    ...(isOneOf(ASSET_BLOCK_ALIGNMENTS, align) && { align }),
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

const serializeBlock = (
  node: RichTextContent,
  marker: ListMarker = FIRST_MARKER,
): string => {
  switch (node.type) {
    case 'doc':
      return serializeBlocks(node.content);

    case 'paragraph':
      return serializeInline(withoutClosingBreaks(node.content));

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

import type {
  RichTextAssetBlockAttributes,
  RichTextAssetBlockContent,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { linkAddress } from '@codaco/fresco-ui/linkAddress';
import { showHtmlAsTyped } from '@codaco/fresco-ui/markdownTypedHtml';
import {
  assetBlockMarkdown,
  assetBlockSettings,
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

/**
 * A piece of a line as it is written. Text is the researcher's words,
 * escaped; a letter, digit or other word character at either end of it may
 * be written as a character reference instead, which shows the same
 * character (see `writeSegments`). Syntax is markdown the editor writes
 * around words (a link's brackets and address, a line break) and is written
 * as it is. Marked words are bold, italic or both, and are written between
 * the delimiters that `writeSegments` chooses for them.
 */
type Segment =
  | Readonly<{ kind: 'text' | 'syntax'; markdown: string }>
  | Readonly<{ kind: 'marked'; emphasis: Emphasis; markdown: string }>;

type Emphasis = 'italic' | 'bold' | 'bold and italic';

/**
 * The delimiters each emphasis may be written with, the plainest first: `_`
 * for italics, `**` for bold and `***` for both are what the editor has
 * always written, and are kept wherever they are read.
 */
const DELIMITERS: Readonly<Record<Emphasis, readonly string[]>> = {
  'italic': ['_', '*'],
  'bold': ['**', '__'],
  'bold and italic': ['***', '___'],
};

const emphasisOf = (node: RichTextContent): Emphasis | undefined => {
  const bold = getMark(node, 'bold') !== undefined;
  const italic = getMark(node, 'italic') !== undefined;
  if (bold && italic) return 'bold and italic';
  if (bold) return 'bold';
  return italic ? 'italic' : undefined;
};

/**
 * A piece of text as segments. White space at either edge of marked words is
 * written outside the delimiters, where it shows the same: markdown never
 * reads a delimiter beside white space on the inside as opening or closing.
 */
const textSegments = (node: RichTextContent): Segment[] => {
  const value = node.text ?? '';
  const emphasis = emphasisOf(node);
  const [, opening = '', words = '', closing = ''] =
    /^(\s*)([\s\S]*?)(\s*)$/u.exec(value) ?? [];
  if (emphasis === undefined || words === '') {
    return [{ kind: 'text', markdown: escapeMarkdownText(value) }];
  }
  const segments: Segment[] = [
    { kind: 'text', markdown: opening },
    { kind: 'marked', emphasis, markdown: escapeMarkdownText(words) },
    { kind: 'text', markdown: closing },
  ];
  return segments.filter(({ markdown }) => markdown !== '');
};

/** A link's markdown after its label. */
const linkEndMarkdown = (target: LinkTarget): string => {
  const titleText = target.title ? ` ${linkTitleMarkdown(target.title)}` : '';

  return `](${linkDestinationMarkdown(target.href)}${titleText})`;
};

const inlineNodeSegments = (
  node: RichTextContent,
  options: SerializeInlineOptions,
): Segment[] => {
  if (node.type === 'text') {
    return textSegments(node);
  }

  if (node.type === 'hardBreak') {
    return [{ kind: 'syntax', markdown: '  \n' }];
  }

  const markdown = serializeInline(node.content, options);
  return markdown === '' ? [] : [{ kind: 'syntax', markdown }];
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
 * What CommonMark counts a character beside a run of `*` or `_` as: white
 * space (the start or end of a line counts as white space), punctuation (a
 * Unicode punctuation or symbol character), or anything else, such as a
 * letter or digit. Characters are judged one UTF-16 code unit at a time, as
 * the markdown parser that reads stored text judges them, so an emoji
 * outside the Basic Multilingual Plane counts as a letter.
 */
type Flank = 'whitespace' | 'punctuation' | 'other';

const flankOf = (unit: string | undefined): Flank => {
  if (unit === undefined || /\s/u.test(unit)) return 'whitespace';
  return /[\p{P}\p{S}]/u.test(unit) ? 'punctuation' : 'other';
};

/**
 * Whether a run of `marker` written between the characters `before` and
 * `after` can open and can close emphasis, as CommonMark defines it
 * (section 6.2, "Emphasis and strong emphasis"). A run is left-flanking when
 * it is not followed by white space, and is followed by punctuation only if
 * it is preceded by white space or punctuation; right-flanking is the mirror
 * of this. A `*` run opens when it is left-flanking and closes when it is
 * right-flanking. A `_` run must also not stand inside a word: it opens only
 * if it is not right-flanking as well, or is preceded by punctuation, and
 * closes only if it is not left-flanking as well, or is followed by
 * punctuation.
 */
const delimiterRun = (
  marker: string,
  before: string | undefined,
  after: string | undefined,
): Readonly<{ open: boolean; close: boolean }> => {
  const previous = flankOf(before);
  const next = flankOf(after);
  const leftFlanking =
    next !== 'whitespace' && (next !== 'punctuation' || previous !== 'other');
  const rightFlanking =
    previous !== 'whitespace' &&
    (previous !== 'punctuation' || next !== 'other');
  if (marker !== '_') return { open: leftFlanking, close: rightFlanking };
  return {
    open: leftFlanking && (!rightFlanking || previous === 'punctuation'),
    close: rightFlanking && (!leftFlanking || next === 'punctuation'),
  };
};

/** A character as a numeric character reference, which shows the same. */
const characterReference = (character: string): string =>
  `&#${character.codePointAt(0) ?? 0};`;

type Placed = {
  /** For marked words, the delimiter chosen. */
  delimiter?: string;
  /** For text, whether its first or last character is written as a reference. */
  referenceFirst?: boolean;
  referenceLast?: boolean;
};

const writtenSegment = (segment: Segment, placed: Placed): string => {
  if (segment.kind === 'marked') {
    // Until its delimiter is chosen, a `*` stands for it: either delimiter
    // is punctuation to what stands beside it.
    const delimiter = placed.delimiter ?? '*';
    return `${delimiter}${segment.markdown}${delimiter}`;
  }
  if (segment.kind === 'syntax') return segment.markdown;
  const characters = Array.from(segment.markdown);
  const last = characters.length - 1;
  return characters
    .map((character, index) =>
      (placed.referenceFirst === true && index === 0) ||
      (placed.referenceLast === true && index === last)
        ? characterReference(character)
        : character,
    )
    .join('');
};

/**
 * Segments of a line as markdown, with delimiters for each run of marked
 * words that markdown reads as opening and closing that emphasis, given the
 * characters written on each side of it. The plainest delimiter that is read
 * is used. Where none is read (marked words that begin with punctuation
 * directly after a letter, say), the letter beside them is written as a
 * character reference, which markdown counts as punctuation, and the
 * delimiters are chosen again. Two runs side by side are never written with
 * the same character, which would join them into one run.
 */
const writeSegments = (segments: readonly Segment[]): string => {
  const placed: Placed[] = segments.map(() => ({}));
  const written = (index: number): string | undefined => {
    const segment = segments[index];
    const place = placed[index];
    return segment === undefined || place === undefined
      ? undefined
      : writtenSegment(segment, place);
  };
  /** Whether the text at `index` can have the character at its edge referenced. */
  const referable = (index: number, edge: 'first' | 'last'): boolean => {
    const markdown = written(index);
    const unit = edge === 'first' ? markdown?.[0] : markdown?.at(-1);
    return segments[index]?.kind === 'text' && flankOf(unit) === 'other';
  };

  segments.forEach((segment, index) => {
    const place = placed[index];
    if (segment.kind !== 'marked' || place === undefined) return;
    const previous = placed[index - 1];
    const next = placed[index + 1];
    const first = segment.markdown[0];
    const last = segment.markdown.at(-1);
    const options = [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ].filter(
      ([before, after]) =>
        (!before || referable(index - 1, 'last')) &&
        (!after || referable(index + 1, 'first')),
    );
    for (const [referenceBefore, referenceAfter] of options) {
      if (previous !== undefined) previous.referenceLast = referenceBefore;
      if (next !== undefined) next.referenceFirst = referenceAfter;
      const before = written(index - 1)?.at(-1);
      const after = written(index + 1)?.[0];
      const delimiter = DELIMITERS[segment.emphasis].find((candidate) => {
        const marker = candidate.charAt(0);
        const joinsRun =
          segments[index - 1]?.kind === 'marked' && before === marker;
        return (
          !joinsRun &&
          delimiterRun(marker, before, first).open &&
          delimiterRun(marker, last, after).close
        );
      });
      if (delimiter !== undefined) {
        place.delimiter = delimiter;
        return;
      }
    }
    // Not reached: with a reference on each side, or punctuation there,
    // the first delimiter that does not join the run before it is read.
    place.delimiter = DELIMITERS[segment.emphasis][0];
  });

  return segments.map((_segment, index) => written(index) ?? '').join('');
};

const inlineSegments = (
  content: RichTextContent[] | undefined,
  options: SerializeInlineOptions,
): Segment[] => {
  const nodes = joinedTextRuns(content ?? []);
  const segments: Segment[] = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];

    if (!node) {
      index += 1;
      continue;
    }

    const target = options.links === false ? undefined : getLinkTarget(node);

    if (!target || node.type !== 'text') {
      segments.push(...inlineNodeSegments(node, options));
      index += 1;
      continue;
    }

    const end = findLinkRunEnd(nodes, index, target);
    segments.push({ kind: 'syntax', markdown: '[' });
    for (const runNode of nodes.slice(index, end)) {
      segments.push(...inlineNodeSegments(runNode, options));
    }
    segments.push({ kind: 'syntax', markdown: linkEndMarkdown(target) });
    index = end;
  }

  return segments;
};

const serializeInline = (
  content: RichTextContent[] | undefined,
  options: SerializeInlineOptions = {},
): string => writeSegments(inlineSegments(content, options));

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

// White space that closes a paragraph is never drawn either, and markdown
// does not keep it: written out, it came back gone, so the text changed the
// second time it was saved.
const withoutClosingSpace = (content: RichTextContent[]): RichTextContent[] => {
  const last = content.at(-1);
  if (last?.type !== 'text') return content;
  const text = (last.text ?? '').trimEnd();
  const rest = content.slice(0, -1);
  return text === '' ? withoutClosingSpace(rest) : [...rest, { ...last, text }];
};

// The same holds at each end of a line that a line break ends or begins.
const withoutSpaceAtLineEdges = (
  content: RichTextContent[] | undefined,
): RichTextContent[] | undefined => {
  if (content === undefined) return content;
  const lines: RichTextContent[][] = [[]];
  for (const node of content) {
    if (node.type === 'hardBreak') lines.push([]);
    else lines.at(-1)?.push(node);
  }
  return lines.flatMap((line, index) => [
    ...(index === 0 ? [] : [{ type: 'hardBreak' }]),
    ...withoutClosingSpace(withoutOpeningSpace(line) ?? []),
  ]);
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
        withoutSpaceAtLineEdges(withoutClosingBreaks(node.content)),
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
    return serializeInline(
      withoutSpaceAtLineEdges(flattenInlineContent(content.content)),
      { links },
    );
  }

  return serializeBlock(content);
};

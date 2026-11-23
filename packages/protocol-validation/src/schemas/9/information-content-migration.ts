import { toMarkdown } from 'mdast-util-to-markdown';

import {
  type AssetBlock,
  type AssetBlockSize,
  assetBlockMarkdown,
  assetBlockMessage,
  isAssetBlockKind,
} from '../../localization/assetBlock.ts';
import { assetInManifest } from '../../localization/assetBlockDisplay.ts';
import { isBlankMessage, isBlankText } from '../../localization/blankText.ts';
import type { LocalizationDeclaration } from '../../localization/localeTag.ts';
import {
  headingMarkdown,
  messageHeadingMarkdown,
} from '../../localization/markdownText.ts';
import { markdownTree } from '../../localization/markdownTree.ts';
import { escapeMessageText } from '../../localization/messageSyntax.ts';
import { resolveTextsInEachLocale } from '../../localization/resolveLocalizedString.ts';
import {
  legacyMarkdownAsStandard,
  type TextsWrittenAsStandard,
} from './legacy-markdown.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One piece of a page, as markdown: text as schema 8 held it (`plain`), or
 * the ICU messages a document already in schema 9 form holds for each
 * language (`localized`).
 */
type Part =
  | Readonly<{
      kind: 'plain';
      markdown: string;
      /**
       * Whether this was a text item, written by the researcher as markdown,
       * rather than a heading or a file, which are written here.
       */
      authored?: true;
    }>
  | Readonly<{
      kind: 'localized';
      messages: Readonly<Record<string, string>>;
    }>;

/**
 * A piece of an Information page as it was drawn, apart from the others: its
 * heading, a block of text, or a file. A heading, a text or a description is
 * a string, in the page's default language, or a message for each language.
 * A heading and a description are plain text; a text is markdown.
 */
export type InformationPagePart =
  | Readonly<{ kind: 'heading'; text: unknown }>
  | Readonly<{ kind: 'text'; text: unknown }>
  | Readonly<{
      kind: 'file';
      block: Omit<AssetBlock, 'description'>;
      description?: unknown;
    }>;

/** The translations of localized text that say something. */
const shownMessages = (text: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(text).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && !isBlankMessage(entry[1]),
    ),
  );

const mapMessages = (
  messages: Readonly<Record<string, string>>,
  map: (message: string) => string,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(messages).map(([locale, message]) => [locale, map(message)]),
  );

const headingPart = (title: unknown): Part | undefined => {
  if (typeof title === 'string') {
    return isBlankText(title)
      ? undefined
      : { kind: 'plain', markdown: headingMarkdown(title) };
  }
  if (!isRecord(title)) return undefined;
  const messages = shownMessages(title);
  return Object.keys(messages).length === 0
    ? undefined
    : {
        kind: 'localized',
        messages: mapMessages(messages, messageHeadingMarkdown),
      };
};

const BETWEEN_BLOCKS = '\n\n';

// A word that is nothing but a word to markdown.
const PROBE = 'probe';

// Whether what is written after this markdown, a blank line on, is read
// apart from it, as the next of the text's own blocks.
const endsItself = (markdown: string): boolean => {
  const last = markdownTree(`${markdown}${BETWEEN_BLOCKS}${PROBE}`).children.at(
    -1,
  );
  if (last?.type !== 'paragraph' || last.children.length !== 1) return false;
  const [only] = last.children;
  return only?.type === 'text' && only.value === PROBE;
};

// What closes the block markdown ends in, where a blank line does not: a
// fenced code block left open, or HTML that runs until its own end is
// written (a comment, a `<pre>`).
const closingOf = (markdown: string): string | undefined => {
  const last = markdownTree(markdown).children.at(-1);
  if (last?.type === 'code') {
    const from = last.position?.start.offset;
    if (from === undefined) return undefined;
    return /^(`{3,}|~{3,})/.exec(markdown.slice(from))?.[1];
  }
  if (last?.type !== 'html') return undefined;
  const html = last.value.trimStart();
  if (html.startsWith('<!--')) return '-->';
  if (html.startsWith('<?')) return '?>';
  if (html.startsWith('<![CDATA[')) return ']]>';
  if (/^<![a-z]/i.test(html)) return '>';
  const element = /^<(pre|script|style|textarea)(?=[\s>]|$)/i.exec(html)?.[1];
  return element === undefined ? undefined : `</${element}>`;
};

type Tree = ReturnType<typeof markdownTree>;
type TreeNode = Tree['children'][number];

/**
 * A text item as markdown that reads the same with the rest of the page
 * written after it as it read alone. Schema 8 drew each item by itself, so
 * what one left open ended with it; in one text it would run on over every
 * item below, hiding their words and their files. Two blocks run on past a
 * blank line: a fenced code block, and raw HTML that runs until its own end
 * is written (a comment, a `<pre>`). Either is closed here, where the item
 * ended, with the end it lacked: a fence, which shows nothing, or the HTML's
 * own end (`-->`, `</pre>`), which is shown with the rest of the HTML as the
 * characters typed. The spaces an item opened with meant nothing by
 * themselves, and below a list would make it part of the list's last item,
 * so they go.
 */
const selfContained = (markdown: string): string => {
  const flush = markdown.replace(/^(?:[^\S\n]*\n)*[ ]{0,3}(?=\S)/, '');
  if (endsItself(flush)) return flush;
  const closing = closingOf(flush);
  if (closing === undefined) return flush;
  const closed = `${flush}\n${closing}`;
  return endsItself(closed) ? closed : flush;
};

const textPart = (content: unknown): Part | undefined => {
  if (typeof content === 'string') {
    return isBlankText(content)
      ? undefined
      : { kind: 'plain', markdown: selfContained(content), authored: true };
  }
  if (!isRecord(content)) return undefined;
  const messages = shownMessages(content);
  return Object.keys(messages).length === 0
    ? undefined
    : { kind: 'localized', messages: mapMessages(messages, selfContained) };
};

const SIZES: Readonly<Record<string, AssetBlockSize>> = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
};

const assetKindOf = (assetManifest: unknown, assetId: string): unknown => {
  if (!isRecord(assetManifest)) return undefined;
  const asset = assetInManifest(assetManifest, assetId);
  return isRecord(asset) ? asset.type : undefined;
};

/**
 * The block an asset item becomes, with its description, or nothing where it
 * showed no file.
 */
const itemFile = (
  item: Record<string, unknown>,
  assetManifest: unknown,
): InformationPagePart | undefined => {
  const { content: assetId, description, size } = item;
  // An item naming no file showed a notice that it was unavailable, and has
  // nothing a block could name.
  if (typeof assetId !== 'string' || assetId === '') return undefined;
  // Nor has one naming a file the protocol does not hold, or one a page
  // cannot show (a roster, a map layer): it showed the same notice, and a
  // block naming it would be refused when the protocol is checked.
  const kind = assetKindOf(assetManifest, assetId);
  if (!isAssetBlockKind(kind)) return undefined;
  return {
    kind: 'file',
    block: {
      assetId,
      // Size shaped images and videos only; an audio player has one height.
      ...(kind !== 'audio' &&
        typeof size === 'string' &&
        SIZES[size] !== undefined && { size: SIZES[size] }),
      // Audio played once where video repeated, and its player sat where a
      // line of text starts where images were centred; a block repeats and
      // is centred unless it says otherwise.
      ...(kind === 'audio' && { align: 'start', loop: false }),
    },
    description,
  };
};

const filePart = (
  block: Omit<AssetBlock, 'description'>,
  description: unknown,
): Part => {
  if (typeof description === 'string' && !isBlankText(description)) {
    return {
      kind: 'plain',
      markdown: assetBlockMarkdown({ ...block, description }),
    };
  }
  const unnamed: Part = { kind: 'plain', markdown: assetBlockMarkdown(block) };
  if (!isRecord(description)) return unnamed;
  const messages = shownMessages(description);
  if (Object.keys(messages).length === 0) return unnamed;
  return {
    kind: 'localized',
    messages: mapMessages(messages, (message) =>
      assetBlockMessage({ ...block, description: message }),
    ),
  };
};

/**
 * A text item's text as standard markdown. Schema 8 read a string the legacy
 * way, so it is rewritten (see `legacyMarkdownAsStandard`); the page holds
 * several lines. Text already localized is a document in schema 9 form, and
 * standard markdown already.
 */
const standardItemText = (content: unknown): unknown =>
  typeof content === 'string'
    ? legacyMarkdownAsStandard(content, { lines: 'multiple' })
    : content;

const itemPart = (
  item: unknown,
  assetManifest: unknown,
): InformationPagePart | undefined => {
  if (!isRecord(item)) return undefined;
  if (item.type === 'text') {
    return { kind: 'text', text: standardItemText(item.content) };
  }
  if (item.type === 'asset') return itemFile(item, assetManifest);
  return undefined;
};

const eachNode = (
  siblings: TreeNode[],
  visit: (node: TreeNode, index: number, siblings: TreeNode[]) => void,
): void => {
  for (const [index, node] of siblings.entries()) {
    visit(node, index, siblings);
    // The visit may have put another node in its place.
    const now = siblings[index];
    if (now !== undefined && 'children' in now) eachNode(now.children, visit);
  }
};

const withoutDefinitions = (siblings: TreeNode[]): void => {
  for (let index = siblings.length - 1; index >= 0; index -= 1) {
    const node = siblings[index];
    if (node === undefined) continue;
    if (node.type === 'definition') siblings.splice(index, 1);
    else if ('children' in node) withoutDefinitions(node.children);
  }
};

/**
 * What markdown is made of, read by itself, with each link and image that
 * names its address by reference (`[text][label]`, with `[label]: address`
 * written elsewhere) holding the address instead. A label belongs to the
 * whole text it is written in, so two items using one label for two
 * addresses, or one item's label matching words another wrote in brackets,
 * would read differently joined; an address written in the link reads the
 * same anywhere.
 */
const blocksOf = (markdown: string): TreeNode[] => {
  const { children } = markdownTree(markdown);
  const definitions = new Map<
    string,
    Readonly<{ url: string; title?: string | null }>
  >();
  eachNode(children, (node) => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node);
    }
  });
  if (definitions.size === 0) return children;
  eachNode(children, (node, index, siblings) => {
    if (node.type !== 'linkReference' && node.type !== 'imageReference') {
      return;
    }
    const definition = definitions.get(node.identifier);
    if (definition === undefined) return;
    const { url, title } = definition;
    siblings[index] =
      node.type === 'linkReference'
        ? { type: 'link', url, title, children: node.children }
        : { type: 'image', url, title, alt: node.alt };
  });
  withoutDefinitions(children);
  return children;
};

// What was read, without where in the text each thing was read from.
const shapeOf = (blocks: readonly TreeNode[]): string =>
  JSON.stringify(blocks, (key, value: unknown) =>
    key === 'position' ? undefined : value,
  );

/**
 * Whether the pieces, written one after another with a blank line between,
 * read as each of them read alone. Schema 8 drew each item by itself, so
 * this is whether a participant is shown the page they were shown before.
 * Two lists of one kind, one ending an item and one opening the next, read
 * joined as one list numbered straight through; a link's label defined in
 * one item is defined for them all.
 */
const readsAsItsPieces = (pieces: readonly string[]): boolean => {
  const alone = pieces.map(blocksOf);
  return (
    shapeOf(blocksOf(pieces.join(BETWEEN_BLOCKS))) === shapeOf(alone.flat())
  );
};

/**
 * Text items that follow one another, written out again from what each was
 * read as. Writing from what was read, rather than joining what was
 * written, is what keeps the items apart: a list that follows a list is
 * given the other marker, which starts a new list; nothing is left open;
 * and no label is left to be shared. The words and what they show are
 * unchanged, though how they are spelled may not be (`*` for `_`, a code
 * block fenced where it was indented).
 */
const writtenAgain = (items: readonly TreeNode[][]): string =>
  toMarkdown(
    { type: 'root', children: items.flat() },
    { bullet: '-', rule: '-' },
  ).trimEnd();

/**
 * The parts schema 8 wrote, as one text. They are joined as they are
 * wherever that reads as they read apart, which is nearly always. Where it
 * does not, the heading and the files are still joined as they are, and the
 * text items between them are written again (see `writtenAgain`).
 */
const joinPlainParts = (
  parts: readonly Extract<Part, { kind: 'plain' }>[],
): string => {
  const pieces = parts.map((part) => part.markdown);
  if (readsAsItsPieces(pieces)) return pieces.join(BETWEEN_BLOCKS);

  const written: string[] = [];
  let items: TreeNode[][] = [];
  const endItems = () => {
    if (items.length === 0) return;
    const text = writtenAgain(items);
    if (text !== '') written.push(text);
    items = [];
  };
  for (const part of parts) {
    if (part.authored) {
      items.push(blocksOf(part.markdown));
      continue;
    }
    endItems();
    written.push(part.markdown);
  }
  endItems();
  return written.join(BETWEEN_BLOCKS);
};

/**
 * The parts as one text. Parts schema 8 wrote are joined into one string
 * (see `joinPlainParts`), for the migration to record in the protocol's
 * language with the rest of its text. Where a part is already localized,
 * which only a document written for schema 9 before it kept a page as one
 * text can be, the page is written once for each language any part has,
 * each part as the interview showed it to a participant reading that
 * language: its own translation, or failing that the one the interview fell
 * back to (see `resolveTextsInEachLocale`). Those are joined as they are: a
 * message is not markdown until its values are filled in, and cannot be
 * written again from what it reads as.
 */
const joinParts = (
  parts: readonly Part[],
  defaultLocale: string,
): string | Record<string, string> => {
  const plain = parts.filter((part) => part.kind === 'plain');
  if (plain.length === parts.length) return joinPlainParts(plain);
  const read = resolveTextsInEachLocale(
    parts.map((part) =>
      part.kind === 'plain' ? escapeMessageText(part.markdown) : part.messages,
    ),
    defaultLocale,
  );
  return Object.fromEntries(
    Object.entries(read).map(([locale, messages]) => [
      locale,
      messages.join(BETWEEN_BLOCKS),
    ]),
  );
};

const pagePart = (part: InformationPagePart): Part | undefined => {
  if (part.kind === 'heading') return headingPart(part.text);
  if (part.kind === 'text') return textPart(part.text);
  return filePart(part.block, part.description);
};

/**
 * An Information page drawn as separate parts (a heading, blocks of text and
 * files, in order), as one text that a participant reads as they read the
 * parts. A heading is escaped to show as written; a text is left as it is,
 * since it is markdown already; and each file is a block naming it (see
 * `AssetBlock`), with its description. A text that left a code block or raw
 * HTML open is closed where it ended (see `selfContained`), so the parts
 * below it are still shown; and where texts would still read differently as
 * one text than each read alone, they are written again in a form that does
 * not (see `joinPlainParts`). A heading, text or description of only spaces
 * showed nothing and is left out; a page that would then be empty takes
 * `fallbackHeading` (the stage's name) as its heading, since the text must
 * say something, and with nothing there either there is no text.
 *
 * Parts written as strings give a string, in the default language, for the
 * caller to record as that language's text (escaped as a message, with
 * `escapeMessageText`); where any part is written per language, the text is
 * written per language (see `joinParts`).
 */
export const informationPageContent = (
  parts: readonly InformationPagePart[],
  {
    defaultLocale,
    fallbackHeading,
  }: Readonly<{ defaultLocale: string; fallbackHeading?: unknown }>,
): string | Record<string, string> | undefined => {
  const written = parts.map(pagePart).filter((part) => part !== undefined);
  const fallback =
    written.length === 0 ? headingPart(fallbackHeading) : undefined;
  const shown = fallback === undefined ? written : [fallback];
  return shown.length === 0 ? undefined : joinParts(shown, defaultLocale);
};

/**
 * Schema 9 keeps an Information stage's page as one text, where schema 8
 * had a title the interview showed as a heading and a list of items below it,
 * each a block of text or a file. The page is written out in the order it
 * was shown, as `informationPageContent` joins parts drawn apart: the title
 * as its heading, each text item, and each file item as a block with its
 * description and size. An item naming a file that is not an image, an
 * audio recording or a video among the protocol's assets showed a notice
 * that it was unavailable, and is left out.
 *
 * A file's description names it for a participant who cannot see or hear
 * it. A text item's was a note to the researcher that no participant saw,
 * and the text has nowhere to keep one, so it is left out, as is each item's
 * `id`. A page left with nothing to show takes the stage's name as its
 * heading.
 *
 * A stage already written as one text is left as it is, so migrating one
 * document twice gives one result.
 *
 * Each text item is rewritten as standard markdown before the page is joined
 * (see `legacyMarkdownAsStandard`), so the page is read as the participant
 * was shown it; the page is recorded in `written`, when given, as written
 * that way.
 */
export const combineInformationContent = (
  protocol: unknown,
  { defaultLocale }: LocalizationDeclaration,
  written?: TextsWrittenAsStandard,
) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'Information') continue;
    if (stage.content !== undefined) continue;
    const { title, items, ...rest } = stage;
    if (title === undefined && items === undefined) continue;
    const parts: InformationPagePart[] = [
      { kind: 'heading', text: title },
      ...(Array.isArray(items) ? items : [])
        .map((item: unknown) => itemPart(item, protocol.assetManifest))
        .filter((part) => part !== undefined),
    ];
    const content = informationPageContent(parts, {
      defaultLocale,
      fallbackHeading: stage.label,
    });
    for (const key of Object.keys(stage)) Reflect.deleteProperty(stage, key);
    Object.assign(
      stage,
      rest,
      // With nothing to show and no name either, the text is left for
      // validation to report.
      content !== undefined && { content },
    );
    if (content !== undefined) written?.add(stage, 'content');
  }
};

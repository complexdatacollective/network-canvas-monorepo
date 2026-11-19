import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';

import {
  type AssetBlock,
  type AssetBlockSize,
  assetBlockMarkdown,
  assetBlockUrl,
  isAssetBlockKind,
} from '../../localization/assetBlock.ts';
import { isBlankMessage, isBlankText } from '../../localization/blankText.ts';
import type { LocalizationDeclaration } from '../../localization/localeTag.ts';
import { escapeMarkdownText } from '../../localization/markdownText.ts';
import { markdownTree } from '../../localization/markdownTree.ts';
import {
  type MessageNode,
  messageStructure,
  printMessageStructure,
} from '../../localization/messageStructure.ts';
import { escapeMessageText } from '../../localization/messageSyntax.ts';

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

// A heading is one line, so a line break in it becomes a space, and a run of
// # that ends it would close the heading rather than show.
const headingLine = (escaped: string): string =>
  `# ${escaped.replace(/(\s)(#+)$/, '$1\\$2')}`;

/** Plain text as a top-level markdown heading that shows it as written. */
export const headingMarkdown = (text: string): string =>
  headingLine(escapeMarkdownText(text.trim().replace(/\s+/g, ' ')));

const mapText = (
  nodes: readonly MessageNode[],
  map: (text: string) => string,
): MessageNode[] =>
  nodes.map((node) => {
    if (node.kind === 'text') return { kind: 'text', text: map(node.text) };
    if (node.kind !== 'switch') return node;
    return {
      ...node,
      versions: node.versions.map((version) => ({
        key: version.key,
        nodes: mapText(version.nodes, map),
      })),
    };
  });

/**
 * A message of plain text as a message of markdown that shows the same
 * words: its text is escaped, and what it shows of a value is left alone. A
 * message that cannot be read is kept as written, for validation to report.
 */
const plainMessageAsMarkdown = (message: string): string => {
  const structure = messageStructure(message);
  if (!('nodes' in structure)) return message;
  return printMessageStructure(
    mapText(structure.nodes, (text) =>
      escapeMarkdownText(text.replace(/\s+/g, ' ')),
    ),
  );
};

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
        messages: mapMessages(messages, (message) =>
          headingLine(plainMessageAsMarkdown(message).trim()),
        ),
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

/**
 * A text item as markdown that reads the same with the rest of the page
 * written after it as it read alone. Schema 8 drew each item by itself, so
 * what one left open ended with it; in one text it would run on over every
 * item below, hiding their words and their files. It is closed here, where
 * it ended. The spaces an item opened with meant nothing by themselves, and
 * below a list would make it part of the list's last item, so they go.
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
  if (!isRecord(assetManifest) || !Object.hasOwn(assetManifest, assetId)) {
    return undefined;
  }
  const asset = assetManifest[assetId];
  return isRecord(asset) ? asset.type : undefined;
};

const assetPart = (
  item: Record<string, unknown>,
  assetManifest: unknown,
): Part | undefined => {
  const { content: assetId, description, size } = item;
  // An item naming no file showed a notice that it was unavailable, and has
  // nothing a block could name.
  if (typeof assetId !== 'string' || assetId === '') return undefined;
  // Nor has one naming a file the protocol does not hold, or one a page
  // cannot show (a roster, a map layer): it showed the same notice, and a
  // block naming it would be refused when the protocol is checked.
  const kind = assetKindOf(assetManifest, assetId);
  if (!isAssetBlockKind(kind)) return undefined;
  const block: AssetBlock = {
    assetId,
    // Size shaped images and videos only; an audio player has one height.
    ...(kind !== 'audio' &&
      typeof size === 'string' &&
      SIZES[size] !== undefined && { size: SIZES[size] }),
    // Audio played once where video repeated, and its player sat where a
    // line of text starts where images were centred; a block repeats and is
    // centred unless it says otherwise.
    ...(kind === 'audio' && { align: 'start', loop: false }),
  };
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
  const url = assetBlockUrl(block);
  return {
    kind: 'localized',
    messages: mapMessages(
      messages,
      (message) => `![${plainMessageAsMarkdown(message).trim()}](${url})`,
    ),
  };
};

const itemPart = (item: unknown, assetManifest: unknown): Part | undefined => {
  if (!isRecord(item)) return undefined;
  if (item.type === 'text') return textPart(item.content);
  if (item.type === 'asset') return assetPart(item, assetManifest);
  return undefined;
};

type Tree = ReturnType<typeof markdownTree>;
type TreeNode = Tree['children'][number];

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

const footnotesOf = (blocks: TreeNode[]): Set<string> => {
  const identifiers = new Set<string>();
  eachNode(blocks, (node) => {
    if (node.type === 'footnoteDefinition') identifiers.add(node.identifier);
  });
  return identifiers;
};

/**
 * Whether the pieces, written one after another with a blank line between,
 * read as each of them read alone. Schema 8 drew each item by itself, so
 * this is whether a participant is shown the page they were shown before.
 * Two lists of one kind, one ending an item and one opening the next, read
 * joined as one list numbered straight through; a link's label defined in
 * one item is defined for them all; a footnote numbered 1 in two items is
 * one footnote.
 */
const readsAsItsPieces = (pieces: readonly string[]): boolean => {
  const alone = pieces.map(blocksOf);
  const footnotes = new Set<string>();
  for (const blocks of alone) {
    for (const identifier of footnotesOf(blocks)) {
      if (footnotes.has(identifier)) return false;
      footnotes.add(identifier);
    }
  }
  return (
    shapeOf(blocksOf(pieces.join(BETWEEN_BLOCKS))) === shapeOf(alone.flat())
  );
};

// A footnote's label belongs to the whole text, as a link's does, and cannot
// be written into the text in its place: each item's are given labels of
// their own. A participant sees a footnote's number, never its label.
const withFootnotesOf = (blocks: TreeNode[], item: number): TreeNode[] => {
  eachNode(blocks, (node) => {
    if (
      node.type !== 'footnoteDefinition' &&
      node.type !== 'footnoteReference'
    ) {
      return;
    }
    node.label = `${item}-${node.label ?? node.identifier}`;
    node.identifier = `${item}-${node.identifier}`;
  });
  return blocks;
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
    {
      extensions: [gfmToMarkdown()],
      bullet: '-',
      rule: '-',
    },
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
  for (const [index, part] of parts.entries()) {
    if (part.authored) {
      items.push(withFootnotesOf(blocksOf(part.markdown), index + 1));
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
 * text can be, the page is written once for each language any part has: a
 * part without that language reads there as it does in the default
 * language, or failing that in whichever language it has, which is what the
 * interview showed in its place. Those are joined as they are: a message is
 * not markdown until its values are filled in, and cannot be written again
 * from what it reads as.
 */
const joinParts = (
  parts: readonly Part[],
  defaultLocale: string,
): string | Record<string, string> => {
  const plain = parts.filter((part) => part.kind === 'plain');
  if (plain.length === parts.length) return joinPlainParts(plain);
  const locales = new Set<string>();
  for (const part of parts) {
    if (part.kind !== 'localized') continue;
    for (const locale of Object.keys(part.messages)) locales.add(locale);
  }
  const messageIn = (part: Part, locale: string): string => {
    if (part.kind === 'plain') return escapeMessageText(part.markdown);
    return (
      part.messages[locale] ??
      part.messages[defaultLocale] ??
      Object.values(part.messages)[0] ??
      ''
    );
  };
  return Object.fromEntries(
    [...locales].map((locale) => [
      locale,
      parts.map((part) => messageIn(part, locale)).join(BETWEEN_BLOCKS),
    ]),
  );
};

/**
 * Schema 9 keeps an Information stage's page as one text, where schema 8
 * had a title the interview showed as a heading and a list of items below it,
 * each a block of text or a file. The page is written out in the order it
 * was shown: the title as a heading, escaped to show as written; each text
 * item as it is, since it was markdown already; and each file as a block
 * naming it (see `AssetBlock`), with its description and size. A text item
 * that left a code block or raw HTML open is closed where it ended (see
 * `selfContained`), so the items below it are still shown; and where the
 * items would still read differently as one text than each read alone, they
 * are written again in a form that does not (see `joinPlainParts`). An item
 * naming a file that is not an image, an audio recording or a video among the
 * protocol's assets showed a notice that it was unavailable, and is left out.
 *
 * A file's description names it for a participant who cannot see or hear
 * it. A text item's was a note to the researcher that no participant saw,
 * and the text has nowhere to keep one, so it is left out, as is each item's
 * `id`.
 *
 * Schema 8 accepted a title or a text item of only spaces, which showed
 * nothing; each is left out, so the page still shows nothing in its place. A
 * page that would then be empty takes the stage's name as its heading, since
 * the text must say something.
 *
 * A stage already written as one text is left as it is, so migrating one
 * document twice gives one result.
 */
export const combineInformationContent = (
  protocol: unknown,
  { defaultLocale }: LocalizationDeclaration,
) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'Information') continue;
    if (stage.content !== undefined) continue;
    const { title, items, ...rest } = stage;
    if (title === undefined && items === undefined) continue;
    const written = [
      headingPart(title),
      ...(Array.isArray(items) ? items : []).map((item: unknown) =>
        itemPart(item, protocol.assetManifest),
      ),
    ].filter((part) => part !== undefined);
    const fallback =
      written.length === 0 ? headingPart(stage.label) : undefined;
    const parts = fallback === undefined ? written : [fallback];
    for (const key of Object.keys(stage)) Reflect.deleteProperty(stage, key);
    Object.assign(
      stage,
      rest,
      // With nothing to show and no name either, the text is left for
      // validation to report.
      parts.length > 0 && { content: joinParts(parts, defaultLocale) },
    );
  }
};

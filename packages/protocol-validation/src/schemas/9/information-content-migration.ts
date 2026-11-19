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
  | Readonly<{ kind: 'plain'; markdown: string }>
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

const textPart = (content: unknown): Part | undefined => {
  if (typeof content === 'string') {
    return isBlankText(content)
      ? undefined
      : { kind: 'plain', markdown: content };
  }
  if (!isRecord(content)) return undefined;
  const messages = shownMessages(content);
  return Object.keys(messages).length === 0
    ? undefined
    : { kind: 'localized', messages };
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

const BETWEEN_BLOCKS = '\n\n';

/**
 * The parts as one text. Parts schema 8 wrote are joined as they are, for
 * the migration to record in the protocol's language with the rest of its
 * text. Where a part is already localized, the page is written once for each
 * language any part has: a part without that language reads there as it does
 * in the default language, or failing that in whichever language it has,
 * which is what the interview showed in its place.
 */
const joinParts = (
  parts: readonly Part[],
  defaultLocale: string,
): string | Record<string, string> => {
  if (parts.every((part) => part.kind === 'plain')) {
    return parts.map((part) => part.markdown).join(BETWEEN_BLOCKS);
  }
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
 * naming it (see `AssetBlock`), with its description and size. An item
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

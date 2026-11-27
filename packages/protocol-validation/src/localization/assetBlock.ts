import {
  boundedCache,
  type AssetBlockSize,
  isAssetBlockSize,
} from '@codaco/shared-consts';

import { escapeMarkdownText, messageTextAsMarkdown } from './markdownText.ts';
import { markdownTree } from './markdownTree.ts';
import { type MessageNode, messageStructure } from './messageStructure.ts';

/**
 * A file of the protocol shown in the middle of text: an image, an audio
 * recording or a video. Which of the three it is belongs to the file, not to
 * the block, so the block names only the file and how to show it.
 *
 * Text holds a block as a markdown image in a paragraph of its own, whose
 * address names the file by its id in the protocol's assets:
 *
 *     ![A map of the study area](asset:8a2f0c1e?size=medium)
 *
 * The form is plain CommonMark, so every markdown parser already reads it; it
 * holds no braces, so it is literal text inside the ICU messages that
 * localized text is; and the description sits where an image's alternative
 * text does, so it is translated with the text around it.
 */
export type AssetBlock = Readonly<{
  /** The file's id in the protocol's assets. */
  assetId: string;
  /**
   * What the file shows or says, for a participant who cannot see or hear
   * it: an image's alternative text, and the name of an audio or video
   * player.
   */
  description?: string;
  /** How tall an image or a video may be. Absent, it takes its own height. */
  size?: AssetBlockSize;
  /** Whether audio or video starts by itself. Absent, it does. */
  autoplay?: boolean;
  /** Whether audio or video starts again when it ends. Absent, it does. */
  loop?: boolean;
}>;

// The words a block's settings are written in are shared-consts', so that
// what draws a block without reading its markdown holds the same list. They
// are exported here too, beside the grammar that writes them.
export {
  ASSET_BLOCK_DEFAULTS,
  ASSET_BLOCK_KINDS,
  ASSET_BLOCK_SIZES,
  type AssetBlockAttributes,
  type AssetBlockKind,
  type AssetBlockSize,
  isAssetBlockKind,
  isAssetBlockSize,
} from '@codaco/shared-consts';

const SCHEME = 'asset:';

/** Whether a markdown image's address names a file of the protocol. */
export const isAssetBlockUrl = (url: string): boolean =>
  url.slice(0, SCHEME.length).toLowerCase() === SCHEME;

// `encodeURIComponent` leaves these as they are, and each means something in
// a markdown address (a parenthesis closes it) or in an ICU message (an
// apostrophe opens a quoted run).
const ALSO_ENCODED = /[!'()*]/g;

const encodeAssetId = (assetId: string): string =>
  encodeURIComponent(assetId).replace(
    ALSO_ENCODED,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );

const decodeAssetId = (encoded: string): string | undefined => {
  try {
    return decodeURIComponent(encoded);
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
};

/**
 * The address a block's markdown image carries. Only what differs from
 * `ASSET_BLOCK_DEFAULTS` is written, in one order, so a block has one
 * spelling and text saved again comes back unchanged.
 */
export const assetBlockUrl = ({
  assetId,
  size,
  autoplay,
  loop,
}: AssetBlock): string => {
  const settings = [
    ...(size === undefined ? [] : [`size=${size}`]),
    ...(autoplay === false ? ['autoplay=false'] : []),
    ...(loop === false ? ['loop=false'] : []),
  ];
  const address = `${SCHEME}${encodeAssetId(assetId)}`;
  return settings.length === 0 ? address : `${address}?${settings.join('&')}`;
};

/** What is wrong with a block's address, for validation to report. */
export type AssetBlockUrlProblem = Readonly<
  | { kind: 'noAsset' }
  | { kind: 'unknownSetting'; setting: string }
  | { kind: 'invalidValue'; setting: string; value: string }
>;

type AssetBlockUrlReading = Readonly<{
  block: AssetBlock;
  problems: readonly AssetBlockUrlProblem[];
}>;

/**
 * Where a block is written that it cannot be shown. A block is a markdown
 * image standing in a paragraph of the text, or of an item of a list in it:
 * that is what the editor writes and holds, and what the interview draws.
 * Anywhere else an image naming a file reads as a block to no one, so it is
 * reported rather than left for one reader to draw and another to drop.
 */
export type AssetBlockPlacementProblem = Readonly<
  /** Inside a heading, a link, emphasis, a quotation: not a paragraph's own. */
  | { kind: 'notInParagraph' }
  /** Named through a reference (`![alt][label]`, `[label]: asset:…`). */
  | { kind: 'byReference' }
  /** With a value, or a choice of versions, in its description or address. */
  | { kind: 'holdsValue' }
>;

export type AssetBlockProblem =
  | AssetBlockUrlProblem
  | AssetBlockPlacementProblem;

const BOOLEANS: Readonly<Record<string, boolean>> = {
  true: true,
  false: false,
};

/**
 * The block a markdown image's address describes, or `undefined` when the
 * address does not name a file of the protocol. Read leniently, so that text
 * written by hand still shows what it can: a setting that is not known, or a
 * value a setting cannot take, is left out and listed in `problems`.
 */
export const readAssetBlockUrl = (
  url: string,
): AssetBlockUrlReading | undefined => {
  if (!isAssetBlockUrl(url)) return undefined;
  const rest = url.slice(SCHEME.length);
  const queryAt = rest.indexOf('?');
  const encodedId = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const query = queryAt === -1 ? '' : rest.slice(queryAt + 1);
  const assetId = decodeAssetId(encodedId) ?? '';
  const problems: AssetBlockUrlProblem[] = [];
  if (assetId === '') problems.push({ kind: 'noAsset' });

  let size: AssetBlockSize | undefined;
  let autoplay: boolean | undefined;
  let loop: boolean | undefined;
  for (const [setting, value] of new URLSearchParams(query)) {
    const invalid = () =>
      problems.push({ kind: 'invalidValue', setting, value });
    if (setting === 'size') {
      if (isAssetBlockSize(value)) size = value;
      else invalid();
    } else if (setting === 'autoplay' || setting === 'loop') {
      const flag = BOOLEANS[value];
      if (flag === undefined) invalid();
      else if (setting === 'autoplay') autoplay = flag;
      else loop = flag;
    } else {
      problems.push({ kind: 'unknownSetting', setting });
    }
  }

  return {
    block: {
      assetId,
      ...(size !== undefined && { size }),
      ...(autoplay === false && { autoplay }),
      ...(loop === false && { loop }),
    },
    problems,
  };
};

// A description is one line of plain text: a line break in it would end the
// image, and markdown in it would be read as formatting.
const descriptionMarkdown = (description: string | undefined): string =>
  description === undefined
    ? ''
    : escapeMarkdownText(description.trim().replace(/\s+/g, ' '));

/** The markdown a block is written as: a paragraph of its own. */
export const assetBlockMarkdown = (block: AssetBlock): string =>
  `![${descriptionMarkdown(block.description)}](${assetBlockUrl(block)})`;

/**
 * The message a block is written as in localized text, where its
 * description is a message whose words are plain text: the description's
 * words are escaped as `assetBlockMarkdown` escapes them, and the values it
 * shows, the versions it chooses between and a plural's count are left as
 * they are (see `messageTextAsMarkdown`). Its address holds nothing ICU
 * reads, so it is the same in either.
 */
export const assetBlockMessage = (block: AssetBlock): string =>
  `![${
    block.description === undefined
      ? ''
      : messageTextAsMarkdown(block.description)
  }](${assetBlockUrl(block)})`;

type MarkdownTreeNode = Readonly<{
  type: string;
  url?: string;
  alt?: string | null;
  children?: readonly MarkdownTreeNode[];
}>;

/** A block found in text, with what is wrong with how it is written. */
export type AssetBlockInText = Readonly<{
  block: AssetBlock;
  problems: readonly AssetBlockProblem[];
}>;

// A block found in markdown, with the image as written, for a message to
// look for what stands in it that is not text.
type Found = AssetBlockInText & Readonly<{ written: string }>;

// What may stand between the text and a paragraph holding a block.
const HOLDS_PARAGRAPHS: ReadonlySet<string> = new Set(['list', 'listItem']);

const blocksUnder = (
  node: MarkdownTreeNode,
  // Where `node` sits: among the text's paragraphs (reached through nothing
  // but lists), in one of those paragraphs, or anywhere else.
  at: 'paragraphs' | 'paragraph' | 'elsewhere',
): Found[] => {
  // A reference image (`![alt][map]`) takes its address from a definition
  // elsewhere in the text, so the definition names the file too.
  if (
    (node.type === 'image' || node.type === 'definition') &&
    typeof node.url === 'string'
  ) {
    const reading = readAssetBlockUrl(node.url);
    if (reading === undefined) return [];
    const description =
      typeof node.alt === 'string' && node.alt.trim() !== ''
        ? node.alt
        : undefined;
    const placement: AssetBlockPlacementProblem[] =
      node.type === 'definition'
        ? [{ kind: 'byReference' }]
        : at === 'paragraph'
          ? []
          : [{ kind: 'notInParagraph' }];
    return [
      {
        block: {
          ...reading.block,
          ...(description !== undefined && { description }),
        },
        problems: [...reading.problems, ...placement],
        written: `${node.alt ?? ''}${node.url}`,
      },
    ];
  }
  const within =
    at !== 'paragraphs'
      ? 'elsewhere'
      : HOLDS_PARAGRAPHS.has(node.type)
        ? 'paragraphs'
        : node.type === 'paragraph'
          ? 'paragraph'
          : 'elsewhere';
  return (node.children ?? []).flatMap((child) => blocksUnder(child, within));
};

const blocksInMarkdown = (markdown: string): Found[] =>
  (
    markdownTree(markdown).children satisfies readonly MarkdownTreeNode[]
  ).flatMap((child) => blocksUnder(child, 'paragraphs'));

/**
 * Every file markdown names as a block, in the order it names them, each
 * with what is wrong with its address and with where it is written. Found
 * with a markdown parser rather than a pattern, so that an address inside a
 * code span or behind an escaped bracket is the text it reads as, not a
 * block; and with the one parser every reader of stored text uses (see
 * `markdownTree`), so that what is checked is what the participant is shown.
 */
export const assetBlocksInMarkdown = (
  markdown: string,
): readonly AssetBlockInText[] =>
  blocksInMarkdown(markdown).map(({ block, problems }) => ({
    block,
    problems,
  }));

// Stands where a message shows a value or chooses a version, so the text on
// either side is not read as one run. A private-use character, which
// authored text does not hold and markdown gives no meaning.
const NOT_TEXT = '';

const levelTexts = (nodes: readonly MessageNode[]): string[] => {
  let text = '';
  const nested: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      text += node.text;
      continue;
    }
    text += NOT_TEXT;
    if (node.kind === 'switch') {
      for (const version of node.versions) {
        nested.push(...levelTexts(version.nodes));
      }
    }
  }
  return [text, ...nested];
};

const readAssetBlocksInMessage = (
  message: string,
): readonly AssetBlockInText[] => {
  // The text is always read. Looking for `asset:` in it first would save the
  // reading for most text and miss a file named with the colon escaped
  // (`asset\:id`, `asset&#58;id`), which markdown reads as the same address.
  // A version of a logic block is a document of its own, whose blocks are
  // read as the text's own are (see `contentDocument.ts`).
  const structure = messageStructure(message);
  const levels = 'nodes' in structure ? levelTexts(structure.nodes) : [message];
  return levels
    .flatMap(blocksInMarkdown)
    .map(({ block, problems, written }) => ({
      block,
      // What a value stands in cannot be read until the value is shown, so
      // nothing else is said of it.
      problems: written.includes(NOT_TEXT)
        ? [{ kind: 'holdsValue' } as const]
        : problems,
    }));
};

/**
 * Every file a localized message names as a block: in its own text, and in
 * each version of a logic block, since any of them may be the one a
 * participant is shown. A message that cannot be read as ICU is searched as
 * it is written.
 *
 * Validation reads each translation that can contain blocks several times
 * (for the asset references, for the blocks' problems, for whether a page
 * shows a file), and an editor checks the protocol again after each change,
 * mostly to text that has not changed. Parsing markdown is the costly part,
 * and its result is only ever read, so readings are kept (`boundedCache`).
 */
export const assetBlocksInMessage: (
  message: string,
) => readonly AssetBlockInText[] = boundedCache(500, readAssetBlocksInMessage);

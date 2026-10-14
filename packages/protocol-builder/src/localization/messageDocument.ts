import { isEqual } from 'es-toolkit';

import type {
  RichTextVersion,
  RichTextVersionsAttributes,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import {
  MISSING_CASE,
  type MessageNode,
  type MessageSwitch,
  type MessageVersion,
} from '@codaco/protocol-validation';

import {
  markdownToRichTextContent,
  type RichTextContent,
  richTextContentToMarkdown,
} from '../markdown/markdownAdapter';

/**
 * How a message's text is read: as markdown, or as plain text. A markdown
 * document may hold blocks unless it is one line; a version of a piece of
 * text is always one line.
 */
export type MessageDocumentFormat = Readonly<{
  markdown: boolean;
  singleLine: boolean;
}>;

/** What the editor calls a switch and each of its versions. */
export type MessageDocumentLabels = Readonly<{
  switchLabel: (node: MessageSwitch) => string;
  /** What a switch's folded pill says: the name of the value it is on. */
  switchSummary: (node: MessageSwitch) => string;
  versionLabel: (node: MessageSwitch, key: string) => string;
}>;

/**
 * The editor holds `#`, the number a plural is on, as a placeholder named
 * for that plural's value, so the pill can say whose number it is.
 */
export const countTokenId = (argument: string): string => `#${argument}`;

const countArgumentOf = (tokenId: string): string | undefined =>
  tokenId.startsWith('#') ? tokenId.slice(1) : undefined;

/** What a versions element records about the switch it stands for. */
type SwitchMeta = Readonly<{
  argument: string;
  type: MessageSwitch['type'];
  offset?: number;
}>;

/**
 * A switch's versions in the order the editor shows them: what the text reads
 * when the value is known (or for each answer) first, and the version for
 * when it is not known last.
 */
const inShownOrder = <Version extends Readonly<{ key: string }>>(
  versions: readonly Version[],
): Version[] => [
  ...versions.filter(({ key }) => key !== MISSING_CASE),
  ...versions.filter(({ key }) => key === MISSING_CASE),
];

/**
 * A switch's versions in the order the message records them: the version
 * for when the value is not known first, as the insert menu writes it, so
 * opening and editing a text never reorders what it already says.
 */
const inRecordedOrder = <Version extends Readonly<{ key: string }>>(
  versions: readonly Version[],
): Version[] => [
  ...versions.filter(({ key }) => key === MISSING_CASE),
  ...versions.filter(({ key }) => key !== MISSING_CASE),
];

const isSwitchMeta = (value: unknown): value is SwitchMeta =>
  typeof value === 'object' &&
  value !== null &&
  'argument' in value &&
  typeof value.argument === 'string' &&
  'type' in value &&
  (value.type === 'select' || value.type === 'plural');

// Stand-ins for the values and switches while the text around them is read
// as markdown: private-use characters that authored text cannot hold, so no
// markdown syntax forms around them and none is mistaken for one.
const MARKER_OPEN = '';
const MARKER_CLOSE = '';
const MARKER = /(\d+)/g;
const markerFor = (index: number) => `${MARKER_OPEN}${index}${MARKER_CLOSE}`;
const holdsMarker = (text: string) => text.includes(MARKER_OPEN);

// A version sits inside a line, so text at its start (`# means`, `1. `) is
// not the start of a heading or list. Reading it behind this stand-in keeps
// markdown from taking it as one. (Writing needs none: the editor escapes
// such text wherever it is.)
const LINE_LEAD = '\uE002';

const withoutLineLead = (
  line: readonly RichTextContent[],
): RichTextContent[] => {
  const [first, ...rest] = line;
  if (first?.type !== 'text' || !first.text?.startsWith(LINE_LEAD)) {
    return [...line];
  }
  const text = first.text.slice(LINE_LEAD.length);
  return text === '' ? rest : [{ ...first, text }, ...rest];
};

/**
 * Why a message cannot be shown in the editor as it is: a value inside a link
 * address, or a version of markdown text that runs over more than one line
 * (paragraphs, a list, a heading), which a version's one-line editor would
 * run together and write back that way.
 */
type MessageDocumentProblemKind = 'valueInLinkAddress' | 'linesInVersion';

export class MessageDocumentProblem extends Error {
  readonly kind: MessageDocumentProblemKind;

  constructor(kind: MessageDocumentProblemKind) {
    super(kind);
    this.kind = kind;
  }
}

const PLAIN_LINE = (text: string): RichTextContent => ({
  type: 'doc',
  content: [
    text === ''
      ? { type: 'paragraph' }
      : { type: 'paragraph', content: [{ type: 'text', text }] },
  ],
});

/**
 * Replaces each marker in the document's text with the node it stands for,
 * carrying the text's marks onto it. A marker in an attribute (a link
 * address) cannot be shown.
 */
const restoreMarkers = (
  content: RichTextContent,
  pieces: readonly RichTextContent[],
): RichTextContent => {
  for (const mark of content.marks ?? []) {
    if (JSON.stringify(mark.attrs ?? {}).includes(MARKER_OPEN)) {
      throw new MessageDocumentProblem('valueInLinkAddress');
    }
  }
  if (content.type === 'text') return content;
  if (content.content === undefined) return content;

  const restored: RichTextContent[] = [];
  for (const child of content.content) {
    if (child.type !== 'text' || !holdsMarker(child.text ?? '')) {
      restored.push(restoreMarkers(child, pieces));
      continue;
    }
    restoreMarkers(child, pieces);
    const text = child.text ?? '';
    let at = 0;
    for (const match of text.matchAll(MARKER)) {
      if (match.index > at) {
        restored.push({ ...child, text: text.slice(at, match.index) });
      }
      const piece = pieces[Number(match[1])];
      if (piece !== undefined) {
        restored.push(
          child.marks === undefined ? piece : { ...piece, marks: child.marks },
        );
      }
      at = match.index + match[0].length;
    }
    if (at < text.length) restored.push({ ...child, text: text.slice(at) });
  }
  return { ...content, content: restored };
};

const EDGE_SPACE = /^(\s*)([\s\S]*?)(\s*)$/;

/**
 * A version's line from its markdown. Markdown drops the spaces at the ends
 * of a line, but a version's spaces are part of the sentence it sits in, so
 * they are kept as text.
 */
const versionLine = (
  markdown: string,
  pieces: readonly RichTextContent[],
  format: MessageDocumentFormat,
): RichTextContent[] => {
  if (!format.markdown) {
    return (
      restoreMarkers(PLAIN_LINE(markdown), pieces).content?.[0]?.content ?? []
    );
  }
  if (markdown.includes('\n')) {
    throw new MessageDocumentProblem('linesInVersion');
  }
  const [, before = '', middle = '', after = ''] =
    EDGE_SPACE.exec(markdown) ?? [];
  const parsed = restoreMarkers(
    markdownToRichTextContent(LINE_LEAD + middle, true, true),
    pieces,
  );
  const line = withoutLineLead(parsed.content?.[0]?.content ?? []);
  if (before !== '') line.unshift({ type: 'text', text: before });
  if (after !== '') line.push({ type: 'text', text: after });
  return line;
};

/**
 * The editor's document for a message: its text read as markdown or plain
 * text, each value a placeholder (`token`), and each switch a versions
 * element whose versions are lines of their own.
 *
 * Throws `MessageDocumentProblem` for a message the editor cannot hold, such
 * as one with a value inside a link address, or a version of markdown that
 * runs over more than one line.
 */
export const messageToDocument = (
  nodes: readonly MessageNode[],
  format: MessageDocumentFormat,
  labels: MessageDocumentLabels,
): RichTextContent => {
  const level = (
    levelNodes: readonly MessageNode[],
    plural: string | undefined,
  ) => {
    const pieces: RichTextContent[] = [];
    let text = '';
    for (const node of levelNodes) {
      if (node.kind === 'text') {
        text += node.text;
        continue;
      }
      text += markerFor(pieces.length);
      if (node.kind === 'argument') {
        pieces.push({ type: 'token', attrs: { id: node.name } });
      } else if (node.kind === 'count') {
        pieces.push({
          type: 'token',
          attrs: { id: countTokenId(plural ?? '') },
        });
      } else {
        const inner = node.type === 'plural' ? node.argument : plural;
        const versions: RichTextVersion[] = inShownOrder(node.versions).map(
          (version) => {
            const nested = level(version.nodes, inner);
            return {
              key: version.key,
              label: labels.versionLabel(node, version.key),
              content: versionLine(nested.text, nested.pieces, format),
            };
          },
        );
        const meta: SwitchMeta = {
          argument: node.argument,
          type: node.type,
          ...(node.offset !== undefined && { offset: node.offset }),
        };
        const attrs: RichTextVersionsAttributes = {
          label: labels.switchLabel(node),
          summary: labels.switchSummary(node),
          versions,
          meta,
        };
        pieces.push({ type: 'versions', attrs });
      }
    }
    return { text, pieces };
  };

  const top = level(nodes, undefined);
  if (!format.markdown) return restoreMarkers(PLAIN_LINE(top.text), top.pieces);
  return restoreMarkers(
    markdownToRichTextContent(top.text, format.singleLine, true),
    top.pieces,
  );
};

const plainTextOf = (content: RichTextContent): string => {
  if (content.type === 'text') return content.text ?? '';
  if (content.type === 'hardBreak') return '\n';
  return (content.content ?? []).map(plainTextOf).join('');
};

/**
 * Replaces each placeholder and versions element with a marker, keeping its
 * marks on the marker, so the text around them can be written as markdown.
 */
const withMarkers = (
  content: RichTextContent,
  pieces: RichTextContent[],
): RichTextContent => {
  if (content.type === 'token' || content.type === 'versions') {
    const index = pieces.length;
    pieces.push(content);
    return {
      type: 'text',
      text: markerFor(index),
      ...(content.marks !== undefined && { marks: content.marks }),
    };
  }
  if (content.content === undefined) return content;
  // Text on both sides of a value with the same marks is one run again, so
  // `**Hello {name}**` is written as one bold run, not two.
  const merged: RichTextContent[] = [];
  for (const child of content.content.map((node) =>
    withMarkers(node, pieces),
  )) {
    const last = merged.at(-1);
    if (
      last?.type === 'text' &&
      child.type === 'text' &&
      isEqual(last.marks ?? [], child.marks ?? [])
    ) {
      merged[merged.length - 1] = {
        ...last,
        text: (last.text ?? '') + (child.text ?? ''),
      };
    } else {
      merged.push(child);
    }
  }
  return { ...content, content: merged };
};

const lineDocument = (line: readonly RichTextContent[]): RichTextContent => ({
  type: 'doc',
  content: [
    line.length === 0
      ? { type: 'paragraph' }
      : { type: 'paragraph', content: [...line] },
  ],
});

/**
 * `pluralArgument` names the plural whose version the piece sits directly
 * in. ICU reads `#` as that plural's number only there: at the top level, or
 * inside a select (even one within a plural), `#` is literal text. A count
 * pill pasted anywhere else keeps its value as an ordinary placeholder.
 */
const pieceNode = (
  piece: RichTextContent,
  format: MessageDocumentFormat,
  pluralArgument: string | undefined,
): MessageNode | undefined => {
  const attrs = piece.attrs ?? {};
  if (piece.type === 'token') {
    const id = typeof attrs.id === 'string' ? attrs.id : '';
    const countArgument = countArgumentOf(id);
    if (countArgument === undefined) return { kind: 'argument', name: id };
    return countArgument === pluralArgument
      ? { kind: 'count' }
      : { kind: 'argument', name: countArgument };
  }
  const meta: unknown = attrs.meta;
  if (!isSwitchMeta(meta) || !Array.isArray(attrs.versions)) return undefined;
  const versions = inRecordedOrder(attrs.versions as RichTextVersion[]).map(
    (version): MessageVersion => ({
      key: version.key,
      nodes: messageNodesOf(
        lineDocument(version.content),
        format,
        true,
        meta.type === 'plural' ? meta.argument : undefined,
      ),
    }),
  );
  return {
    kind: 'switch',
    argument: meta.argument,
    type: meta.type,
    ...(meta.offset !== undefined && { offset: meta.offset }),
    versions,
  };
};

const messageNodesOf = (
  document: RichTextContent,
  format: MessageDocumentFormat,
  isVersion: boolean,
  pluralArgument: string | undefined,
): MessageNode[] => {
  const pieces: RichTextContent[] = [];
  const marked = withMarkers(document, pieces);
  let text: string;
  if (!format.markdown) {
    text = plainTextOf(marked);
  } else if (isVersion) {
    // A version keeps the spaces at its ends: they sit in a sentence.
    const line = marked.content?.[0]?.content ?? [];
    const [, before = '', , after = ''] =
      EDGE_SPACE.exec(plainTextOf(marked)) ?? [];
    const written = richTextContentToMarkdown(lineDocument(line), true, true);
    text = before + written.trim() + after;
  } else {
    text = richTextContentToMarkdown(marked, format.singleLine, true);
  }

  const nodes: MessageNode[] = [];
  let at = 0;
  for (const match of text.matchAll(MARKER)) {
    if (match.index > at) {
      nodes.push({ kind: 'text', text: text.slice(at, match.index) });
    }
    const piece = pieces[Number(match[1])];
    const node =
      piece === undefined
        ? undefined
        : pieceNode(piece, format, pluralArgument);
    if (node !== undefined) nodes.push(node);
    at = match.index + match[0].length;
  }
  if (at < text.length) nodes.push({ kind: 'text', text: text.slice(at) });
  return nodes;
};

/**
 * The message the editor's document holds: its text as markdown or plain
 * text, each placeholder a value, and each versions element a switch.
 */
export const documentToMessageNodes = (
  document: RichTextContent,
  format: MessageDocumentFormat,
): MessageNode[] => messageNodesOf(document, format, false, undefined);

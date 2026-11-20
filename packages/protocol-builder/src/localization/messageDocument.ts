import { isEqual } from 'es-toolkit';

import type {
  RichTextVersion,
  RichTextVersionsAction,
  RichTextVersionsAttributes,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import type {
  TokenPillLabel,
  TokenPillVariant,
} from '@codaco/fresco-ui/TokenPill';
import {
  MISSING_CASE,
  type MessageNode,
  type MessageSwitch,
  messageStructure,
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
  /**
   * What a switch's folded pill says: the name of the value it is on, as the
   * interface's words or, for a name someone wrote, in its own direction.
   */
  switchSummary: (node: MessageSwitch) => TokenPillLabel;
  versionLabel: (node: MessageSwitch, key: string) => string;
  /**
   * Whether a switch is logic (versions chosen by a test) rather than a
   * value shown when it is known; a value when not given.
   */
  variantOf?: (node: MessageSwitch) => TokenPillVariant;
  /** How a switch on a condition reads, as an "If"; see `IfBlockLabels`. */
  ifBlock?: IfBlockLabels;
}>;

/** One row of an "If": the condition it tests, and the case it is for. */
export type IfRow = Readonly<{ argument: string; key: string }>;

/**
 * How the editor shows a switch on a condition: as one "If" whose rows are
 * the condition's case, each "else if" the text nests in the version for
 * every other case, and what it reads otherwise.
 */
export type IfBlockLabels = Readonly<{
  /** Whether `node` switches on a condition, on one of its two cases. */
  is: (node: MessageSwitch) => boolean;
  label: (rows: readonly IfRow[]) => string;
  summary: (rows: readonly IfRow[]) => TokenPillLabel;
  rowLabel: (row: IfRow, index: number) => string;
  otherwiseLabel: string;
  /** Names the button a row's label is, where its rules can be edited. */
  rowAction?: string;
  /** Names the button that removes a row, where one can be removed. */
  rowRemovable?: string;
  /** Buttons under the rows, such as “Add else if”. */
  actions?: readonly RichTextVersionsAction[];
}>;

const IF_ROW_KEY = /^if:([^:]+):([^:]+)$/;

/** The key the editor gives the row of an "If" for `row`. */
const ifRowKey = (row: IfRow): string => `if:${row.argument}:${row.key}`;

/** The row an editor's version key stands for, if it is a row of an "If". */
export const ifRowOf = (versionKey: string): IfRow | undefined => {
  const match = IF_ROW_KEY.exec(versionKey);
  return match?.[1] === undefined || match[2] === undefined
    ? undefined
    : { argument: match[1], key: match[2] };
};

/**
 * The rows of the "If" that `node` opens: its own case, then the case of
 * each "If" that is the whole of the version before it shown otherwise.
 */
const ifRowsOf = (
  node: MessageSwitch,
  is: IfBlockLabels['is'],
): Readonly<{
  rows: readonly (IfRow & Readonly<{ nodes: readonly MessageNode[] }>)[];
  otherwise: readonly MessageNode[];
}> => {
  const rows: (IfRow & Readonly<{ nodes: readonly MessageNode[] }>)[] = [];
  let current = node;
  for (;;) {
    const own = current.versions.find(({ key }) => key !== 'other');
    const otherwise =
      current.versions.find(({ key }) => key === 'other')?.nodes ?? [];
    rows.push({
      argument: current.argument,
      key: own?.key ?? '',
      nodes: own?.nodes ?? [],
    });
    const [only, ...rest] = otherwise;
    if (only?.kind !== 'switch' || rest.length > 0 || !is(only)) {
      return { rows, otherwise };
    }
    current = only;
  }
};

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
  /** Set for an "If", whose versions are its rows (see `ifRowsOf`). */
  rows?: true;
}>;

type IfRowContent = IfRow & Readonly<{ content: readonly RichTextContent[] }>;

/**
 * The editor's element for an "If" of `rows`, each with the line it shows,
 * and the line shown `otherwise`. Also how an "If" already in the text is
 * rewritten when a row is added or removed, or its rules change what a row
 * is called.
 */
export const ifBlockAttributes = (
  rows: readonly IfRowContent[],
  otherwise: readonly RichTextContent[],
  block: IfBlockLabels,
): RichTextVersionsAttributes => ({
  label: block.label(rows),
  summary: block.summary(rows),
  versions: [
    ...rows.map((row, index) => ({
      key: ifRowKey(row),
      label: block.rowLabel(row, index),
      content: row.content,
      ...(block.rowAction !== undefined && { action: block.rowAction }),
      ...(block.rowRemovable !== undefined &&
        rows.length > 1 && { removable: block.rowRemovable }),
    })),
    { key: 'other', label: block.otherwiseLabel, content: otherwise },
  ],
  variant: 'logic',
  ...(block.actions !== undefined &&
    block.actions.length > 0 && { actions: block.actions }),
  meta: {
    argument: rows[0]?.argument ?? '',
    type: 'select',
    rows: true,
  } satisfies SwitchMeta,
});

/** The rows of an "If" as the editor holds it, and what it shows otherwise. */
export const ifBlockRowsIn = (
  attributes: Readonly<{ versions: readonly RichTextVersion[] }>,
): Readonly<{
  rows: readonly IfRowContent[];
  otherwise: readonly RichTextContent[];
}> => ({
  rows: attributes.versions.flatMap((version) => {
    const row = ifRowOf(version.key);
    return row === undefined ? [] : [{ ...row, content: version.content }];
  }),
  otherwise:
    attributes.versions.find(({ key }) => key === 'other')?.content ?? [],
});

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

/**
 * Whether one entry of a versions element's `versions` is a version. The
 * element is read back from the editor's document, so an entry that is not
 * shaped like one is left out rather than read from.
 */
const isRichTextVersion = (value: unknown): value is RichTextVersion =>
  typeof value === 'object' &&
  value !== null &&
  'key' in value &&
  typeof value.key === 'string' &&
  'label' in value &&
  typeof value.label === 'string' &&
  'content' in value &&
  Array.isArray(value.content) &&
  value.content.every((node) => typeof node === 'object' && node !== null);

export const isSwitchMeta = (value: unknown): value is SwitchMeta =>
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

class MessageDocumentProblem extends Error {
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

// The spaces at each end of a text, and what lies between them; text that is
// all spaces is all `before`. Sliced rather than matched, so a long run of
// spaces costs one pass.
const edgeSpace = (text: string): [string, string, string] => {
  const start = text.length - text.trimStart().length;
  const end = text.trimEnd().length;
  if (end <= start) return [text, '', ''];
  return [text.slice(0, start), text.slice(start, end), text.slice(end)];
};

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
  const [before, middle, after] = edgeSpace(markdown);
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
      } else if (labels.ifBlock?.is(node) === true) {
        const block = labels.ifBlock;
        const { rows, otherwise } = ifRowsOf(node, block.is);
        const line = (lineNodes: readonly MessageNode[]) => {
          const nested = level(lineNodes, plural);
          return versionLine(nested.text, nested.pieces, format);
        };
        pieces.push({
          type: 'versions',
          attrs: ifBlockAttributes(
            rows.map((row) => ({
              argument: row.argument,
              key: row.key,
              content: line(row.nodes),
            })),
            line(otherwise),
            block,
          ),
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
          ...(labels.variantOf?.(node) === 'logic' && { variant: 'logic' }),
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
  if (meta.rows === true) {
    // An "If": each row after the first is an "If" of its own, the whole of
    // what the row before it reads otherwise.
    const listed = attrs.versions.filter(isRichTextVersion);
    const nodesOf = (version: RichTextVersion | undefined) =>
      version === undefined
        ? []
        : // An "If" is a select, where `#` is literal text: a count pill in
          // one of its rows keeps its value as an ordinary placeholder.
          messageNodesOf(
            lineDocument(version.content),
            format,
            true,
            undefined,
          );
    let otherwise: MessageNode[] = nodesOf(
      listed.find(({ key }) => key === 'other'),
    );
    let outermost: MessageSwitch | undefined;
    for (const version of listed.toReversed()) {
      const row = ifRowOf(version.key);
      if (row === undefined) continue;
      outermost = {
        kind: 'switch',
        argument: row.argument,
        type: 'select',
        versions: [
          { key: row.key, nodes: nodesOf(version) },
          { key: 'other', nodes: otherwise },
        ],
      };
      otherwise = [outermost];
    }
    return outermost;
  }
  const versions = inRecordedOrder(
    attrs.versions.filter(isRichTextVersion),
  ).map((version): MessageVersion => ({
    key: version.key,
    nodes: messageNodesOf(
      lineDocument(version.content),
      format,
      true,
      meta.type === 'plural' ? meta.argument : undefined,
    ),
  }));
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
    const [before, , after] = edgeSpace(plainTextOf(marked));
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

/**
 * The editor's document for the stored text of the field `name`. Validation
 * refuses a protocol holding text the editor cannot hold, so one that reaches
 * an editor is a fault, and this throws.
 */
export const openMessageDocument = (
  name: string,
  message: string,
  format: MessageDocumentFormat,
  labels: MessageDocumentLabels,
): RichTextContent => {
  const fault = (cause?: unknown) =>
    new Error(`The text of "${name}" cannot be opened for editing.`, { cause });
  const structure = messageStructure(message);
  if (!('nodes' in structure)) throw fault();
  try {
    return messageToDocument(structure.nodes, format, labels);
  } catch (error) {
    throw error instanceof MessageDocumentProblem ? fault(error) : error;
  }
};

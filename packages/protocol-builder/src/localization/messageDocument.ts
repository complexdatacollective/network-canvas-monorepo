import { isEqual } from 'es-toolkit';

import type {
  RichTextVersion,
  RichTextVersionsAttributes,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import type { PresentationalText } from '@codaco/fresco-ui/PresentationalText';
import {
  assetBlocksInMarkdown,
  fieldBlockMarkdown,
  type ContentLogic,
  type ContentNode,
  type ContentNodes,
  isPluralCategory,
  MISSING_CASE,
  type MessageNode,
  type MessageSwitch,
  messageStructure,
  type MessageVersion,
  type PluralCategory,
  printContentDocument,
  printMessageStructure,
  readContentDocument,
  VERSION_LINE_LEAD,
} from '@codaco/protocol-validation';
import { isRecord } from '@codaco/shared-consts';

import {
  markdownToRichTextContent,
  type RichTextContent,
  richTextContentToMarkdown,
} from '../markdown/markdownAdapter';

/**
 * How a message's text is read: as markdown, or as plain text. Markdown of
 * several lines is a document (`readContentDocument`): paragraphs and other
 * blocks, files as blocks where the text may contain them, logic blocks, and,
 * in a form, its fields. A message of one line is words, values and
 * formatting only.
 */
export type MessageDocumentFormat = Readonly<{
  markdown: boolean;
  singleLine: boolean;
  /** Whether markdown of several lines may contain files as blocks. */
  assetBlocks?: boolean;
}>;

/**
 * What the editor calls a switch of wording supplied by Network Canvas and
 * each of its versions. Only that wording has switches inside its lines (see
 * `MessageDocumentOptions.versions`); the text a researcher writes chooses
 * between versions with logic blocks and dynamic attributes instead.
 */
export type MessageDocumentLabels = Readonly<{
  switchLabel: (node: MessageSwitch) => string;
  /**
   * What a switch's folded pill says: the name of the value it is on, as the
   * interface's words or, for a name someone wrote, in its own direction.
   */
  switchSummary: (node: MessageSwitch) => PresentationalText;
  versionLabel: (node: MessageSwitch, key: string) => string;
}>;

/**
 * A field of a form as its block shows it: the attribute it collects, whether
 * it shows validation hints, and its question and hint in the language being
 * edited, each one line of markdown as a message (`prompt`, `hint`). Read
 * from the form's `fields` when a document opens, and collected from its
 * blocks when it is written (`documentToMessage`).
 */
export type FieldText = Readonly<{
  variable: string;
  showValidationHints: boolean;
  /** The question; absent when it is empty. */
  prompt?: string;
  /** The hint; absent when it is empty. */
  hint?: string;
}>;

type MessageDocumentOptions = Readonly<{
  /**
   * How the switches of wording supplied by Network Canvas are shown, as
   * lines with a version for each case. Without it a switch inside a line is
   * refused (`inlineChoice`): researcher text chooses its wording with logic
   * blocks and dynamic attributes.
   */
  versions?: MessageDocumentLabels;
  /** The field each field block names, for the text of a form. */
  fieldText?: (fieldId: string) => FieldText | undefined;
  /**
   * Whether each field block contains the field's question and hint
   * (`'editable'`, the default), or no text, for an editor whose field
   * blocks have none (fresco-ui's `RichTextFieldBlocks.text`).
   */
  fieldBlockText?: 'editable' | 'none';
}>;

/**
 * Why a message cannot be shown in the editor as it is: a value inside a link
 * address, a choice of versions inside a sentence of researcher text, a
 * document that `readContentDocument` cannot read as one (a logic block of
 * no known shape, a field written where a block cannot stand), or a file
 * written where the editor holds no block, which it would write back as the
 * file's description alone.
 */
type MessageDocumentProblemKind =
  | 'valueInLinkAddress'
  | 'inlineChoice'
  | 'unreadableDocument'
  | 'linesInVersion'
  | 'misplacedFile';

export class MessageDocumentProblem extends Error {
  readonly kind: MessageDocumentProblemKind;

  constructor(kind: MessageDocumentProblemKind) {
    super(kind);
    this.kind = kind;
  }
}

/**
 * The editor holds `#`, the number a plural of supplied wording is on, as a
 * value named for that plural's value, so the pill can say whose number it is.
 */
export const countTokenId = (argument: string): string => `#${argument}`;

const countArgumentOf = (tokenId: string): string | undefined =>
  tokenId.startsWith('#') ? tokenId.slice(1) : undefined;

/** The editor's node for a value shown in a line (fresco-ui's). */
const INLINE_VALUE = 'inlineValue';
const FIELD_BLOCK = 'fieldBlock';
const FIELD_LABEL = 'fieldLabel';
const FIELD_HINT = 'fieldHint';
const LOGIC_BLOCK = 'logicBlock';
const LOGIC_BRANCH = 'logicBranch';

const inlineValue = (id: string): RichTextContent => ({
  type: INLINE_VALUE,
  attrs: { id },
});

/**
 * The editor's content for the number that the plural on `argument` shows
 * (`#`), to put into one of its versions.
 */
export const countContent = (argument: string): RichTextContent[] => [
  inlineValue(countTokenId(argument)),
];

// ---------------------------------------------------------------------------
// Logic blocks as the editor holds them
// ---------------------------------------------------------------------------

/**
 * What a logic block's node records about its logic (its `meta`). The condition
 * versions of a `conditions` block are its branches (`ConditionVersionMeta`);
 * the value an `answers` or `number` block reads is here.
 */
export type LogicBlockMeta =
  | Readonly<{ kind: 'conditions' }>
  | Readonly<{ kind: 'answers'; value: string }>
  | Readonly<{ kind: 'number'; value: string }>
  | Readonly<{ kind: 'participant' }>;

/**
 * What a branch of a `conditions` block records: the condition of its
 * condition version.
 */
export type ConditionVersionMeta = Readonly<{
  conditionId: string;
  when: 'met' | 'notMet';
}>;

/**
 * One branch of a logic block: its key, and, for a `conditions` block, its
 * condition version.
 */
export type LogicBranch = Readonly<{
  key: string;
  meta: ConditionVersionMeta | null;
}>;

/**
 * The key of the last branch of a logic block: the one shown when no condition
 * version of a `conditions` block applies, or when an `answers` block's answer
 * has no branch. One key for both, so a block whose logic changes between “If”,
 * “Participant or someone else” and “Different content for each answer” keeps
 * the content of its last branch.
 */
export const OTHERWISE_VERSION = 'otherwise';
/** The key of the branch shown when the value is not known. */
export const MISSING_VERSION = MISSING_CASE;
/** The key of the participant's branch of a `participant` block. */
export const PARTICIPANT_VERSION = 'participant';

const CONDITION_VERSION_KEY_PREFIX = 'row:';

/** The key of the branch for a condition version of a `conditions` block. */
export const conditionVersionKey = (conditionId: string): string =>
  `${CONDITION_VERSION_KEY_PREFIX}${conditionId}`;

/** The logic a block's `meta` records, or undefined when it records none. */
export const logicBlockMetaOf = (meta: unknown): LogicBlockMeta | undefined => {
  if (!isRecord(meta)) return undefined;
  switch (meta.kind) {
    case 'conditions':
      return { kind: 'conditions' };
    case 'participant':
      return { kind: 'participant' };
    case 'answers':
    case 'number':
      return typeof meta.value === 'string' && meta.value !== ''
        ? { kind: meta.kind, value: meta.value }
        : undefined;
    default:
      return undefined;
  }
};

/**
 * The condition version a branch's `meta` records, or undefined for any other
 * branch.
 */
export const conditionVersionMetaOf = (
  meta: unknown,
): ConditionVersionMeta | undefined =>
  isRecord(meta) &&
  typeof meta.conditionId === 'string' &&
  (meta.when === 'met' || meta.when === 'notMet')
    ? { conditionId: meta.conditionId, when: meta.when }
    : undefined;

/** The branches of a `conditions` block with these condition versions. */
export const conditionBranches = (
  conditionVersions: readonly ConditionVersionMeta[],
): LogicBranch[] => [
  ...conditionVersions.map((conditionVersion) => ({
    key: conditionVersionKey(conditionVersion.conditionId),
    meta: conditionVersion,
  })),
  { key: OTHERWISE_VERSION, meta: null },
];

/** The branches of an `answers` block giving a branch to each of `caseKeys`. */
export const answerBranches = (caseKeys: readonly string[]): LogicBranch[] => [
  { key: MISSING_VERSION, meta: null },
  ...caseKeys.map((key) => ({ key, meta: null })),
  { key: OTHERWISE_VERSION, meta: null },
];

/** The branches of a `number` block: one per plural category, `other` last. */
export const numberBranches = (
  categories: readonly PluralCategory[],
): LogicBranch[] => [
  { key: MISSING_VERSION, meta: null },
  ...categories
    .filter((category) => category !== 'other')
    .map((key) => ({ key, meta: null })),
  { key: 'other', meta: null },
];

/** The branches of a `participant` block. */
export const participantBranches = (): LogicBranch[] => [
  { key: PARTICIPANT_VERSION, meta: null },
  { key: OTHERWISE_VERSION, meta: null },
];

/** What a logic block's node records about `logic` (its `meta`). */
export const metaOfLogic = (logic: ContentLogic): LogicBlockMeta => {
  switch (logic.kind) {
    case 'answers':
    case 'number':
      return { kind: logic.kind, value: logic.value };
    case 'conditions':
      return { kind: 'conditions' };
    case 'participant':
    default:
      return { kind: 'participant' };
  }
};

/** Each branch of `logic`, with the content it shows. */
export const branchesOfLogic = (
  logic: ContentLogic,
): readonly (LogicBranch & Readonly<{ content: ContentNodes }>)[] => {
  switch (logic.kind) {
    case 'conditions':
      return [
        ...logic.versions.map(({ conditionId, when, content }) => ({
          key: conditionVersionKey(conditionId),
          meta: { conditionId, when },
          content,
        })),
        { key: OTHERWISE_VERSION, meta: null, content: logic.otherwise },
      ];
    case 'answers':
      return [
        { key: MISSING_VERSION, meta: null, content: logic.missing },
        ...logic.versions.map(({ caseKey, content }) => ({
          key: caseKey,
          meta: null,
          content,
        })),
        { key: OTHERWISE_VERSION, meta: null, content: logic.other },
      ];
    case 'number':
      return [
        { key: MISSING_VERSION, meta: null, content: logic.missing },
        ...logic.counted.versions.map(({ category, content }) => ({
          key: category,
          meta: null,
          content,
        })),
        { key: 'other', meta: null, content: logic.counted.other },
      ];
    case 'participant':
    default:
      return [
        { key: PARTICIPANT_VERSION, meta: null, content: logic.participant },
        { key: OTHERWISE_VERSION, meta: null, content: logic.otherwise },
      ];
  }
};

type BranchContent = Readonly<{
  key: string;
  meta: unknown;
  content: ContentNodes;
}>;

/** The logic a block of `meta` with these branches is. */
const logicOfBranches = (
  meta: LogicBlockMeta,
  branches: readonly BranchContent[],
): ContentLogic => {
  const contentOf = (key: string): ContentNodes =>
    branches.find((branch) => branch.key === key)?.content ?? [];
  switch (meta.kind) {
    case 'conditions':
      return {
        kind: 'conditions',
        versions: branches.flatMap((branch) => {
          const conditionVersion = conditionVersionMetaOf(branch.meta);
          return conditionVersion === undefined
            ? []
            : [{ ...conditionVersion, content: branch.content }];
        }),
        otherwise: contentOf(OTHERWISE_VERSION),
      };
    case 'answers':
      return {
        kind: 'answers',
        value: meta.value,
        missing: contentOf(MISSING_VERSION),
        versions: branches
          .filter(
            ({ key }) =>
              key !== MISSING_VERSION &&
              key !== OTHERWISE_VERSION &&
              key !== '',
          )
          .map(({ key, content }) => ({ caseKey: key, content })),
        other: contentOf(OTHERWISE_VERSION),
      };
    case 'number':
      return {
        kind: 'number',
        value: meta.value,
        missing: contentOf(MISSING_VERSION),
        counted: {
          by: 'category',
          versions: branches.flatMap(({ key, content }) =>
            isPluralCategory(key) && key !== 'other'
              ? [{ category: key, content }]
              : [],
          ),
          other: contentOf('other'),
        },
      };
    case 'participant':
    default:
      return {
        kind: 'participant',
        participant: contentOf(PARTICIPANT_VERSION),
        otherwise: contentOf(OTHERWISE_VERSION),
      };
  }
};

// ---------------------------------------------------------------------------
// Supplied wording's versions (switches inside a line)
// ---------------------------------------------------------------------------

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
 * A switch's versions in the order the message records them: the version for
 * when the value is not known first, so opening and editing a text never
 * reorders what it already says.
 */
const inRecordedOrder = <Version extends Readonly<{ key: string }>>(
  versions: readonly Version[],
): Version[] => [
  ...versions.filter(({ key }) => key === MISSING_CASE),
  ...versions.filter(({ key }) => key !== MISSING_CASE),
];

/** What a versions element records about the switch it stands for. */
type SwitchMeta = Readonly<{
  argument: string;
  type: MessageSwitch['type'];
  offset?: number;
}>;

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

// ---------------------------------------------------------------------------
// Markers: values held in place while the words around them are markdown
// ---------------------------------------------------------------------------

// Stand-ins for the values and switches while the text around them is read
// as markdown: private-use characters that authored text cannot contain, so
// no markdown syntax forms around them and none is mistaken for one.
const MARKER_OPEN = '\u{e000}';
const MARKER_CLOSE = '\u{e001}';
const MARKER = /\u{e000}(\d+)\u{e001}/gu;
const markerFor = (index: number) => `${MARKER_OPEN}${index}${MARKER_CLOSE}`;
const containsMarker = (text: string) => text.includes(MARKER_OPEN);

// A version is read behind `VERSION_LINE_LEAD`, which is then taken off.
const withoutLineLead = (
  line: readonly RichTextContent[],
): RichTextContent[] => {
  const [first, ...rest] = line;
  if (first?.type !== 'text' || !first.text?.startsWith(VERSION_LINE_LEAD)) {
    return [...line];
  }
  const text = first.text.slice(VERSION_LINE_LEAD.length);
  return text === '' ? rest : [{ ...first, text }, ...rest];
};

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
 * address, a file's address or description) cannot be shown.
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
  if (
    content.type !== 'text' &&
    content.attrs !== undefined &&
    JSON.stringify(content.attrs).includes(MARKER_OPEN)
  ) {
    throw new MessageDocumentProblem('valueInLinkAddress');
  }
  if (content.type === 'text') return content;
  if (content.content === undefined) return content;

  const restored: RichTextContent[] = [];
  for (const child of content.content) {
    if (child.type !== 'text' || !containsMarker(child.text ?? '')) {
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
// all spaces is all `before`.
const edgeSpace = (text: string): [string, string, string] => {
  const start = text.length - text.trimStart().length;
  const end = text.trimEnd().length;
  if (end <= start) return [text, '', ''];
  return [text.slice(0, start), text.slice(start, end), text.slice(end)];
};

// Whether markdown names a file anywhere but in a paragraph of its own, the
// one place a block is written.
const misplacesFile = (markdown: string): boolean =>
  assetBlocksInMarkdown(markdown).some(({ problems }) =>
    problems.some(
      ({ kind }) => kind === 'notInParagraph' || kind === 'byReference',
    ),
  );

// ---------------------------------------------------------------------------
// Reading: message → document
// ---------------------------------------------------------------------------

type Reading = Readonly<{
  format: MessageDocumentFormat;
  options: MessageDocumentOptions;
}>;

type Level = { text: string; pieces: RichTextContent[] };

/**
 * One level of a message as text with a marker for each value (and, in
 * supplied wording, each switch), and the nodes the markers stand for.
 * `plural` names the plural whose version the level is directly in.
 */
const levelOf = (
  nodes: readonly MessageNode[],
  plural: string | undefined,
  reading: Reading,
): Level => {
  const pieces: RichTextContent[] = [];
  let text = '';
  for (const node of nodes) {
    if (node.kind === 'text') {
      text += node.text;
      continue;
    }
    text += markerFor(pieces.length);
    if (node.kind === 'argument') {
      pieces.push(inlineValue(node.name));
      continue;
    }
    if (node.kind === 'count') {
      // The number a plural of supplied wording shows. In a number logic
      // block's version, `#` is read as the value the block is on
      // (`readContentDocument`), so it never reaches here.
      pieces.push(inlineValue(countTokenId(plural ?? '')));
      continue;
    }
    const labels = reading.options.versions;
    if (labels === undefined) throw new MessageDocumentProblem('inlineChoice');
    const inner = node.type === 'plural' ? node.argument : plural;
    const versions: RichTextVersion[] = inShownOrder(node.versions).map(
      (version) => {
        const nested = levelOf(version.nodes, inner, reading);
        return {
          key: version.key,
          label: labels.versionLabel(node, version.key),
          content: versionLine(nested, reading.format),
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
  return { text, pieces };
};

/**
 * A version's line from its markdown. Markdown drops the spaces at the ends
 * of a line, but a version's spaces are part of the sentence it sits in, so
 * they are kept as text.
 */
const versionLine = (
  { text, pieces }: Level,
  format: MessageDocumentFormat,
): RichTextContent[] => {
  if (!format.markdown) {
    return restoreMarkers(PLAIN_LINE(text), pieces).content?.[0]?.content ?? [];
  }
  if (text.includes('\n')) {
    throw new MessageDocumentProblem('linesInVersion');
  }
  const [before, middle, after] = edgeSpace(text);
  const parsed = restoreMarkers(
    markdownToRichTextContent(VERSION_LINE_LEAD + middle, {
      inline: true,
      links: true,
    }),
    pieces,
  );
  const line = withoutLineLead(parsed.content?.[0]?.content ?? []);
  if (before !== '') line.unshift({ type: 'text', text: before });
  if (after !== '') line.push({ type: 'text', text: after });
  return line;
};

/** The one paragraph of a message of one line, as the editor holds it. */
const lineDocumentOf = (
  nodes: readonly MessageNode[],
  reading: Reading,
): RichTextContent => {
  const top = levelOf(nodes, undefined, reading);
  if (!reading.format.markdown) {
    return restoreMarkers(PLAIN_LINE(top.text), top.pieces);
  }
  return restoreMarkers(
    markdownToRichTextContent(top.text, { inline: true, links: true }),
    top.pieces,
  );
};

/**
 * The inline content of a field's question or hint, as one line of markdown.
 */
const fieldLineOf = (
  message: string | undefined,
  reading: Reading,
): RichTextContent[] | undefined => {
  if (message === undefined || message === '') return undefined;
  const structure = messageStructure(message);
  if (!('nodes' in structure)) {
    throw new MessageDocumentProblem('unreadableDocument');
  }
  const line =
    lineDocumentOf(structure.nodes, {
      format: { markdown: true, singleLine: true },
      // A field's question is researcher text: no switches inside it.
      options: { fieldText: reading.options.fieldText },
    }).content?.[0]?.content ?? [];
  return line.length > 0 ? line : undefined;
};

/** The editor's block for the field `fieldId`. */
const fieldBlockOf = (fieldId: string, reading: Reading): RichTextContent => {
  const field = reading.options.fieldText?.(fieldId);
  const attrs = {
    fieldId,
    variable: field?.variable ?? '',
    showValidationHints: field?.showValidationHints ?? false,
  };
  if (reading.options.fieldBlockText === 'none') {
    return { type: FIELD_BLOCK, attrs };
  }
  const label = fieldLineOf(field?.prompt, reading);
  const hint = fieldLineOf(field?.hint, reading);
  return {
    type: FIELD_BLOCK,
    attrs,
    content: [
      {
        type: FIELD_LABEL,
        ...(label !== undefined && { content: label }),
      },
      { type: FIELD_HINT, ...(hint !== undefined && { content: hint }) },
    ],
  };
};

/** The blocks of markdown that a run of a document is. */
const markdownBlocksOf = (
  nodes: readonly MessageNode[],
  reading: Reading,
): RichTextContent[] => {
  const level = levelOf(nodes, undefined, reading);
  if (reading.format.assetBlocks === true && misplacesFile(level.text)) {
    throw new MessageDocumentProblem('misplacedFile');
  }
  const document = restoreMarkers(
    markdownToRichTextContent(level.text, {
      links: true,
      assetBlocks: reading.format.assetBlocks === true,
    }),
    level.pieces,
  );
  const blocks = document.content ?? [];
  // An empty run reads as one empty paragraph, which is no block of its own.
  return blocks.length === 1 &&
    blocks[0]?.type === 'paragraph' &&
    (blocks[0].content ?? []).length === 0
    ? []
    : blocks;
};

/** The editor's blocks for a document's nodes. */
const blocksOf = (nodes: ContentNodes, reading: Reading): RichTextContent[] =>
  nodes.flatMap((node): RichTextContent[] => {
    if (node.kind === 'markdown') {
      return markdownBlocksOf(node.nodes, reading);
    }
    if (node.kind === 'field') return [fieldBlockOf(node.fieldId, reading)];
    return [logicBlockOf(node.logic, reading)];
  });

/** A branch's blocks; one empty paragraph for a branch that shows nothing. */
const branchBlocks = (blocks: RichTextContent[]): RichTextContent[] =>
  blocks.length === 0 ? [{ type: 'paragraph' }] : blocks;

const logicBlockOf = (
  logic: ContentLogic,
  reading: Reading,
): RichTextContent => ({
  type: LOGIC_BLOCK,
  attrs: { meta: metaOfLogic(logic) },
  content: branchesOfLogic(logic).map((branch) => ({
    type: LOGIC_BRANCH,
    attrs: { key: branch.key, meta: branch.meta },
    content: branchBlocks(blocksOf(branch.content, reading)),
  })),
});

/**
 * The editor's document for a message: its text read as markdown or plain
 * text, each value an `inlineValue`, each switch of supplied wording a
 * versions element whose versions are lines of their own, and, in markdown of
 * several lines, each logic block a `logicBlock` and each field of a form a
 * `fieldBlock` (with its question and hint from `options.fieldText`, unless
 * `options.fieldBlockText` is `'none'`).
 *
 * Throws `MessageDocumentProblem` for a message the editor cannot show.
 */
export const messageToDocument = (
  message: string,
  format: MessageDocumentFormat,
  options: MessageDocumentOptions = {},
): RichTextContent => {
  const reading: Reading = { format, options };
  if (format.markdown && !format.singleLine) {
    const document = readContentDocument(message);
    if (document.problems.length > 0) {
      throw new MessageDocumentProblem(
        document.problems.some(({ kind }) => kind === 'inlineChoice')
          ? 'inlineChoice'
          : 'unreadableDocument',
      );
    }
    const blocks = blocksOf(document.nodes, reading);
    return {
      type: 'doc',
      content: blocks.length === 0 ? [{ type: 'paragraph' }] : blocks,
    };
  }
  const structure = messageStructure(message);
  if (!('nodes' in structure)) {
    throw new MessageDocumentProblem('unreadableDocument');
  }
  return lineDocumentOf(structure.nodes, reading);
};

/** The inline content of a one-line message, as the editor holds it. */
export const inlineContent = (
  nodes: readonly MessageNode[],
  format: MessageDocumentFormat,
  options: MessageDocumentOptions = {},
): RichTextContent[] =>
  lineDocumentOf(nodes, { format: { ...format, singleLine: true }, options })
    .content?.[0]?.content ?? [];

// ---------------------------------------------------------------------------
// Writing: document → message
// ---------------------------------------------------------------------------

const plainTextOf = (content: RichTextContent): string => {
  if (content.type === 'text') return content.text ?? '';
  if (content.type === 'hardBreak') return '\n';
  return (content.content ?? []).map(plainTextOf).join('');
};

/**
 * Replaces each value and versions element with a marker, keeping its marks
 * on the marker, so the text around them can be written as markdown.
 */
const withMarkers = (
  content: RichTextContent,
  pieces: RichTextContent[],
): RichTextContent => {
  if (content.type === INLINE_VALUE || content.type === 'versions') {
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
 * pill pasted anywhere else keeps its value as an ordinary value.
 */
const pieceNode = (
  piece: RichTextContent,
  format: MessageDocumentFormat,
  pluralArgument: string | undefined,
): MessageNode | undefined => {
  const attrs = piece.attrs ?? {};
  if (piece.type === INLINE_VALUE) {
    const id = typeof attrs.id === 'string' ? attrs.id : '';
    const countArgument = countArgumentOf(id);
    if (countArgument === undefined) return { kind: 'argument', name: id };
    return countArgument === pluralArgument
      ? { kind: 'count' }
      : { kind: 'argument', name: countArgument };
  }
  const meta: unknown = attrs.meta;
  if (!isSwitchMeta(meta) || !Array.isArray(attrs.versions)) return undefined;
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
 * Whether a message structure (`messageStructure`) shows nothing: only blank
 * words. PV's `isBlankMessage` asks the same of a stored message.
 */
export const isBlankStructure = (nodes: readonly MessageNode[]): boolean =>
  nodes.every((node) => node.kind === 'text' && node.text.trim() === '');

const MARKDOWN_LINE: MessageDocumentFormat = {
  markdown: true,
  singleLine: true,
};

/** A field's question or hint as a message, or undefined when it is empty. */
const fieldLineMessage = (
  content: readonly RichTextContent[] | undefined,
): string | undefined => {
  const nodes = messageNodesOf(
    lineDocument(content ?? []),
    MARKDOWN_LINE,
    false,
    undefined,
  );
  return isBlankStructure(nodes) ? undefined : printMessageStructure(nodes);
};

const fieldTextOf = (block: RichTextContent): [string, FieldText] => {
  const attrs = block.attrs ?? {};
  const fieldId = typeof attrs.fieldId === 'string' ? attrs.fieldId : '';
  const [label, hint] = [FIELD_LABEL, FIELD_HINT].map(
    (type) => block.content?.find((child) => child.type === type)?.content,
  );
  const prompt = fieldLineMessage(label);
  const hintMessage = fieldLineMessage(hint);
  return [
    fieldId,
    {
      variable: typeof attrs.variable === 'string' ? attrs.variable : '',
      showValidationHints: attrs.showValidationHints === true,
      ...(prompt !== undefined && { prompt }),
      ...(hintMessage !== undefined && { hint: hintMessage }),
    },
  ];
};

type Writing = Readonly<{
  format: MessageDocumentFormat;
  fieldTexts: Map<string, FieldText>;
}>;

/** A document's nodes from the editor's blocks. */
const contentOfBlocks = (
  blocks: readonly RichTextContent[],
  writing: Writing,
): ContentNode[] => {
  const nodes: ContentNode[] = [];
  let run: RichTextContent[] = [];
  const endRun = () => {
    if (run.length === 0) return;
    // A run is written outside any plural, so a value is never written as
    // `#`: in a branch of a number block, the number is written as the value
    // the block is on, which reads the same in every branch.
    const written = messageNodesOf(
      { type: 'doc', content: run },
      writing.format,
      false,
      undefined,
    );
    if (!isBlankStructure(written))
      nodes.push({ kind: 'markdown', nodes: written });
    run = [];
  };
  for (const block of blocks) {
    if (block.type === FIELD_BLOCK) {
      endRun();
      const [fieldId, text] = fieldTextOf(block);
      writing.fieldTexts.set(fieldId, text);
      nodes.push({ kind: 'field', fieldId });
      continue;
    }
    if (block.type === LOGIC_BLOCK) {
      endRun();
      const logic = contentLogicOf(block, writing);
      if (logic !== undefined) nodes.push({ kind: 'logic', logic });
      continue;
    }
    run.push(block);
  }
  endRun();
  return nodes;
};

const contentLogicOf = (
  block: RichTextContent,
  writing: Writing,
): ContentLogic | undefined => {
  const meta = logicBlockMetaOf(block.attrs?.meta);
  if (meta === undefined) return undefined;
  const branches = (block.content ?? [])
    .filter((child) => child.type === LOGIC_BRANCH)
    .map((child): BranchContent => {
      const key = typeof child.attrs?.key === 'string' ? child.attrs.key : '';
      return {
        key,
        meta: child.attrs?.meta,
        content: contentOfBlocks(child.content ?? [], writing),
      };
    });
  return logicOfBranches(meta, branches);
};

/**
 * The message nodes the editor's document of one line is: its text as
 * markdown or plain text, each value an argument, and each versions element
 * of supplied wording a switch.
 */
export const documentToMessageNodes = (
  document: RichTextContent,
  format: MessageDocumentFormat,
): MessageNode[] => messageNodesOf(document, format, false, undefined);

/**
 * The message the editor's document is, or undefined for a document that says
 * nothing, and the question, hint and settings of each field it places, by
 * field id (for the text of a form; see `FieldText`). Markdown of several
 * lines is written as `printContentDocument` writes a document: its blocks
 * separated by blank lines, each logic block in its one shape, each field as
 * `![](field:<id>)`.
 */
export const documentToMessage = (
  document: RichTextContent,
  format: MessageDocumentFormat,
): Readonly<{
  message: string | undefined;
  fieldTexts: ReadonlyMap<string, FieldText>;
}> => {
  const fieldTexts = new Map<string, FieldText>();
  if (format.markdown && !format.singleLine) {
    const nodes = contentOfBlocks(document.content ?? [], {
      format,
      fieldTexts,
    });
    const message = printContentDocument(nodes);
    return {
      message: message.trim() === '' ? undefined : message,
      fieldTexts,
    };
  }
  const nodes = documentToMessageNodes(document, format);
  return {
    message: isBlankStructure(nodes) ? undefined : printMessageStructure(nodes),
    fieldTexts,
  };
};

/**
 * The editor node of one field block, with `text` as its question and hint:
 * what a form's text holds for the field `fieldId`. Undefined where the
 * block cannot be opened (`MessageDocumentProblem`).
 */
export const fieldBlockNodeOf = (
  fieldId: string,
  text: FieldText,
): RichTextContent | undefined => {
  try {
    return messageToDocument(
      fieldBlockMarkdown(fieldId),
      { markdown: true, singleLine: false },
      { fieldText: (candidate) => (candidate === fieldId ? text : undefined) },
    ).content?.[0];
  } catch (error) {
    if (error instanceof MessageDocumentProblem) return undefined;
    throw error;
  }
};

/**
 * The editor's document for the stored text of the field `name`. Validation
 * refuses a protocol containing text the editor cannot show, so one that
 * reaches an editor is a fault, and this throws.
 */
export const openMessageDocument = (
  name: string,
  message: string,
  format: MessageDocumentFormat,
  options: MessageDocumentOptions = {},
): RichTextContent => {
  try {
    return messageToDocument(message, format, options);
  } catch (error) {
    throw error instanceof MessageDocumentProblem
      ? new Error(`The text of "${name}" cannot be opened for editing.`, {
          cause: error,
        })
      : error;
  }
};

import { boundedCache } from '@codaco/shared-consts';

import {
  dynamicValueNameFor,
  FALSE_CASE,
  parseDynamicValueName,
  TRUE_CASE,
} from '../schemas/9/dynamic-value-names.ts';
import { MISSING_CASE } from './dynamicValueMessages.ts';
import { fieldBlockMarkdown, readFieldBlockUrl } from './fieldBlock.ts';
import {
  type ConditionVersion,
  type Logic,
  logicVersions,
  type NumberVersionsByCategory,
} from './logic.ts';
import { markdownTree } from './markdownTree.ts';
import { isPluralCategory } from './messageArguments.ts';
import {
  type MessageNode,
  type MessageSwitch,
  type MessageVersion,
  messageStructure,
  printMessageStructure,
} from './messageStructure.ts';

/**
 * Text of several lines read as a document: runs of markdown, the fields of a
 * form, and logic blocks, each of which shows one of its versions. This is the
 * one reading of such text. Validation, the editor, the interview and the
 * protocol summary all read it through `readContentDocument`, and the editor
 * writes it through `printContentDocument`.
 *
 * A logic block is an ICU `select` (or a `select` around a `plural`) that is
 * a whole block of the text: the text before it is empty or ends with a
 * blank line, and the text after it is empty or starts with one. Each of its
 * versions is a document of its own, which may contain any block, including
 * fields and further logic blocks. A field is a paragraph that contains only
 * `![](field:<id>)` (see `fieldBlock.ts`).
 */
export type ContentNodes = readonly ContentNode[];

export type ContentNode =
  /**
   * Whole markdown blocks: text, the values it shows and, in a plural's
   * version, the count. Only text with a problem (`inlineChoice`,
   * `unrecognisedLogic`) keeps a switch here, so that it is not lost.
   */
  | Readonly<{ kind: 'markdown'; nodes: readonly MessageNode[] }>
  | Readonly<{ kind: 'field'; fieldId: string }>
  | Readonly<{ kind: 'logic'; logic: ContentLogic }>;

/**
 * The logic of a logic block (see `Logic`), whose versions are documents. A
 * number block has a version for each plural category of its language.
 */
export type ContentLogic = Logic<
  ContentNodes,
  NumberVersionsByCategory<ContentNodes>
>;

export type ContentDocumentProblemKind =
  /** The text is not a message that can be read (bad ICU syntax). */
  | 'unreadable'
  /** A choice of versions inside a sentence: not a whole block. */
  | 'inlineChoice'
  /** A whole-block choice that is not one of the logic block shapes. */
  | 'unrecognisedLogic'
  /** A field block beside other content, or inside other markdown. */
  | 'fieldNotOwnParagraph'
  /** A field block inside a list. */
  | 'fieldInList'
  /** A field block written with alternative text. */
  | 'fieldHasDescription'
  /**
   * A field block written in a form other than `![](field:<id>)`, such as
   * with a title or with its address in angle brackets.
   */
  | 'fieldNotStandard'
  /** A field block named through a reference (`![][x]`, `[x]: field:…`). */
  | 'fieldByReference';

type ContentDocumentProblem = Readonly<{
  kind: ContentDocumentProblemKind;
  /** The version keys from the top of the text to where the problem is. */
  at: readonly string[];
}>;

type ContentDocumentReading = Readonly<{
  nodes: ContentNodes;
  problems: readonly ContentDocumentProblem[];
}>;

const OTHER_CASE = 'other';
const PARTICIPANT_NAME = dynamicValueNameFor({
  kind: 'participant',
  role: 'node',
});

// Stands where a run shows a value, a count or a switch, so that markdown
// reads it as one character of text. A private-use character, which authored
// text does not contain and markdown gives no meaning.
const NOT_TEXT = '';

const BLANK_LINE_BEFORE = /\n[^\S\n]*\n[^\S\n]*$/;
const BLANK_LINE_AFTER = /^[^\S\n]*\n[^\S\n]*\n/;
const LEADING_BLANK_LINES = /^(?:[^\S\n]*\n)+/;

const isBlank = (text: string) => text.trim() === '';

type Run = MessageNode[];

const runText = (run: readonly MessageNode[]): string =>
  run.map((node) => (node.kind === 'text' ? node.text : NOT_TEXT)).join('');

/**
 * The nodes of `run` that cover characters `start` to `end` of its text
 * (`runText`), where each node that is not text is one character.
 */
const sliceRun = (
  run: readonly MessageNode[],
  start: number,
  end: number,
): MessageNode[] => {
  const nodes: MessageNode[] = [];
  let offset = 0;
  for (const node of run) {
    const length = node.kind === 'text' ? node.text.length : 1;
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + length);
    if (from < to) {
      nodes.push(
        node.kind === 'text'
          ? { kind: 'text', text: node.text.slice(from - offset, to - offset) }
          : node,
      );
    }
    offset += length;
  }
  return nodes;
};

/** `run` without blank lines at its start or white space at its end. */
const trimRun = (run: readonly MessageNode[]): MessageNode[] => {
  const nodes = [...run];
  const first = nodes[0];
  if (first?.kind === 'text') {
    const text = first.text.replace(LEADING_BLANK_LINES, '');
    if (text === '') nodes.shift();
    else nodes[0] = { kind: 'text', text };
  }
  const last = nodes.at(-1);
  if (last?.kind === 'text') {
    // `trimEnd` removes what `\s+$` matches, in time that grows with the
    // length of the text: the expression is tried from each white space
    // character, so a long run of it before other text takes time that grows
    // with the square of the run's length.
    const text = last.text.trimEnd();
    if (text === '') nodes.pop();
    else nodes[nodes.length - 1] = { kind: 'text', text };
  }
  return nodes;
};

type MarkdownTreeNode = Readonly<{
  type: string;
  url?: string;
  alt?: string | null;
  children?: readonly MarkdownTreeNode[];
  position?: Readonly<{
    start: Readonly<{ offset?: number }>;
    end: Readonly<{ offset?: number }>;
  }>;
}>;

type FieldParagraph = Readonly<{
  fieldId: string;
  start: number;
  end: number;
  described: boolean;
  /** Whether the image is written exactly as `fieldBlockMarkdown` writes it. */
  standard: boolean;
}>;

const fieldOf = (node: MarkdownTreeNode): string | undefined =>
  (node.type === 'image' || node.type === 'definition') &&
  typeof node.url === 'string'
    ? readFieldBlockUrl(node.url)
    : undefined;

/** The paragraph's field, when the paragraph contains a field image only. */
const ownFieldOf = (paragraph: MarkdownTreeNode): string | undefined => {
  const [only, ...rest] = paragraph.children ?? [];
  if (only === undefined || rest.length > 0 || only.type !== 'image') {
    return undefined;
  }
  return fieldOf(only);
};

/** Problems with field images below `node`, which is not a field paragraph. */
const misplacedFields = (
  node: MarkdownTreeNode,
  inList: boolean,
): ContentDocumentProblemKind[] => {
  if (fieldOf(node) !== undefined) {
    if (node.type === 'definition') return ['fieldByReference'];
    return [inList ? 'fieldInList' : 'fieldNotOwnParagraph'];
  }
  const nestedInList = inList || node.type === 'list';
  return (node.children ?? []).flatMap((child) =>
    misplacedFields(child, nestedInList),
  );
};

/**
 * The run's top-level field paragraphs, by their place in its text, and the
 * problems with every other field image in it.
 */
const fieldsInRun = (
  text: string,
): Readonly<{
  fields: readonly FieldParagraph[];
  problems: readonly ContentDocumentProblemKind[];
}> => {
  // Most text names no field; its markdown need not be read for one.
  if (!/field/i.test(text)) return { fields: [], problems: [] };
  const fields: FieldParagraph[] = [];
  const problems: ContentDocumentProblemKind[] = [];
  const root = markdownTree(text) as MarkdownTreeNode;
  for (const child of root.children ?? []) {
    const fieldId = child.type === 'paragraph' ? ownFieldOf(child) : undefined;
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    if (fieldId !== undefined && start !== undefined && end !== undefined) {
      const [image] = child.children ?? [];
      const imageStart = image?.position?.start.offset;
      const imageEnd = image?.position?.end.offset;
      fields.push({
        fieldId,
        start,
        end,
        described: typeof image?.alt === 'string' && image.alt.trim() !== '',
        standard:
          imageStart !== undefined &&
          imageEnd !== undefined &&
          text.slice(imageStart, imageEnd) === fieldBlockMarkdown(fieldId),
      });
      continue;
    }
    problems.push(...misplacedFields(child, false));
  }
  return { fields, problems };
};

/**
 * The blocks of one run of text: markdown, split at each paragraph that is a
 * field.
 */
const runBlocks = (
  run: readonly MessageNode[],
  at: readonly string[],
  problems: ContentDocumentProblem[],
): ContentNode[] => {
  const text = runText(run);
  if (isBlank(text)) return [];
  const found = fieldsInRun(text);
  for (const kind of found.problems) problems.push({ kind, at });
  const blocks: ContentNode[] = [];
  const pushMarkdown = (start: number, end: number) => {
    const nodes = trimRun(sliceRun(run, start, end));
    if (nodes.length > 0) blocks.push({ kind: 'markdown', nodes });
  };
  let offset = 0;
  for (const field of found.fields) {
    pushMarkdown(offset, field.start);
    if (field.described) problems.push({ kind: 'fieldHasDescription', at });
    else if (!field.standard) problems.push({ kind: 'fieldNotStandard', at });
    blocks.push({ kind: 'field', fieldId: field.fieldId });
    offset = field.end;
  }
  pushMarkdown(offset, text.length);
  return blocks;
};

const versionOf = (
  node: MessageSwitch,
  key: string,
): MessageVersion | undefined =>
  node.versions.find((version) => version.key === key);

const hasExactKeys = (node: MessageSwitch, keys: readonly string[]) =>
  node.versions.length === keys.length &&
  keys.every((key) => versionOf(node, key) !== undefined);

type Reader = (
  nodes: readonly MessageNode[],
  at: readonly string[],
) => ContentNodes;

/**
 * The logic block a whole-block switch is, or undefined when its shape is
 * none of the four.
 */
const logicOf = (
  node: MessageSwitch,
  at: readonly string[],
  read: Reader,
): ContentLogic | undefined => {
  if (node.type !== 'select') return undefined;
  const parsed = parseDynamicValueName(node.argument);
  const readVersion = (key: string) =>
    read(versionOf(node, key)?.nodes ?? [], [...at, key]);

  if (parsed?.kind === 'condition') {
    const when = hasExactKeys(node, [TRUE_CASE, OTHER_CASE])
      ? ('met' as const)
      : hasExactKeys(node, [FALSE_CASE, OTHER_CASE])
        ? ('notMet' as const)
        : undefined;
    if (when === undefined) return undefined;
    const first: ConditionVersion<ContentNodes> = {
      conditionId: parsed.conditionId,
      when,
      content: readVersion(when === 'met' ? TRUE_CASE : FALSE_CASE),
    };
    const otherwise = readVersion(OTHER_CASE);
    // An `other` that is one further `conditions` block is its next
    // version ("else if"), as the editor shows it.
    const [only, ...rest] = otherwise;
    if (
      only?.kind === 'logic' &&
      only.logic.kind === 'conditions' &&
      rest.length === 0
    ) {
      return {
        kind: 'conditions',
        versions: [first, ...only.logic.versions],
        otherwise: only.logic.otherwise,
      };
    }
    return { kind: 'conditions', versions: [first], otherwise };
  }

  if (node.argument === PARTICIPANT_NAME) {
    if (!hasExactKeys(node, [TRUE_CASE, OTHER_CASE])) return undefined;
    return {
      kind: 'participant',
      participant: readVersion(TRUE_CASE),
      otherwise: readVersion(OTHER_CASE),
    };
  }

  // A dynamic attribute has neither answers nor a number, and is never
  // missing: a block that chose by one would always show the same version.
  if (
    parsed?.kind === 'dynamicAttribute' ||
    versionOf(node, MISSING_CASE) === undefined ||
    versionOf(node, OTHER_CASE) === undefined
  ) {
    return undefined;
  }

  // A number: a `missing` version, and an `other` version that is only a
  // plural on the same value.
  const otherNodes = versionOf(node, OTHER_CASE)?.nodes ?? [];
  const [plural, ...afterPlural] = otherNodes;
  if (
    node.versions.length === 2 &&
    plural?.kind === 'switch' &&
    plural.type === 'plural' &&
    plural.argument === node.argument &&
    afterPlural.length === 0
  ) {
    if (
      plural.offset !== undefined ||
      plural.versions.some(({ key }) => !isPluralCategory(key))
    ) {
      return undefined;
    }
    return {
      kind: 'number',
      value: node.argument,
      missing: readVersion(MISSING_CASE),
      counted: {
        by: 'category',
        versions: plural.versions.flatMap(({ key, nodes }) =>
          isPluralCategory(key) && key !== OTHER_CASE
            ? [
                {
                  category: key,
                  content: read(nodes, [...at, OTHER_CASE, key]),
                },
              ]
            : [],
        ),
        other: read(versionOf(plural, OTHER_CASE)?.nodes ?? [], [
          ...at,
          OTHER_CASE,
          OTHER_CASE,
        ]),
      },
    };
  }

  return {
    kind: 'answers',
    value: node.argument,
    missing: readVersion(MISSING_CASE),
    versions: node.versions
      .filter(({ key }) => key !== MISSING_CASE && key !== OTHER_CASE)
      .map(({ key, nodes }) => ({
        caseKey: key,
        content: read(nodes, [...at, key]),
      })),
    other: readVersion(OTHER_CASE),
  };
};

/**
 * Whether the switch at `index` of `nodes` is a whole block: the text since
 * the last switch is blank or ends with a blank line, and the text up to the
 * next switch is blank or starts with one.
 */
const standsAsBlock = (
  nodes: readonly MessageNode[],
  index: number,
): boolean => {
  let before = '';
  for (let at = index - 1; at >= 0; at -= 1) {
    const node = nodes[at];
    if (node === undefined || node.kind === 'switch') break;
    before = (node.kind === 'text' ? node.text : NOT_TEXT) + before;
  }
  let after = '';
  for (let at = index + 1; at < nodes.length; at += 1) {
    const node = nodes[at];
    if (node === undefined || node.kind === 'switch') break;
    after += node.kind === 'text' ? node.text : NOT_TEXT;
  }
  const blankBefore = isBlank(before) || BLANK_LINE_BEFORE.test(before);
  const blankAfter = isBlank(after) || BLANK_LINE_AFTER.test(after);
  // Indented, the switch would continue a list item or start code.
  const indented = /[^\S\n]$/.test(before) && !isBlank(before);
  return blankBefore && blankAfter && !indented;
};

const readLevel = (
  nodes: readonly MessageNode[],
  at: readonly string[],
  problems: ContentDocumentProblem[],
): ContentNodes => {
  const read: Reader = (inner, innerAt) => readLevel(inner, innerAt, problems);
  const blocks: ContentNode[] = [];
  let run: Run = [];
  const endRun = () => {
    blocks.push(...runBlocks(run, at, problems));
    run = [];
  };
  nodes.forEach((node, index) => {
    if (node.kind !== 'switch') {
      run.push(node);
      return;
    }
    if (!standsAsBlock(nodes, index)) {
      problems.push({ kind: 'inlineChoice', at });
      run.push(node);
      return;
    }
    const logic = logicOf(node, at, read);
    if (logic === undefined) {
      problems.push({ kind: 'unrecognisedLogic', at });
      endRun();
      blocks.push({ kind: 'markdown', nodes: [node] });
      return;
    }
    endRun();
    blocks.push({ kind: 'logic', logic });
  });
  endRun();
  return blocks;
};

const readMessage = (message: string): ContentDocumentReading => {
  const structure = messageStructure(message);
  if (!('nodes' in structure)) {
    return { nodes: [], problems: [{ kind: 'unreadable', at: [] }] };
  }
  const problems: ContentDocumentProblem[] = [];
  const nodes = readLevel(structure.nodes, [], problems);
  return { nodes, problems };
};

/**
 * The document a message of several lines is (see `ContentNode`), with what
 * stops it being read as one: a choice inside a sentence, a whole-block
 * choice that is no logic block, and a field written where it cannot be a
 * block. Leading and trailing blank lines of each version are not
 * significant.
 *
 * Validation, the editor and the interview read the same text many times,
 * mostly text that has not changed, and a reading is only ever read, so
 * readings are kept (`boundedCache`).
 */
export const readContentDocument: (message: string) => ContentDocumentReading =
  boundedCache(500, readMessage);

const BLOCK_SEPARATOR: MessageNode = { kind: 'text', text: '\n\n' };

const version = (key: string, nodes: ContentNodes): MessageVersion => ({
  key,
  nodes: documentNodes(nodes),
});

/**
 * The message nodes of a logic block: one switch, in the shape of its kind.
 * A `conditions` block without versions chooses nothing, and is written as
 * its `otherwise` content.
 */
const logicNodes = (logic: ContentLogic): readonly MessageNode[] => {
  switch (logic.kind) {
    case 'conditions': {
      const [first, ...rest] = logic.versions;
      if (first === undefined) return documentNodes(logic.otherwise);
      // Each further version is the whole `other` version ("else if").
      const otherwise: ContentNodes =
        rest.length === 0
          ? logic.otherwise
          : [{ kind: 'logic', logic: { ...logic, versions: rest } }];
      return [
        {
          kind: 'switch',
          argument: dynamicValueNameFor({
            kind: 'condition',
            conditionId: first.conditionId,
          }),
          type: 'select',
          versions: [
            version(
              first.when === 'met' ? TRUE_CASE : FALSE_CASE,
              first.content,
            ),
            version(OTHER_CASE, otherwise),
          ],
        },
      ];
    }
    case 'answers':
      return [
        {
          kind: 'switch',
          argument: logic.value,
          type: 'select',
          versions: [
            version(MISSING_CASE, logic.missing),
            ...logic.versions.map(({ caseKey, content }) =>
              version(caseKey, content),
            ),
            version(OTHER_CASE, logic.other),
          ],
        },
      ];
    case 'number': {
      // `other` last; ICU requires one.
      const plural: MessageSwitch = {
        kind: 'switch',
        argument: logic.value,
        type: 'plural',
        versions: [
          ...logic.counted.versions.map(({ category, content }) =>
            version(category, content),
          ),
          version(OTHER_CASE, logic.counted.other),
        ],
      };
      return [
        {
          kind: 'switch',
          argument: logic.value,
          type: 'select',
          versions: [
            version(MISSING_CASE, logic.missing),
            { key: OTHER_CASE, nodes: [plural] },
          ],
        },
      ];
    }
    case 'participant':
    default:
      return [
        {
          kind: 'switch',
          argument: PARTICIPANT_NAME,
          type: 'select',
          versions: [
            version(TRUE_CASE, logic.participant),
            version(OTHER_CASE, logic.otherwise),
          ],
        },
      ];
  }
};

const blockNodes = (node: ContentNode): readonly MessageNode[] => {
  switch (node.kind) {
    case 'markdown':
      return node.nodes;
    case 'field':
      return [{ kind: 'text', text: fieldBlockMarkdown(node.fieldId) }];
    case 'logic':
    default:
      return logicNodes(node.logic);
  }
};

/** The message nodes of a document: its blocks, separated by blank lines. */
const documentNodes = (nodes: ContentNodes): MessageNode[] =>
  nodes.flatMap((node, index) => [
    ...(index === 0 ? [] : [BLOCK_SEPARATOR]),
    ...blockNodes(node),
  ]);

/**
 * The message a document is written as: its blocks separated by one blank
 * line, each logic block in its one shape (see `ContentLogic`), each field
 * as `![](field:<id>)`. Text read by `readContentDocument` and printed again
 * comes back unchanged when it was written this way.
 */
export const printContentDocument = (nodes: ContentNodes): string =>
  printMessageStructure(documentNodes(nodes));

/** The documents of a logic block's versions, in the order they are written. */
const versionContents = (logic: ContentLogic): readonly ContentNodes[] =>
  logicVersions(logic).map(({ content }) => content);

/**
 * The id of every field the document places, in document order, in every
 * version of every logic block.
 */
export const fieldIdsIn = (nodes: ContentNodes): readonly string[] =>
  nodes.flatMap((node) => {
    if (node.kind === 'field') return [node.fieldId];
    if (node.kind === 'logic')
      return versionContents(node.logic).flatMap(fieldIdsIn);
    return [];
  });

/**
 * Every logic block of the document, at any depth, outer blocks before the
 * blocks inside them, each with the fields inside it (at any depth).
 */
export const logicBlocksIn = (
  nodes: ContentNodes,
): readonly Readonly<{
  logic: ContentLogic;
  fieldIds: readonly string[];
}>[] =>
  nodes.flatMap((node) => {
    if (node.kind !== 'logic') return [];
    const versions = versionContents(node.logic);
    return [
      { logic: node.logic, fieldIds: versions.flatMap(fieldIdsIn) },
      ...versions.flatMap(logicBlocksIn),
    ];
  });

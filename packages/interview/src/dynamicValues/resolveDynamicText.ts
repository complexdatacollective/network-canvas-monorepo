import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
import { getMarkdownAttributeValues } from '@codaco/fresco-ui/RenderMarkdown';
import {
  ASCII_PUNCTUATION,
  type Conditions,
  DYNAMIC_VALUE_MARKER,
  type DynamicValueReference,
  type DynamicValueRole,
  type DynamicValueState,
  dynamicMessageParts,
  dynamicValueCaseOf,
  dynamicValueReferencesIn,
  INTRINSIC_DYNAMIC_VALUES,
  type IntrinsicDynamicValue,
  isSameOptionValue,
  type LocaleTag,
  type LocalizedString,
  markdownTree,
  type ParsedDynamicValuePath,
  type Variable,
} from '@codaco/protocol-validation';

import type { ContentFormat } from '../localization/contentFormat';
import type { ConnectivityIndex } from '../nodeLabels/connectivity';
import { readOwnProperty } from '../utils/ownProperty';
import { conditionHolds } from './conditions';

/**
 * Everything a stage's text can show at one place in the interview: the
 * values the interview itself knows, the attributes of each entity on screen
 * there, with the codebook variables that describe them, and the label each
 * node on screen shows. Text names each of these directly (see
 * `parseDynamicValueName`). Built by `DynamicValueScope`; a role with no
 * attributes or label is not on screen, so a value about it reads as
 * missing.
 */
export type DynamicValueSources = Readonly<{
  intrinsics: Readonly<Record<IntrinsicDynamicValue, unknown>>;
  attributes: Readonly<
    Partial<Record<DynamicValueRole, Readonly<Record<string, unknown>>>>
  >;
  labels: Readonly<Partial<Record<DynamicValueRole, string>>>;
  /**
   * Whether each node on screen that may be the participant is (see
   * `node_isParticipant`); a role without an entry reads as missing.
   */
  participants?: Readonly<Partial<Record<DynamicValueRole, boolean>>>;
  /**
   * The conditions the text can choose its wording by, by id (the stage's,
   * or a node type label's), with what they are asked of here: the id of
   * each entity on screen that is saved in the network, the node type its
   * node roles are of, and how the network's nodes are connected.
   */
  conditions?: Conditions | undefined;
  entityIds?: Readonly<Partial<Record<DynamicValueRole, string>>>;
  nodeType?: string | undefined;
  connectivity?: ConnectivityIndex | undefined;
  /**
   * Conditions already judged, by id, for a caller that judges them itself
   * (a node's label, which follows each one closely). A condition without an
   * entry is judged from `conditions`.
   */
  conditionFacts?: Readonly<Record<string, boolean>>;
  variablesFor: (
    role: DynamicValueRole,
  ) => Readonly<Record<string, Variable>> | undefined;
}>;

/**
 * A value as one message reads it: missing, or present, with the raw value
 * and what it is, for choosing its versions and for formatting.
 */
type ResolvedDynamicValue =
  | Readonly<{ missing: true }>
  | Readonly<{
      missing: false;
      value: unknown;
      /** The codebook variable, for an attribute. */
      variable?: Variable;
      /** The intrinsic, for a value the interview knows. */
      intrinsic?: IntrinsicDynamicValue;
    }>;

const MISSING: ResolvedDynamicValue = { missing: true };

/**
 * Missing as the interview's forms judge an answer missing: null, undefined,
 * text of only spaces, NaN and an empty list. 0 and false are answers.
 */
const isMissing = isUnanswered;

/**
 * The value a name in a message stands for, here. A name that stands for
 * nothing (`parsed` undefined) reads as missing, as does a value about a role
 * that is not on screen and a condition the text's stage does not declare.
 */
const resolveDynamicValue = (
  parsed: ParsedDynamicValuePath | undefined,
  sources: DynamicValueSources,
): ResolvedDynamicValue => {
  if (parsed === undefined) return MISSING;
  if (parsed.kind === 'intrinsic') {
    const value = sources.intrinsics[parsed.name];
    return isMissing(value)
      ? MISSING
      : { missing: false, value, intrinsic: parsed.name };
  }
  if (parsed.kind === 'label') {
    // A node on screen always has a label, and its text is shown as the node
    // shows it, even when that is only spaces.
    const label = sources.labels[parsed.role];
    return label === undefined ? MISSING : { missing: false, value: label };
  }
  if (parsed.kind === 'participant') {
    const isParticipant = sources.participants?.[parsed.role];
    return isParticipant === undefined
      ? MISSING
      : { missing: false, value: isParticipant };
  }
  if (parsed.kind === 'condition') {
    const { conditionId } = parsed;
    const judged =
      sources.conditionFacts === undefined
        ? undefined
        : readOwnProperty(sources.conditionFacts, conditionId);
    const condition =
      sources.conditions === undefined
        ? undefined
        : readOwnProperty(sources.conditions, conditionId);
    const met =
      judged ??
      (condition === undefined
        ? undefined
        : conditionHolds(condition, sources));
    return met === undefined ? MISSING : { missing: false, value: met };
  }
  // An entity's attributes can be keyed by a roster column's heading as well
  // as by variable ids, so only an own value counts.
  const attributes = sources.attributes[parsed.role];
  const value =
    attributes === undefined
      ? undefined
      : readOwnProperty(attributes, parsed.variableId);
  if (isMissing(value)) return MISSING;
  const variables = sources.variablesFor(parsed.role);
  const variable =
    variables === undefined
      ? undefined
      : readOwnProperty(variables, parsed.variableId);
  return {
    missing: false,
    value,
    ...(variable !== undefined && { variable }),
  };
};

/** How values are written, in the language the participant reads. */
export type DynamicValueFormatters = Readonly<{
  format: ContentFormat;
  /** A protocol-authored label, such as an option's, as text. */
  resolveLabel: (label: LocalizedString) => string;
  /** "Yes" and "No", for a true or false value with no option labels. */
  booleanWords: Readonly<{ yes: string; no: string }>;
}>;

const DATE_ONLY = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const dateFormat = (
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateFormats.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, formatter);
  }
  return formatter;
};

/**
 * The UTC day a stored year, month and day name, or undefined when they name
 * none: a day that is not on the calendar (`2024-02-31`) would roll over into
 * another, and year 0 is before the first a date picker offers.
 */
const calendarDate = (
  year: string,
  month = '01',
  day = '01',
): Date | undefined => {
  // Date.UTC reads years 0-99 as 1900-1999; setUTCFullYear takes the year as
  // written.
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  return Number(year) >= 1 &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
    ? date
    : undefined;
};

/**
 * A date as the participant's language writes it. A date picker stores a day
 * (`2024-03-05`), a month (`2024-03`) or a year (`2024`), which are calendar
 * dates rather than instants, so they are formatted in UTC and never shift a
 * day with the participant's time zone. Anything else is read as an instant.
 */
const formatDate = (value: unknown, locale: string): string => {
  if (typeof value === 'string') {
    const match = DATE_ONLY.exec(value);
    if (match) {
      const [, year = '', month, day] = match;
      const date = calendarDate(year, month, day);
      // Shown as stored rather than as a different date.
      if (date === undefined) return value;
      return dateFormat(locale, {
        timeZone: 'UTC',
        year: 'numeric',
        ...(month !== undefined && { month: 'long' }),
        ...(day !== undefined && { day: 'numeric' }),
      }).format(date);
    }
  }
  // Only a full ISO date and time on the calendar is read as an instant: the
  // engine's own parser accepts other text (`2024-1`) and invents the parts it
  // lacks, and rolls an impossible day over into another.
  const instant = typeof value === 'string' ? ISO_INSTANT.exec(value) : null;
  const date =
    value instanceof Date
      ? value
      : typeof value === 'number'
        ? new Date(value)
        : instant && calendarDate(instant[1] ?? '', instant[2], instant[3])
          ? new Date(instant.input)
          : undefined;
  if (date === undefined || Number.isNaN(date.getTime())) return String(value);
  return dateFormat(locale, { dateStyle: 'long' }).format(date);
};

const optionLabel = (
  variable: Variable | undefined,
  value: unknown,
  formatters: DynamicValueFormatters,
): string | undefined => {
  if (variable === undefined || !('options' in variable)) return undefined;
  const option = variable.options?.find((candidate) =>
    isSameOptionValue(value, candidate.value),
  );
  return option === undefined
    ? undefined
    : formatters.resolveLabel(option.label);
};

const formatOne = (
  value: unknown,
  variable: Variable | undefined,
  formatters: DynamicValueFormatters,
): string => {
  const label = optionLabel(variable, value, formatters);
  if (label !== undefined) return label;
  // A valid protocol never shows a yes/no attribute without labels as words
  // (`dynamicValueUnshowableReason`); the interface's Yes and No only keep
  // text readable if one reaches the interview anyway.
  if (typeof value === 'boolean') {
    return value ? formatters.booleanWords.yes : formatters.booleanWords.no;
  }
  if (typeof value === 'number') return formatters.format.formatNumber(value);
  return String(value);
};

/**
 * A present value as text in the participant's language: numbers and dates
 * in its formats, an option by its label, a list in its list pattern, and
 * text as written.
 */
const formatDynamicValue = (
  resolved: Extract<ResolvedDynamicValue, { missing: false }>,
  formatters: DynamicValueFormatters,
): string => {
  const { value, variable, intrinsic } = resolved;
  const type =
    intrinsic === undefined
      ? variable?.type
      : INTRINSIC_DYNAMIC_VALUES[intrinsic].type;
  if (type === 'datetime') {
    return formatDate(value, formatters.format.locale);
  }
  if (Array.isArray(value)) {
    return formatters.format.formatList(
      value.map((item) => formatOne(item, variable, formatters)),
    );
  }
  return formatOne(value, variable, formatters);
};

/**
 * A piece of resolved text: words of the message, or a value in it, with the
 * name the message gives it and its text.
 */
export type DynamicTextPart = string | Readonly<{ name: string; text: string }>;

export type DynamicText = Readonly<{
  parts: readonly DynamicTextPart[];
  /** The natural sentence, values and all. */
  text: string;
}>;

/**
 * In development, says which names a message uses that stand for nothing. Such a
 * name reads as missing, so the participant sees no sign of it, and only a
 * protocol that skipped validation can contain one. Names only, never
 * values, so that no participant's answer reaches the console.
 */
const warnOfUnknownNames = (references: readonly DynamicValueReference[]) => {
  const unknown = references.flatMap(({ name, parsed }) =>
    parsed === undefined ? [name] : [],
  );
  if (unknown.length === 0 || !import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[interview] Text uses ${unknown.map((name) => `"${name}"`).join(', ')}, which ${unknown.length === 1 ? 'refers' : 'refer'} to no value, and is read as missing. Validation refuses a protocol whose text does this.`,
  );
};

// Each message is read once, so a warning about it is given once.
const referencesByMessage = new Map<string, readonly DynamicValueReference[]>();
const referencesIn = (message: string): readonly DynamicValueReference[] => {
  let references = referencesByMessage.get(message);
  if (references === undefined) {
    references = dynamicValueReferencesIn(message);
    referencesByMessage.set(message, references);
    warnOfUnknownNames(references);
  }
  return references;
};

/**
 * The version of `message` (written in `locale`) that the values at this
 * place read, with each value it shows formatted. Each name the message uses
 * is read for what it stands for (see `parseDynamicValueName`). Selects and
 * plurals on a value are decided here, so a participant's value never
 * reaches ICU matching: a select takes `missing` for a missing value, else
 * the case the value chooses among the select's own (see
 * `dynamicValueCaseOf`), else `other`.
 *
 * A name that stands for nothing reads as missing, as validation would have
 * refused it. Undefined when the message shows no values, or does not parse:
 * such a message is formatted as any other.
 */
export const resolveDynamicText = (
  message: string,
  locale: LocaleTag,
  sources: DynamicValueSources,
  formatters: DynamicValueFormatters,
): DynamicText | undefined => {
  if (!message.includes('{')) return undefined;
  const references = referencesIn(message);
  if (references.length === 0) return undefined;

  const resolved = new Map<string, ResolvedDynamicValue>(
    references.map(({ name, parsed }) => [
      name,
      resolveDynamicValue(parsed, sources),
    ]),
  );
  const stateOf = (
    name: string,
    caseKeys: readonly string[],
  ): DynamicValueState => {
    const value = resolved.get(name);
    if (value === undefined || value.missing) return { missing: true };
    const { variable } = value;
    const key = dynamicValueCaseOf(
      value.value,
      variable !== undefined && 'options' in variable ? variable : undefined,
      caseKeys,
    );
    return {
      missing: false,
      ...(key !== undefined && { case: key }),
      ...(typeof value.value === 'number' && { count: value.value }),
    };
  };

  const parts = dynamicMessageParts(message, locale, stateOf).flatMap(
    (part): DynamicTextPart[] => {
      if (typeof part === 'string') return [part];
      const value = resolved.get(part.argument);
      // Validation shows a value only where it is present; one that is
      // missing anyway (a role not on screen) shows nothing.
      if (value === undefined || value.missing) return [];
      return [
        { name: part.argument, text: formatDynamicValue(value, formatters) },
      ];
    },
  );
  return {
    parts,
    text: parts
      .map((part) => (typeof part === 'string' ? part : part.text))
      .join(''),
  };
};

/**
 * Whether any text in `value` (a stage, read as raw protocol data) shows or
 * chooses its wording by a value. A message's other arguments, such as the
 * values the interface gives a Family Pedigree's words, are not values.
 */
export const showsDynamicValues = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return (
      value.includes('{') &&
      referencesIn(value).some(({ parsed }) => parsed !== undefined)
    );
  }
  if (Array.isArray(value)) return value.some(showsDynamicValues);
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(showsDynamicValues);
  }
  return false;
};

// Every ASCII punctuation character, each of which CommonMark lets a
// backslash make literal.
const MARKDOWN_PUNCTUATION = new RegExp(ASCII_PUNCTUATION.source, 'g');

/** A value as markdown that renders as exactly its text. */
const literalMarkdown = (value: string): string =>
  value
    // A value on a line of its own could start a block (a heading, a list,
    // indented code), so its whitespace is collapsed.
    .replace(/\s+/g, ' ')
    .replace(MARKDOWN_PUNCTUATION, '\\$&')
    // The space left at its start could still finish a marker the researcher
    // wrote at the start of a line (`#` or `1.` before the answer ` heading`).
    // A character reference shows the same space but never forms a block.
    .replace(/^ /, '&#32;');

/** A node of the markdown tree, as far as finding what holds a place. */
type TreeNode = Readonly<{
  type: string;
  position?: Readonly<{
    start: Readonly<{ offset?: number }>;
    end: Readonly<{ offset?: number }>;
  }>;
  children?: readonly TreeNode[];
}>;

const holds = (node: TreeNode, offset: number): boolean =>
  (node.position?.start.offset ?? Infinity) <= offset &&
  offset < (node.position?.end.offset ?? -Infinity);

/** The nodes that hold `offset` in the text, outermost first. */
const nodesHolding = (root: TreeNode, offset: number): TreeNode[] => {
  const path: TreeNode[] = [];
  let node: TreeNode | undefined = root;
  while (node !== undefined) {
    path.push(node);
    node = node.children?.find((child) => holds(child, offset));
  }
  return path;
};

/**
 * Where markdown reads what is written at `offset`: in words (`text`), or
 * in something whose characters are not read as markdown (`code`, a code
 * span, raw HTML, an address in angle brackets), with the node that is.
 */
const placeOf = (
  root: TreeNode,
  source: string,
  offset: number,
): Readonly<{ words: boolean; node: TreeNode | undefined }> => {
  const path = nodesHolding(root, offset);
  const verbatim = path.find(
    (node) =>
      node.type === 'code' ||
      node.type === 'inlineCode' ||
      node.type === 'html' ||
      (node.type === 'link' &&
        source.charAt(node.position?.start.offset ?? -1) === '<'),
  );
  if (verbatim !== undefined) return { words: false, node: verbatim };
  const node = path.at(-1);
  return { words: node?.type === 'text', node };
};

const precededByEscape = (text: string, offset: number): boolean =>
  (/\\*$/.exec(text.slice(0, offset))?.[0].length ?? 0) % 2 === 1;

/**
 * Markdown can find a token across the edge of a value: a `<` or `&` in the
 * researcher's words before a value can open an address in angle brackets,
 * HTML or a character reference that the value and the words after it
 * complete (`<https:`, the answer `//evil.example`, then `>`; or `&`, the
 * answer `copy`, then `;`). Which do is read from the text with a marker in
 * each value's place (`probe`), where a marker stands for any value: a `<`
 * or `&` in words that nothing closes before the next value, or a `<` that
 * opens HTML or an address holding a value. Each is escaped, which shows
 * the same character and opens nothing. A `<` or `&` in code or in an
 * address in angle brackets is never changed, since markdown shows those
 * characters as typed.
 */
const openingsBeforeValues = (
  probe: string,
  tree: TreeNode,
  words: readonly Readonly<{ from: number; to: number }>[],
  values: readonly number[],
): Set<number> => {
  const escaped = new Set<number>();
  for (const { from, to } of words) {
    for (let offset = from; offset < to; offset += 1) {
      const character = probe.charAt(offset);
      if (character !== '<' && character !== '&') continue;
      if (precededByEscape(probe, offset)) continue;
      const value = values.find((at) => at > offset);
      if (value === undefined) continue;
      const between = probe.slice(offset + 1, value);
      const { words: inWords, node } = placeOf(tree, probe, offset);
      const opens = inWords
        ? character === '&'
          ? /^#?[\da-z]*$/i.test(between)
          : !between.includes('>') && !/\n[^\S\n]*\n/.test(between)
        : character === '<' &&
          node !== undefined &&
          node.type !== 'code' &&
          node.type !== 'inlineCode' &&
          node.position?.start.offset === offset &&
          holds(node, value);
      if (opens) escaped.add(offset);
    }
  }
  return escaped;
};

// A value before a `]` could also be, or end, a link label that matches one of
// the researcher's reference definitions (`[details][{name}]` and the answer
// `friend`, with `[friend]: https://…` defined). Labels are matched as
// written, so the value's last character, written as a character reference,
// shows the same and matches no definition the researcher wrote. A character
// escaped with a backslash, or a value's marker, already matches none.
const LAST_CHARACTER = /(\S)(\s*)$/u;
// A `]` before the paragraph ends.
const LABEL_END_AFTER = /^(?:(?!\n[^\S\n]*\n)[\s\S])*\]/;

const unmatchableLabelEnd = (markdown: string): string => {
  const found = LAST_CHARACTER.exec(markdown);
  const character = found?.[1];
  const codePoint = character?.codePointAt(0);
  if (
    found === null ||
    character === undefined ||
    codePoint === undefined ||
    character === DYNAMIC_VALUE_MARKER ||
    ASCII_PUNCTUATION.test(character)
  ) {
    return markdown;
  }
  return `${markdown.slice(0, found.index)}&#x${codePoint.toString(16)};${found[2] ?? ''}`;
};

/**
 * Markdown for resolved text: the researcher's words as written, and each
 * value as `valueMarkdown` writes it, kept apart from the words around it so
 * that together they can never form an address in angle brackets, HTML, a
 * character reference or a link label (see `openingsBeforeValues` and
 * `unmatchableLabelEnd`). What is decided is read from the text with a
 * marker in each value's place, so code and addresses in angle brackets,
 * which markdown shows as typed, are never changed. A value written as
 * nothing is left out.
 */
export const joinMarkdownParts = (
  parts: readonly DynamicTextPart[],
  valueMarkdown: (
    part: Exclude<DynamicTextPart, string>,
    index: number,
  ) => string,
): string => {
  const written = parts.map((part, index) =>
    typeof part === 'string' ? part : valueMarkdown(part, index),
  );
  const shown = parts
    .map((part, index) => ({ part, index, markdown: written[index] ?? '' }))
    .filter(
      ({ part, markdown }) => typeof part === 'string' || markdown !== '',
    );

  // The text with a marker in each value's place.
  let probe = '';
  const words: { from: number; to: number }[] = [];
  const values = new Map<number, number>();
  for (const { part, index } of shown) {
    if (typeof part === 'string') {
      words.push({ from: probe.length, to: probe.length + part.length });
      probe += part;
    } else {
      values.set(index, probe.length);
      probe += `${DYNAMIC_VALUE_MARKER}${index}${DYNAMIC_VALUE_MARKER}`;
    }
  }
  const escapes = openingsBeforeValues(probe, markdownTree(probe), words, [
    ...values.values(),
  ]);
  // Offsets count UTF-16 code units, as the parser's do.
  const escapedProbe = probe
    .split('')
    .map((unit, offset) => (escapes.has(offset) ? `\\${unit}` : unit))
    .join('');
  const escapedTree = markdownTree(escapedProbe);
  const shift = (offset: number) =>
    offset + [...escapes].filter((at) => at < offset).length;

  const plain = parts.map((part) =>
    typeof part === 'string' ? part : part.text,
  );
  let joined = '';
  let wordsIndex = 0;
  for (const { part, index, markdown } of shown) {
    if (typeof part === 'string') {
      const { from, to } = words[wordsIndex] ?? { from: 0, to: 0 };
      wordsIndex += 1;
      joined += escapedProbe.slice(shift(from), shift(to));
      continue;
    }
    const at = values.get(index) ?? 0;
    const inWords = placeOf(escapedTree, escapedProbe, shift(at)).words;
    joined +=
      inWords && LABEL_END_AFTER.test(plain.slice(index + 1).join(''))
        ? unmatchableLabelEnd(markdown)
        : markdown;
  }
  return joined;
};

const MARKER = DYNAMIC_VALUE_MARKER;
// The marker as the researcher could write it: the character, or a numeric
// character reference that markdown decodes into it.
const ANY_MARKER = new RegExp(`${MARKER}|&#(?:[xX]0*[eE]000|0*57344);`, 'g');

/**
 * The researcher's words with every marker taken out, so that only the
 * interview's own markers place values.
 */
export const withoutMarkers = (text: string): string =>
  text.replace(ANY_MARKER, '');
/**
 * A marked value's index inside an attribute. Markdown percent-encodes a link
 * destination, so a marker there arrives as its UTF-8 escape.
 */
const MARKED_IN_ATTRIBUTE = new RegExp(
  `(?:${MARKER}|%EE%80%80)(\\d+)(?:${MARKER}|%EE%80%80)`,
  'gi',
);

/**
 * The parts whose value the researcher's markdown would put in an attribute:
 * a link's or image's destination or title. Escaping keeps a value from
 * changing the markdown around it, but a destination unescapes it, so
 * `[details]({name})` with the answer `//evil.example` would be a working
 * link. Found by parsing the markdown with a marker in place of each value,
 * as `DynamicMarkdown` renders it.
 */
const valuesInAttributes = (
  parts: readonly DynamicTextPart[],
): ReadonlySet<number> => {
  const marked = joinMarkdownParts(
    parts.map((part) =>
      typeof part === 'string' ? withoutMarkers(part) : part,
    ),
    (_, index) => `${MARKER}${index}${MARKER}`,
  );
  const indexes = new Set<number>();
  for (const attribute of getMarkdownAttributeValues(marked)) {
    for (const match of attribute.matchAll(MARKED_IN_ATTRIBUTE)) {
      indexes.add(Number(match[1]));
    }
  }
  return indexes;
};

/**
 * Text that renders as markdown, for a consumer that takes a markdown string
 * rather than the parts: the researcher's markdown as written, and each value
 * written so that markdown, HTML or a link in it is shown as typed. Values
 * are not marked out there, and, as in `DynamicMarkdown`, a value that would
 * land in a link's destination or another attribute is left out. Text without
 * values is returned as it is.
 */
export const markdownSource = ({
  text,
  parts,
}: Readonly<{ text: string; parts?: readonly DynamicTextPart[] }>): string => {
  if (parts === undefined) return text;
  const dropped = valuesInAttributes(parts);
  return joinMarkdownParts(parts, (part, index) =>
    dropped.has(index) ? '' : literalMarkdown(part.text),
  );
};

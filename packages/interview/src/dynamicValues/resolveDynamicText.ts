import { getMarkdownAttributeValues } from '@codaco/fresco-ui/RenderMarkdown';
import {
  DYNAMIC_VALUE_MARKER,
  type DynamicValueBinding,
  type DynamicValueRole,
  type DynamicValues,
  type DynamicValueState,
  dynamicMessageParts,
  dynamicValueNamesIn,
  INTRINSIC_DYNAMIC_VALUES,
  type IntrinsicDynamicValue,
  type LocaleTag,
  type LocalizedString,
  parseDynamicValuePath,
  type Variable,
} from '@codaco/protocol-validation';

import type { ContentFormat } from '../localization/contentFormat';
import { readOwnProperty } from '../utils/ownProperty';

/**
 * Everything a stage's text can show at one place in the interview: the
 * stage's bindings, the values the interview itself knows, and the attributes
 * of each entity on screen there, with the codebook variables that describe
 * them. Built by `DynamicValueScope`; a role with no attributes is not on
 * screen, so a value about it reads as missing.
 */
export type DynamicValueSources = Readonly<{
  bindings: DynamicValues;
  intrinsics: Readonly<Record<IntrinsicDynamicValue, unknown>>;
  attributes: Readonly<
    Partial<Record<DynamicValueRole, Readonly<Record<string, unknown>>>>
  >;
  variablesFor: (
    role: DynamicValueRole,
  ) => Readonly<Record<string, Variable>> | undefined;
}>;

/**
 * A value as one message reads it: missing, or present with the case and
 * number that choose its versions, and the raw value with what it is, for
 * formatting.
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
      case?: string;
      count?: number;
    }>;

/** Null, undefined, empty text and an empty list are missing; 0 and false are not. */
const isMissing = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === '' ||
  (typeof value === 'number' && Number.isNaN(value)) ||
  (Array.isArray(value) && value.length === 0);

const caseOf = (
  binding: DynamicValueBinding,
  value: unknown,
): string | undefined =>
  Object.entries(binding.cases ?? {}).find(([, option]) =>
    Array.isArray(value) ? value.includes(option) : value === option,
  )?.[0];

const resolveDynamicValue = (
  binding: DynamicValueBinding,
  sources: DynamicValueSources,
): ResolvedDynamicValue => {
  const parsed = parseDynamicValuePath(binding.path);
  if (parsed === undefined) return { missing: true };
  if (parsed.kind === 'intrinsic') {
    const value = sources.intrinsics[parsed.name];
    return isMissing(value)
      ? { missing: true }
      : { missing: false, value, intrinsic: parsed.name };
  }
  // Attribute ids come from the protocol and may name a member every object
  // inherits (`constructor`, `__proto__`), so only an own value counts.
  const attributes = sources.attributes[parsed.role];
  const value =
    attributes === undefined
      ? undefined
      : readOwnProperty(attributes, parsed.variableId);
  if (isMissing(value)) return { missing: true };
  const variables = sources.variablesFor(parsed.role);
  const variable =
    variables === undefined
      ? undefined
      : readOwnProperty(variables, parsed.variableId);
  const matched = caseOf(binding, value);
  return {
    missing: false,
    value,
    ...(variable !== undefined && { variable }),
    ...(matched !== undefined && { case: matched }),
    ...(typeof value === 'number' && { count: value }),
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
 * A date as the participant's language writes it. A date picker stores a day
 * (`2024-03-05`), a month (`2024-03`) or a year (`2024`), which are calendar
 * dates rather than instants, so they are formatted in UTC and never shift a
 * day with the participant's time zone. Anything else is read as an instant.
 */
const formatDate = (value: unknown, locale: string): string => {
  if (typeof value === 'string') {
    const match = DATE_ONLY.exec(value);
    if (match) {
      const [, year, month, day] = match;
      // Date.UTC reads years 0-99 as 1900-1999; setUTCFullYear takes the
      // year as written.
      const date = new Date(0);
      date.setUTCFullYear(
        Number(year),
        Number(month ?? 1) - 1,
        Number(day ?? 1),
      );
      return dateFormat(locale, {
        timeZone: 'UTC',
        year: 'numeric',
        ...(month !== undefined && { month: 'long' }),
        ...(day !== undefined && { day: 'numeric' }),
      }).format(date);
    }
  }
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
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
  const option = variable.options?.find(
    (candidate) => candidate.value === value,
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
 * binding name it stands for and its text.
 */
export type DynamicTextPart = string | Readonly<{ name: string; text: string }>;

export type DynamicText = Readonly<{
  parts: readonly DynamicTextPart[];
  /** The natural sentence, values and all. */
  text: string;
}>;

const namesByMessage = new Map<string, readonly string[]>();
const namesIn = (message: string): readonly string[] => {
  let names = namesByMessage.get(message);
  if (names === undefined) {
    names = dynamicValueNamesIn(message);
    namesByMessage.set(message, names);
  }
  return names;
};

/**
 * The version of `message` (written in `locale`) that the values at this
 * place read, with each value it shows formatted. Selects and plurals on a
 * value are decided here, so a participant's value never reaches ICU
 * matching: a select takes `missing` for a missing value, else its case, else
 * `other`.
 *
 * Undefined when the message shows none of the stage's values, or names one
 * the stage does not bind: such a message is formatted as any other.
 */
export const resolveDynamicText = (
  message: string,
  locale: LocaleTag,
  sources: DynamicValueSources,
  formatters: DynamicValueFormatters,
): DynamicText | undefined => {
  if (!message.includes('{')) return undefined;
  if (Object.keys(sources.bindings).length === 0) return undefined;
  const names = namesIn(message);
  if (
    names.length === 0 ||
    names.some((name) => !Object.hasOwn(sources.bindings, name))
  ) {
    return undefined;
  }

  const resolved = new Map<string, ResolvedDynamicValue>();
  for (const name of names) {
    const binding = sources.bindings[name];
    if (binding !== undefined) {
      resolved.set(name, resolveDynamicValue(binding, sources));
    }
  }
  const stateOf = (name: string): DynamicValueState => {
    const value = resolved.get(name);
    if (value === undefined || value.missing) return { missing: true };
    return {
      missing: false,
      ...(value.case !== undefined && { case: value.case }),
      ...(value.count !== undefined && { count: value.count }),
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

// Every ASCII punctuation character, each of which CommonMark lets a
// backslash make literal.
const MARKDOWN_PUNCTUATION = /[!-/:-@[-`{-~]/g;

// GFM turns a bare `www.`, `http://` or email address into a link after
// parsing, escapes or not. An invisible word joiner after `www`, a colon or
// an `@` keeps each from matching without changing what is shown.
const WORD_JOINER = '\u2060';
const AUTOLINK_TRIGGERS = /www(?=\.)|[:@]/gi;

/** A value as markdown that renders as exactly its text. */
const literalMarkdown = (value: string): string =>
  value
    // A value on a line of its own could start a block (a heading, a list,
    // indented code), so its whitespace is collapsed.
    .replace(/\s+/g, ' ')
    .replace(AUTOLINK_TRIGGERS, `$&${WORD_JOINER}`)
    .replace(MARKDOWN_PUNCTUATION, '\\$&');

// Markdown can also find a token across the edge of a value: a bare link
// (`https:` in the researcher's words and `//evil.example` in a participant's
// answer, or the answer `ada` before `@example.com`), an entity (`&`, the
// answer `copy`, then `;`) or an HTML tag (`<`, the answer `em`, then `>`).
// An empty HTML comment, which renders as nothing, ends the run of text such a token is found in. It goes only
// where the words around a value could make one, so elsewhere nothing comes
// between a value and the markdown around it.
const VALUE_BOUNDARY = '<!---->';
const TOKEN_TRIGGER = /www\\?\.|[:@&<]/i;
const RUN_BEFORE = /\S*$/;
const RUN_AFTER = /^\S*/;

/**
 * Markdown for resolved text: the researcher's words as written, and each
 * value as `valueMarkdown` writes it, kept apart from the words around it so
 * that together they can never form a bare link, entity or tag. A value written as nothing
 * is left out.
 */
export const joinMarkdownParts = (
  parts: readonly DynamicTextPart[],
  valueMarkdown: (
    part: Exclude<DynamicTextPart, string>,
    index: number,
  ) => string,
): string => {
  const plain = parts.map((part) =>
    typeof part === 'string' ? part : part.text,
  );
  return parts
    .map((part, index) => {
      if (typeof part === 'string') return part;
      const markdown = valueMarkdown(part, index);
      if (markdown === '') return '';
      const before = RUN_BEFORE.exec(plain.slice(0, index).join(''))?.[0] ?? '';
      const after = RUN_AFTER.exec(plain.slice(index + 1).join(''))?.[0] ?? '';
      if (!TOKEN_TRIGGER.test(`${before}${part.text}${after}`)) return markdown;
      const open = before !== '' && /^\S/.test(part.text);
      const close = after !== '' && /\S$/.test(part.text);
      return `${open ? VALUE_BOUNDARY : ''}${markdown}${close ? VALUE_BOUNDARY : ''}`;
    })
    .join('');
};

const MARKER = DYNAMIC_VALUE_MARKER;
const ANY_MARKER = new RegExp(MARKER, 'g');
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
      typeof part === 'string' ? part.replace(ANY_MARKER, '') : part,
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

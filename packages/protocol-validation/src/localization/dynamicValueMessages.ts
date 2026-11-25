import {
  type MessageFormatElement,
  parse,
  type ParserOptions,
  TYPE,
} from '@formatjs/icu-messageformat-parser';

import { holdsLineBreak } from '@codaco/shared-consts';

import { isBlankText } from './blankText.ts';
import type { LocaleTag } from './localeTag.ts';
import { versionLineMarkdown } from './markdownText.ts';
import { markdownTree } from './markdownTree.ts';
import type { MessagePart } from './messageArguments.ts';

/**
 * A value from the interview that a stage's text may show (see
 * `schemas/9/dynamic-values.ts`), as the message checker sees it:
 * - `description`, how the problems that concern it name it;
 * - `cases`, the keys a select on the value may name besides `missing` and
 *   `other` (the option or yes/no cases the text gives a version for);
 * - `numeric`, whether a plural may choose a version by it;
 * - `optional`, whether it can be missing where the text is shown. Such a
 *   value is shown only inside a version of a select on it that is for when
 *   it has a value, and that select has a `missing` version;
 * - `unshowable`, why the text cannot show the value itself, though it may
 *   still choose versions by it (a yes/no attribute with no labels for its
 *   answers), or undefined when it can.
 */
export type DynamicValueArgument = Readonly<{
  /**
   * The value as a researcher knows it, for the problems that concern it:
   * `the "Age" attribute of the participant`, `today’s date`, `an If block`.
   * Never the name the message uses for it.
   */
  description: string;
  cases: readonly string[];
  numeric: boolean;
  optional: boolean;
  /**
   * Every value present chooses one of `cases`, as when they cover each
   * answer of a yes/no or option attribute, so its `other` is never read.
   */
  exhaustive?: boolean;
  /**
   * The value can be several of `cases` at once, as a categorical answer can
   * hold several options. Each select then chooses, of the cases it gives a
   * version for, the first in the order of `cases` that the value is, so
   * two selects on the value may choose different versions.
   */
  multiple?: boolean;
  unshowable?: string;
}>;

/** The values a site's text may show, by argument name. */
export type DynamicValueArguments = Readonly<
  Record<string, DynamicValueArgument>
>;

/**
 * The select case for a value that is missing: `null`, `undefined`, an empty
 * string or an empty array. Zero and `false` are values.
 */
export const MISSING_CASE = 'missing';

/**
 * The character the interview puts where a value goes before it renders a
 * message's markdown, so that the value is inserted as text afterwards and can
 * never become markdown or HTML. Authored text cannot contain it.
 */
export const DYNAMIC_VALUE_MARKER = '';

// The same parse as every other protocol message check: tags stay text.
const PARSE_OPTIONS: ParserOptions = { ignoreTag: true };

const PLURAL_CATEGORIES: ReadonlySet<string> = new Set([
  'zero',
  'one',
  'two',
  'few',
  'many',
  'other',
]);

// A message is read far more often than it changes: the interview reads a
// node type's label once for every node it draws, each time one changes. The
// elements are only ever read, so one parse serves every reader. Bounded, so
// that an editor producing a new message with each keystroke cannot grow it
// without limit.
const PARSED_MESSAGES_KEPT = 500;
const parsedMessages = new Map<string, MessageFormatElement[] | string>();

const parseMessage = (message: string): MessageFormatElement[] | string => {
  const known = parsedMessages.get(message);
  if (known !== undefined) return known;
  let parsed: MessageFormatElement[] | string;
  try {
    parsed = parse(message, PARSE_OPTIONS);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    parsed = `Text is not valid message syntax (${error.message}).`;
  }
  if (parsedMessages.size >= PARSED_MESSAGES_KEPT) {
    const oldest = parsedMessages.keys().next();
    if (!oldest.done) parsedMessages.delete(oldest.value);
  }
  parsedMessages.set(message, parsed);
  return parsed;
};

/**
 * What one value is, as far as choosing a version goes: missing, or present
 * with the plural category that chooses for it and what the versions chosen
 * so far prove about its cases: the ones it is (`is`), and the ones it is not
 * (`isNot`).
 */
type ChoiceState = Readonly<
  | { missing: true }
  | {
      missing: false;
      category: string;
      is: ReadonlySet<string>;
      isNot: ReadonlySet<string>;
    }
>;

/**
 * How a value chooses between the versions of a select, by name:
 * - `answers`: `one` case at most; `several`, each select choosing the first
 *   of its cases in the order of `cases`; or `unknown`, judged without the
 *   stage, where a select may choose any case not yet ruled out;
 * - `cases`: the value's cases, in the order that chooses between them;
 * - `exhaustive`: a present value is at least one of `cases`.
 */
type ChoiceRule = Readonly<{
  answers: 'one' | 'several' | 'unknown';
  cases: readonly string[];
  exhaustive: boolean;
}>;

/** The states each value may be in, and how it chooses, by name. */
type ChoiceStates = ReadonlyMap<
  string,
  Readonly<{ states: readonly ChoiceState[]; rule: ChoiceRule }>
>;

const UNKNOWN_RULE: ChoiceRule = {
  answers: 'unknown',
  cases: [],
  exhaustive: false,
};

const optionFor = (
  options: Readonly<Record<string, { value: MessageFormatElement[] }>>,
  key: string | undefined,
) =>
  (key !== undefined && Object.hasOwn(options, key)
    ? options[key]
    : undefined) ?? options.other;

/**
 * The versions a select on a value in `state` may read, each with the state
 * that reading it proves the value is in. The interview chooses for each
 * select by itself (`dynamicValueCaseOf`), so a value that can be several
 * cases at once may read a version of one case here and of another case in a
 * select inside it.
 */
const selectReadings = (
  node: Readonly<{
    options: Record<string, { value: MessageFormatElement[] }>;
  }>,
  state: ChoiceState,
  rule: ChoiceRule,
): readonly (readonly [key: string, next: ChoiceState])[] => {
  if (state.missing) return [[MISSING_CASE, state]];
  const given = Object.keys(node.options).filter(
    (key) => key !== MISSING_CASE && key !== 'other',
  );
  const keys =
    rule.answers === 'several'
      ? rule.cases.filter((key) => given.includes(key))
      : given;
  const readings: (readonly [string, ChoiceState])[] = [];
  keys.forEach((key, index) => {
    const before = rule.answers === 'several' ? keys.slice(0, index) : [];
    const possible =
      !state.isNot.has(key) &&
      before.every((earlier) => !state.is.has(earlier)) &&
      (rule.answers !== 'one' || [...state.is].every((known) => known === key));
    if (possible) {
      readings.push([
        key,
        {
          ...state,
          is: new Set([...state.is, key]),
          isNot: new Set([...state.isNot, ...before]),
        },
      ]);
    }
  });
  const isNot = new Set([...state.isNot, ...keys]);
  if (
    keys.every((key) => !state.is.has(key)) &&
    !(
      rule.exhaustive &&
      rule.cases.length > 0 &&
      rule.cases.every((key) => isNot.has(key))
    )
  ) {
    readings.push(['other', { ...state, isNot }]);
  }
  return readings;
};

/** Whether the value `name` may have a value in `states`. */
const mayBePresent = (states: ChoiceStates, name: string) =>
  (states.get(name)?.states ?? []).some((state) => !state.missing);

/**
 * Whether some version of `nodes` that values in `states` reach shows
 * anything: visible text, a value or a count. Text shows when any one of its
 * pieces does, and pieces on different values do not constrain each other,
 * so each version of a choice is read under only the states that choose it,
 * narrowed by what choosing it proves. Choices on one value therefore agree
 * (text only in a present version inside a missing one shows nothing, nor
 * text only in a version of a case inside one that rules the case out), and
 * the check never enumerates combinations of values.
 */
const anyVersionShows = (
  nodes: readonly MessageFormatElement[],
  states: ChoiceStates,
  plural: string | undefined,
): boolean =>
  nodes.some((node) => {
    switch (node.type) {
      case TYPE.literal:
        return !isBlankText(node.value);
      case TYPE.argument:
        return mayBePresent(states, node.value);
      case TYPE.pound:
        return plural === undefined || mayBePresent(states, plural);
      case TYPE.select:
      case TYPE.plural: {
        const name = node.value;
        const value = states.get(name);
        const rule = value?.rule ?? UNKNOWN_RULE;
        const readings = (value?.states ?? []).flatMap((state) =>
          node.type === TYPE.plural
            ? [[state.missing ? 'other' : state.category, state] as const]
            : selectReadings(node, state, rule),
        );
        return Object.values(node.options).some((option) => {
          const choosing = readings.flatMap(([key, next]) =>
            optionFor(node.options, key) === option ? [next] : [],
          );
          if (choosing.length === 0) return false;
          const inner = new Map(states);
          inner.set(name, { states: choosing, rule });
          return anyVersionShows(
            option.value,
            inner,
            node.type === TYPE.plural ? name : plural,
          );
        });
      }
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
      case TYPE.tag:
      default:
        return true;
    }
  });

/**
 * The states a value may start in: missing, when it is `optional`, and
 * present in each of `categories`, with nothing yet proved about its cases.
 */
const choiceStates = (
  categories: Iterable<string>,
  optional: boolean,
): readonly ChoiceState[] => [
  ...(optional ? [{ missing: true } as const] : []),
  ...[...new Set(categories)].map((category) => ({
    missing: false as const,
    category,
    is: new Set<string>(),
    isNot: new Set<string>(),
  })),
];

/**
 * The states each value `elements` uses may be in, judged without the stage:
 * possibly missing, and present in each plural category the text names. A
 * select may choose any case it gives that the versions around it do not rule
 * out, as a value that can be several cases at once may. The check errs
 * towards accepting.
 */
const statesNamedIn = (
  elements: readonly MessageFormatElement[],
): ChoiceStates => {
  const categories = new Map<string, Set<string>>();
  const collect = (nodes: readonly MessageFormatElement[]) => {
    for (const node of nodes) {
      if (
        node.type === TYPE.argument ||
        node.type === TYPE.select ||
        node.type === TYPE.plural
      ) {
        const counted =
          categories.get(node.value) ?? new Set<string>(['other']);
        categories.set(node.value, counted);
        if (node.type === TYPE.plural) {
          for (const key of Object.keys(node.options)) counted.add(key);
        }
      }
      for (const version of versionsOf(node)) collect(version);
    }
  };
  collect(elements);
  return new Map(
    [...categories].map(([name, counted]) => [
      name,
      { states: choiceStates(counted, true), rule: UNKNOWN_RULE },
    ]),
  );
};

/** The versions a node chooses between: none, unless it is a choice. */
const versionsOf = (
  node: MessageFormatElement,
): readonly (readonly MessageFormatElement[])[] =>
  node.type === TYPE.select || node.type === TYPE.plural
    ? Object.values(node.options).map((option) => option.value)
    : [];

const hasChoice = (elements: readonly MessageFormatElement[]): boolean =>
  elements.some(
    (node) => node.type === TYPE.select || node.type === TYPE.plural,
  );

const BLANK_PROBLEM =
  'Text cannot be blank in every version: at least one of its versions must show some text or a value.';

const MARKER_PROBLEM =
  'Text cannot contain the private-use character U+E000: the interview uses it to place values.';

/**
 * Whether some version holds a line break. A version of a piece of text is
 * part of one line; text outside any version may run over several lines.
 */
const versionHoldsLineBreak = (
  nodes: readonly MessageFormatElement[],
  inVersion = false,
): boolean =>
  nodes.some((node) =>
    node.type === TYPE.literal
      ? inVersion && holdsLineBreak(node.value)
      : versionsOf(node).some((version) =>
          versionHoldsLineBreak(version, true),
        ),
  );

type MarkdownTree = ReturnType<typeof markdownTree>;
type MarkdownNode = MarkdownTree | MarkdownTree['children'][number];

const linkAddressHoldsValue = (node: MarkdownNode): boolean => {
  if (
    node.type === 'link' &&
    `${node.url}${node.title ?? ''}`.includes(DYNAMIC_VALUE_MARKER)
  ) {
    return true;
  }
  return 'children' in node && node.children.some(linkAddressHoldsValue);
};

/**
 * Whether a link's address or title holds a value or a choice of versions:
 * both are fixed text. The text and each of its versions is read as markdown
 * of its own (`markdownTree`), a version as it reads inside the line it sits
 * in (`versionLineMarkdown`).
 */
const linkHoldsValue = (
  nodes: readonly MessageFormatElement[],
  inVersion = false,
): boolean => {
  const markdown = nodes
    .map((node) =>
      node.type === TYPE.literal ? node.value : DYNAMIC_VALUE_MARKER,
    )
    .join('');
  return (
    (markdown.includes(DYNAMIC_VALUE_MARKER) &&
      linkAddressHoldsValue(
        markdownTree(inVersion ? versionLineMarkdown(markdown) : markdown),
      )) ||
    nodes.some((node) =>
      versionsOf(node).some((version) => linkHoldsValue(version, true)),
    )
  );
};

/**
 * Why `message` cannot be formatted text that may show dynamic values, or
 * undefined when it can. These are the texts the editor cannot hold, so a
 * protocol that passes holds none of them. Meant for messages
 * `findDynamicMessageSyntaxProblem` accepts.
 */
export const findFormattedMessageProblem = (
  message: string,
): string | undefined => {
  const elements = parseMessage(message);
  if (typeof elements === 'string') return undefined;
  if (versionHoldsLineBreak(elements)) {
    return 'A version of this text cannot contain a line break. Put the line break outside the versions.';
  }
  if (linkHoldsValue(elements)) {
    return 'A link address cannot contain a value. Put the value in the words of the link, or outside the link.';
  }
  return undefined;
};

/**
 * Why `message` cannot be the text of a site that may show dynamic values,
 * judged without knowing which values the site offers, or undefined when it
 * may be: it parses, holds no number, date or time formatting, no marker
 * character, and shows something in at least one version. Which values it shows, and how, is `findDynamicValueProblem`'s
 * to judge, against the stage.
 */
export const findDynamicMessageSyntaxProblem = (
  message: string,
): string | undefined => {
  if (message.includes(DYNAMIC_VALUE_MARKER)) return MARKER_PROBLEM;
  const elements = parseMessage(message);
  if (typeof elements === 'string') return elements;
  const visit = (
    nodes: readonly MessageFormatElement[],
  ): string | undefined => {
    for (const node of nodes) {
      if (node.type === TYPE.select || node.type === TYPE.plural) {
        for (const version of versionsOf(node)) {
          const problem = visit(version);
          if (problem !== undefined) return problem;
        }
      } else if (
        node.type !== TYPE.literal &&
        node.type !== TYPE.argument &&
        node.type !== TYPE.pound
      ) {
        return 'This text cannot format numbers, dates or times, or contain tags.';
      }
    }
    return undefined;
  };
  const problem = visit(elements);
  if (problem !== undefined) return problem;
  // One version may be blank (nothing to add when a value is missing), but
  // text that shows nothing in every version is blank text written as a
  // choice. Text without a choice is the field's own blank check's to judge.
  if (
    hasChoice(elements) &&
    !anyVersionShows(elements, statesNamedIn(elements), undefined)
  ) {
    return BLANK_PROBLEM;
  }
  return undefined;
};

/**
 * What a site's text may do with each name it uses: the argument the name
 * stands for, or, for a name the text cannot use there, the problem to
 * report, as a sentence that names the value as a researcher knows it.
 */
export type DynamicValueLookup = (
  name: string,
) => DynamicValueArgument | string;

/** `description` with its first letter in capitals, to start a sentence. */
const atSentenceStart = (description: string): string =>
  description.charAt(0).toUpperCase() + description.slice(1);

const unguarded = (value: DynamicValueArgument): string =>
  `${atSentenceStart(value.description)} can be missing, so the text needs a version for when it is missing, and can show it only in its other versions.`;

const findElementsProblem = (
  elements: readonly MessageFormatElement[],
  argumentOf: DynamicValueLookup,
  guarded: ReadonlySet<string>,
): string | undefined => {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.literal:
      case TYPE.pound:
        break;
      case TYPE.argument: {
        const value = argumentOf(element.value);
        if (typeof value === 'string') return value;
        if (value.unshowable !== undefined) {
          return `${atSentenceStart(value.description)} cannot be shown as words. ${atSentenceStart(value.unshowable)}`;
        }
        if (value.optional && !guarded.has(element.value)) {
          return unguarded(value);
        }
        break;
      }
      case TYPE.select: {
        const name = element.value;
        const value = argumentOf(name);
        if (typeof value === 'string') return value;
        const hasMissing = MISSING_CASE in element.options;
        for (const [key, option] of Object.entries(element.options)) {
          if (
            key !== 'other' &&
            key !== MISSING_CASE &&
            !value.cases.includes(key)
          ) {
            return `This text has a version that ${value.description} can never choose.`;
          }
          // A case version is read only when the value is that case, so it
          // has a value; `other` only once `missing` has taken the rest. A
          // version never takes away what an outer select already proved:
          // inside one for when the value is present, an inner `missing`
          // version is never read, and an inner `other` still has it.
          const present =
            key !== MISSING_CASE &&
            (key !== 'other' || hasMissing || !value.optional);
          const inner = new Set(guarded);
          if (present) inner.add(name);
          const problem = findElementsProblem(option.value, argumentOf, inner);
          if (problem !== undefined) return problem;
        }
        break;
      }
      case TYPE.plural: {
        const name = element.value;
        const value = argumentOf(name);
        if (typeof value === 'string') return value;
        if (!value.numeric || element.pluralType !== 'cardinal') {
          return `${atSentenceStart(value.description)} is not a number, so it cannot choose a version of the text by number.`;
        }
        if (element.offset !== 0) {
          return `The singular and plural versions for ${value.description} cannot use an offset.`;
        }
        if (value.optional && !guarded.has(name)) return unguarded(value);
        for (const [key, option] of Object.entries(element.options)) {
          if (!PLURAL_CATEGORIES.has(key)) {
            return `"${key}" is not a plural category. Use "zero", "one", "two", "few", "many" or "other".`;
          }
          const problem = findElementsProblem(
            option.value,
            argumentOf,
            guarded,
          );
          if (problem !== undefined) return problem;
        }
        break;
      }
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
      case TYPE.tag:
      default:
        return 'This text cannot format numbers, dates or times, or contain tags.';
    }
  }
  return undefined;
};

/**
 * Why `message`, written in `locale`, cannot be the text of a site whose
 * values `argumentOf` gives, or undefined when it can. One pass checks that
 * it parses, contains no marker, uses only names the site can show (else it
 * reports the problem `argumentOf` gives for the first one that it cannot),
 * chooses versions only by a value's presence (`missing`), its cases or, for
 * a number, its plural category, and shows a value that can be missing only
 * inside a version for when it has one. Then it checks that some version the
 * values can reach shows something: only a value that can be missing reads
 * `missing`, only the value's cases are chosen, and only the plural
 * categories `locale` gives some number.
 */
export const findDynamicValueProblem = (
  message: string,
  argumentOf: DynamicValueLookup,
  locale: LocaleTag,
): string | undefined => {
  const syntax = findDynamicMessageSyntaxProblem(message);
  if (syntax !== undefined) return syntax;
  const elements = parseMessage(message);
  if (typeof elements === 'string') return elements;
  const problem = findElementsProblem(elements, argumentOf, new Set());
  if (problem !== undefined) return problem;
  if (!hasChoice(elements)) return undefined;
  const categories = reachableCategories(locale);
  // Every name the message uses has an argument here: the walk above
  // reported any that does not.
  const states: ChoiceStates = new Map(
    dynamicValueNamesIn(message).flatMap((name) => {
      const value = argumentOf(name);
      return typeof value === 'string'
        ? []
        : [
            [
              name,
              {
                states: choiceStates(
                  value.numeric ? categories : ['other'],
                  value.optional,
                ),
                rule: {
                  answers: value.multiple === true ? 'several' : 'one',
                  cases: value.cases,
                  exhaustive: value.exhaustive === true,
                },
              },
            ],
          ];
    }),
  );
  return anyVersionShows(elements, states, undefined)
    ? undefined
    : BLANK_PROBLEM;
};

/** The value names a message uses anywhere, shown or chosen by. */
export const dynamicValueNamesIn = (message: string): readonly string[] => {
  const elements = parseMessage(message);
  if (typeof elements === 'string') return [];
  const names = new Set<string>();
  const visit = (nodes: readonly MessageFormatElement[]) => {
    for (const node of nodes) {
      if (node.type === TYPE.argument) names.add(node.value);
      if (node.type === TYPE.select || node.type === TYPE.plural) {
        names.add(node.value);
        for (const version of versionsOf(node)) visit(version);
      }
    }
  };
  visit(elements);
  return [...names];
};

/**
 * The case keys a message gives a version for in its selects on each name,
 * besides `missing` and `other`, in the order it first gives them. A message
 * that does not parse gives none.
 */
export const dynamicValueCaseKeysIn = (
  message: string,
): ReadonlyMap<string, readonly string[]> => {
  const keys = new Map<string, string[]>();
  const elements = parseMessage(message);
  if (typeof elements === 'string') return keys;
  const visit = (nodes: readonly MessageFormatElement[]) => {
    for (const node of nodes) {
      if (node.type === TYPE.select) {
        const own = keys.get(node.value) ?? [];
        for (const key of Object.keys(node.options)) {
          if (key !== MISSING_CASE && key !== 'other' && !own.includes(key)) {
            own.push(key);
          }
        }
        keys.set(node.value, own);
      }
      for (const version of versionsOf(node)) visit(version);
    }
  };
  visit(elements);
  return keys;
};

/**
 * What a value is at one moment, as far as choosing a version goes: missing,
 * or present, with the select case it matches and the number it is, when it
 * has either.
 */
export type DynamicValueState =
  | Readonly<{ missing: true }>
  | Readonly<{ missing: false; case?: string; count?: number }>;

/**
 * The state of the value `name` stands for, as the select or plural being
 * read sees it: `caseKeys` are the cases that select gives a version for
 * (none for a plural), so a value that can match several cases (a
 * categorical answer of several options) chooses one this select has.
 */
export type DynamicValueStateOf = (
  name: string,
  caseKeys: readonly string[],
) => DynamicValueState;

const pushText = (parts: MessagePart[], text: string) => {
  const last = parts.at(-1);
  if (typeof last === 'string') parts[parts.length - 1] = last + text;
  else if (text !== '') parts.push(text);
};

// The most fraction digits `Intl.PluralRules` accepts.
const MAX_FRACTION_DIGITS = 100;

/**
 * How many fraction digits `count` has when written as its shortest decimal
 * text, which is how the interview shows a number: 1.0001 has four, 1 none.
 */
const fractionDigitsOf = (count: number): number => {
  const [mantissa = '', exponent = '0'] = String(Math.abs(count)).split('e');
  const fraction = mantissa.split('.')[1] ?? '';
  return Math.min(
    MAX_FRACTION_DIGITS,
    Math.max(0, fraction.length - Number(exponent)),
  );
};

const pluralRules = new Map<string, Intl.PluralRules>();
/**
 * The plural category `locale` gives `count` as the interview shows it.
 * `Intl.PluralRules` otherwise rounds to three fraction digits, so 1.0001
 * would be English `one` while shown as "1.0001"; with exactly the digits
 * shown, rules that read fraction digits read the ones the participant sees.
 */
const pluralCategoryOf = (locale: LocaleTag, count: number): string => {
  const digits = Number.isFinite(count) ? fractionDigitsOf(count) : 0;
  const key = `${locale} ${digits}`;
  let rules = pluralRules.get(key);
  if (rules === undefined) {
    const options: Intl.PluralRulesOptions = {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    };
    try {
      rules = new Intl.PluralRules(locale, options);
    } catch {
      rules = new Intl.PluralRules('en', options);
    }
    pluralRules.set(key, rules);
  }
  return rules.select(selectableCount(count));
};

// Plural rules read at most an integer's last six digits (`i % 1000000`),
// so a stand-in that keeps its last seven and is still large chooses alike.
const LARGE_STAND_IN = 10_000_000;

// An integer's digits as the participant sees them. A double's exact binary
// value can end in other digits (10^20 + 10^4 is shown ending 20000 but is
// exactly …16384).
const WHOLE_DIGITS = new Intl.NumberFormat('en', {
  useGrouping: false,
  maximumFractionDigits: 0,
});

/**
 * A number `Intl.PluralRules` chooses the same version for as `count` shown
 * in full. A nonzero number too small to keep a digit would read as zero
 * (Arabic `zero`), so it is chosen as the smallest number that keeps one. An
 * integer too large for a safe integer loses digits there (French chooses
 * `one` for 10^20, shown as a whole multiple of a million and so `many`), so
 * it is chosen by the last digits it is shown with.
 */
const selectableCount = (count: number): number => {
  const size = Math.abs(count);
  if (count !== 0 && size < 10 ** -MAX_FRACTION_DIGITS) {
    return Math.sign(count) * 10 ** -MAX_FRACTION_DIGITS;
  }
  if (Number.isFinite(count) && size > Number.MAX_SAFE_INTEGER) {
    const lastDigits = Number(
      BigInt(WHOLE_DIGITS.format(size)) % BigInt(LARGE_STAND_IN),
    );
    return Math.sign(count) * (LARGE_STAND_IN + lastDigits);
  }
  return count;
};

const flatten = (
  elements: readonly MessageFormatElement[],
  locale: LocaleTag,
  stateOf: DynamicValueStateOf,
  plural: string | undefined,
  parts: MessagePart[],
) => {
  for (const element of elements) {
    if (element.type === TYPE.literal) pushText(parts, element.value);
    else if (element.type === TYPE.argument) {
      parts.push({ argument: element.value });
    } else if (element.type === TYPE.pound) {
      if (plural === undefined) pushText(parts, '#');
      else parts.push({ argument: plural });
    } else if (element.type === TYPE.select) {
      const state = stateOf(
        element.value,
        Object.keys(element.options).filter(
          (key) => key !== MISSING_CASE && key !== 'other',
        ),
      );
      const key = state.missing ? MISSING_CASE : state.case;
      const option =
        (key !== undefined && Object.hasOwn(element.options, key)
          ? element.options[key]
          : undefined) ?? element.options.other;
      if (option !== undefined) {
        flatten(option.value, locale, stateOf, plural, parts);
      }
    } else if (element.type === TYPE.plural) {
      const state = stateOf(element.value, []);
      const count =
        !state.missing && state.count !== undefined ? state.count : undefined;
      // An exact arm ("=0") is chosen before the count's category, as ICU
      // chooses it.
      const exact = count === undefined ? undefined : `=${count}`;
      const category =
        count === undefined ? 'other' : pluralCategoryOf(locale, count);
      const own =
        exact !== undefined && Object.hasOwn(element.options, exact)
          ? element.options[exact]
          : Object.hasOwn(element.options, category)
            ? element.options[category]
            : undefined;
      const option = own ?? element.options.other;
      if (option !== undefined) {
        flatten(option.value, locale, stateOf, element.value, parts);
      }
    }
  }
};

/**
 * The version of `message`, written in `locale`, that values in the given
 * states read: its text, and where each value it shows goes. A select on a
 * value takes `missing` when the value is missing, else the version for the
 * case `stateOf` gives it for that select, else `other`; a plural takes its count's category in `locale`. `#`
 * inside a plural is that plural's value. The interview fills the values in;
 * nothing here formats them. A message that does not parse reads as itself.
 */
export const dynamicMessageParts = (
  message: string,
  locale: LocaleTag,
  stateOf: DynamicValueStateOf,
): readonly MessagePart[] => {
  const elements = parseMessage(message);
  if (typeof elements === 'string') return [message];
  const parts: MessagePart[] = [];
  flatten(elements, locale, stateOf, undefined, parts);
  return parts;
};

// Numbers to try: whole numbers to 1,000 and a few millions to billions
// (where some languages' `many` begins), then decimals with one, two and
// three fraction digits, since some rules read later digits (Bosnian `few`
// holds 0.02), then the negatives of all of these: a number answer can be
// negative. Simplest first, so each version is named by its plainest count.
const SAMPLE_COUNTS: readonly number[] = (() => {
  const whole = [
    ...Array.from({ length: 1001 }, (_, count) => count),
    ...[6, 7, 8, 9].flatMap((power) =>
      [1, 2, 3].map((multiple) => multiple * 10 ** power),
    ),
  ];
  const decimals = [10, 100, 1000].flatMap((scale) =>
    Array.from({ length: 3 * scale }, (_, step) => step / scale),
  );
  const positive = [...new Set([...whole, ...decimals])];
  return [
    ...positive,
    ...positive.filter((count) => count > 0).map((count) => -count),
  ];
})();

// How many numbers name each category.
const VALUE_EXAMPLES_KEPT = 4;

const valueExamplesByLocale = new Map<
  string,
  ReadonlyMap<string, readonly number[]>
>();

/**
 * The plural categories some number a value can hold selects in `locale`, in
 * CLDR order, each with the first few numbers that select it, plainest first.
 * Unlike `pluralCountExamples`, which counts whole things, this reaches the
 * categories only a fraction selects, such as Czech `many` or Russian
 * `other`: a number answer can hold a fraction, and the check below asks for
 * a version for each of those categories too.
 */
export const pluralValueExamples = (
  locale: LocaleTag,
): ReadonlyMap<string, readonly number[]> => {
  const cached = valueExamplesByLocale.get(locale);
  if (cached !== undefined) return cached;
  const found = new Map<string, number[]>();
  for (const count of SAMPLE_COUNTS) {
    if (count < 0) continue;
    const category = pluralCategoryOf(locale, count);
    const examples = found.get(category) ?? [];
    if (examples.length < VALUE_EXAMPLES_KEPT) examples.push(count);
    found.set(category, examples);
  }
  const examples = new Map(
    [...PLURAL_CATEGORIES].flatMap((category) => {
      const counts = found.get(category);
      return counts === undefined ? [] : [[category, counts] as const];
    }),
  );
  valueExamplesByLocale.set(locale, examples);
  return examples;
};

const categoriesByLocale = new Map<string, ReadonlySet<string>>();

/** The plural categories `locale` gives some number. */
const reachableCategories = (locale: LocaleTag): ReadonlySet<string> => {
  let categories = categoriesByLocale.get(locale);
  if (categories === undefined) {
    categories = new Set(
      SAMPLE_COUNTS.map((count) => pluralCategoryOf(locale, count)),
    );
    categoriesByLocale.set(locale, categories);
  }
  return categories;
};

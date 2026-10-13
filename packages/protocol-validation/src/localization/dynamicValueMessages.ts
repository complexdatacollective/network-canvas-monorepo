import {
  type MessageFormatElement,
  parse,
  type ParserOptions,
  TYPE,
} from '@formatjs/icu-messageformat-parser';

import { isBlankText } from './blankText.ts';
import type { LocaleTag } from './localeTag.ts';
import type { MessagePart } from './messageArguments.ts';

/**
 * A value from the interview that a stage's text may show (see the stage's
 * `dynamicValues`), as the message checker sees it:
 * - `cases`, the keys a select on the value may name besides `missing` and
 *   `other` (a categorical, ordinal or boolean value's binding cases);
 * - `numeric`, whether a plural may choose a version by it;
 * - `optional`, whether it can be missing where the text is shown. Such a
 *   value is shown only inside a version of a select on it that is for when
 *   it has a value, and that select has a `missing` version.
 */
export type DynamicValueArgument = Readonly<{
  cases: readonly string[];
  numeric: boolean;
  optional: boolean;
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

/** An argument name: ASCII letters and digits, starting with a letter. */
export const DYNAMIC_VALUE_NAME = /^[A-Za-z][A-Za-z0-9]*$/;

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

const parseMessage = (message: string): MessageFormatElement[] | string => {
  try {
    return parse(message, PARSE_OPTIONS);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return `Text is not valid message syntax (${error.message}).`;
  }
};

/**
 * What one value is, for choosing a version without knowing the stage:
 * missing, or present with the case and plural category that choose for it.
 */
type ChoiceState = Readonly<
  { missing: true } | { missing: false; case?: string; category: string }
>;

const optionFor = (
  options: Readonly<Record<string, { value: MessageFormatElement[] }>>,
  key: string | undefined,
) =>
  (key !== undefined && Object.hasOwn(options, key)
    ? options[key]
    : undefined) ?? options.other;

/** Whether the version of `nodes` the values in `stateOf` read shows anything. */
const versionShows = (
  nodes: readonly MessageFormatElement[],
  stateOf: (name: string) => ChoiceState,
  plural: string | undefined,
): boolean =>
  nodes.some((node) => {
    switch (node.type) {
      case TYPE.literal:
        return !isBlankText(node.value);
      case TYPE.argument:
        return !stateOf(node.value).missing;
      case TYPE.pound:
        return plural === undefined || !stateOf(plural).missing;
      case TYPE.select: {
        const state = stateOf(node.value);
        const option = optionFor(
          node.options,
          state.missing ? MISSING_CASE : state.case,
        );
        return (
          option !== undefined && versionShows(option.value, stateOf, plural)
        );
      }
      case TYPE.plural: {
        const state = stateOf(node.value);
        const option = optionFor(
          node.options,
          state.missing ? 'other' : state.category,
        );
        return (
          option !== undefined &&
          versionShows(option.value, stateOf, node.value)
        );
      }
      default:
        return true;
    }
  });

// Beyond this many combinations of states the blank check accepts rather
// than stall.
const MAX_BLANK_SCENARIOS = 20_000;

/**
 * Whether some version of `elements` shows something: visible text, a value
 * or a count. Versions are read for each combination of what the values may
 * be, so choices on one value agree with each other: text only in a version
 * no state reaches (a present version inside a missing one) shows nothing.
 * Without the stage, every case and plural category the text names counts
 * as reachable, and a value as possibly missing; the check errs towards
 * accepting.
 */
const showsSomething = (elements: readonly MessageFormatElement[]): boolean => {
  const cases = new Map<string, Set<string>>();
  const categories = new Map<string, Set<string>>();
  const collect = (nodes: readonly MessageFormatElement[]) => {
    for (const node of nodes) {
      if (node.type === TYPE.argument && !cases.has(node.value)) {
        cases.set(node.value, new Set());
      }
      if (node.type === TYPE.select || node.type === TYPE.plural) {
        const own = cases.get(node.value) ?? new Set<string>();
        cases.set(node.value, own);
        const keys = Object.keys(node.options);
        if (node.type === TYPE.select) {
          for (const key of keys) {
            if (key !== MISSING_CASE && key !== 'other') own.add(key);
          }
        } else {
          const counted = categories.get(node.value) ?? new Set<string>();
          for (const key of keys) counted.add(key);
          categories.set(node.value, counted);
        }
        for (const option of Object.values(node.options)) collect(option.value);
      }
    }
  };
  collect(elements);

  const axes = [...cases].map(([name, keys]) => {
    const states: ChoiceState[] = [{ missing: true }];
    for (const key of [undefined, ...keys]) {
      for (const category of new Set([
        'other',
        ...(categories.get(name) ?? []),
      ])) {
        states.push(
          key === undefined
            ? { missing: false, category }
            : { missing: false, case: key, category },
        );
      }
    }
    return [name, states] as const;
  });
  const total = axes.reduce(
    (product, [, states]) => product * states.length,
    1,
  );
  if (total > MAX_BLANK_SCENARIOS) return true;
  for (let index = 0; index < total; index += 1) {
    const scenario = new Map<string, ChoiceState>();
    let rest = index;
    for (const [name, states] of axes) {
      const state = states[rest % states.length];
      rest = Math.floor(rest / states.length);
      if (state !== undefined) scenario.set(name, state);
    }
    const stateOf = (name: string): ChoiceState =>
      scenario.get(name) ?? { missing: false, category: 'other' };
    if (versionShows(elements, stateOf, undefined)) return true;
  }
  return false;
};

const MARKER_PROBLEM =
  'Text cannot contain the private-use character U+E000: the interview uses it to place values.';

/**
 * Why `message` cannot be the text of a site that may show dynamic values,
 * judged without knowing which values the stage binds, or undefined when it
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
        for (const option of Object.values(node.options)) {
          const problem = visit(option.value);
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
    elements.some(
      (node) => node.type === TYPE.select || node.type === TYPE.plural,
    ) &&
    !showsSomething(elements)
  ) {
    return 'Text cannot be blank in every version: at least one of its versions must show some text or a value.';
  }
  return undefined;
};

/**
 * The argument `name` stands for, read as an own property: a name such as
 * `constructor` must not find `Object.prototype`'s.
 */
const argumentOf = (
  values: DynamicValueArguments,
  name: string,
): DynamicValueArgument | undefined =>
  Object.hasOwn(values, name) ? values[name] : undefined;

const describeAllowed = (values: DynamicValueArguments): string => {
  const names = Object.keys(values);
  return names.length === 0
    ? 'No values are available here.'
    : `The values available here are ${names.map((name) => `"${name}"`).join(', ')}.`;
};

const unknownValue = (name: string, values: DynamicValueArguments): string =>
  `"${name}" is not a value this text can show here. ${describeAllowed(values)}`;

const unguarded = (name: string): string =>
  `"${name}" can be missing, so the text needs a version for when it is missing ({${name}, select, ${MISSING_CASE} {…} other {…}}), and can show it only in the other versions.`;

const findElementsProblem = (
  elements: readonly MessageFormatElement[],
  values: DynamicValueArguments,
  guarded: ReadonlySet<string>,
): string | undefined => {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.literal:
      case TYPE.pound:
        break;
      case TYPE.argument: {
        const value = argumentOf(values, element.value);
        if (value === undefined) return unknownValue(element.value, values);
        if (value.optional && !guarded.has(element.value)) {
          return unguarded(element.value);
        }
        break;
      }
      case TYPE.select: {
        const name = element.value;
        const value = argumentOf(values, name);
        if (value === undefined) return unknownValue(name, values);
        const hasMissing = MISSING_CASE in element.options;
        for (const [key, option] of Object.entries(element.options)) {
          if (
            key !== 'other' &&
            key !== MISSING_CASE &&
            !value.cases.includes(key)
          ) {
            return `"${key}" is not a version "${name}" can choose. Its versions are ${[MISSING_CASE, ...value.cases, 'other'].map((each) => `"${each}"`).join(', ')}.`;
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
          const problem = findElementsProblem(option.value, values, inner);
          if (problem !== undefined) return problem;
        }
        break;
      }
      case TYPE.plural: {
        const name = element.value;
        const value = argumentOf(values, name);
        if (value === undefined) return unknownValue(name, values);
        if (!value.numeric || element.pluralType !== 'cardinal') {
          return `"${name}" is not a number, so it cannot choose a version of the text by number.`;
        }
        if (element.offset !== 0) {
          return `The plural of "${name}" cannot use an offset.`;
        }
        if (value.optional && !guarded.has(name)) return unguarded(name);
        for (const [key, option] of Object.entries(element.options)) {
          if (!PLURAL_CATEGORIES.has(key)) {
            return `"${key}" is not a plural category. Use "zero", "one", "two", "few", "many" or "other".`;
          }
          const problem = findElementsProblem(option.value, values, guarded);
          if (problem !== undefined) return problem;
        }
        break;
      }
      default:
        return 'This text cannot format numbers, dates or times, or contain tags.';
    }
  }
  return undefined;
};

/**
 * Why `message` cannot be the text of a site whose stage binds `values` there,
 * or undefined when it can. One pass checks that it parses, holds no marker,
 * names only those values, chooses versions only by a value's presence
 * (`missing`), its cases or, for a number, its plural category, and shows a
 * value that can be missing only inside a version for when it has one.
 */
export const findDynamicValueProblem = (
  message: string,
  values: DynamicValueArguments,
): string | undefined => {
  const syntax = findDynamicMessageSyntaxProblem(message);
  if (syntax !== undefined) return syntax;
  const elements = parseMessage(message);
  if (typeof elements === 'string') return elements;
  return findElementsProblem(elements, values, new Set());
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
        for (const option of Object.values(node.options)) visit(option.value);
      }
    }
  };
  visit(elements);
  return [...names];
};

/**
 * What a value is at one moment, as far as choosing a version goes: missing,
 * or present, with the select case it matches and the number it is, when it
 * has either.
 */
export type DynamicValueState =
  | Readonly<{ missing: true }>
  | Readonly<{ missing: false; case?: string; count?: number }>;

const pushText = (parts: MessagePart[], text: string) => {
  const last = parts.at(-1);
  if (typeof last === 'string') parts[parts.length - 1] = last + text;
  else if (text !== '') parts.push(text);
};

const pluralRules = new Map<string, Intl.PluralRules>();
const pluralCategoryOf = (locale: LocaleTag, count: number): string => {
  let rules = pluralRules.get(locale);
  if (rules === undefined) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules('en');
    }
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
};

const flatten = (
  elements: readonly MessageFormatElement[],
  locale: LocaleTag,
  stateOf: (name: string) => DynamicValueState,
  plural: string | undefined,
  parts: MessagePart[],
  /** Collects the values whose plural the version goes through. */
  plurals: Set<string>,
) => {
  for (const element of elements) {
    if (element.type === TYPE.literal) pushText(parts, element.value);
    else if (element.type === TYPE.argument) {
      parts.push({ argument: element.value });
    } else if (element.type === TYPE.pound) {
      if (plural === undefined) pushText(parts, '#');
      else parts.push({ argument: plural });
    } else if (element.type === TYPE.select) {
      const state = stateOf(element.value);
      const key = state.missing ? MISSING_CASE : state.case;
      const option =
        (key !== undefined && Object.hasOwn(element.options, key)
          ? element.options[key]
          : undefined) ?? element.options.other;
      if (option !== undefined) {
        flatten(option.value, locale, stateOf, plural, parts, plurals);
      }
    } else if (element.type === TYPE.plural) {
      const state = stateOf(element.value);
      const category =
        !state.missing && state.count !== undefined
          ? pluralCategoryOf(locale, state.count)
          : 'other';
      const option =
        (Object.hasOwn(element.options, category)
          ? element.options[category]
          : undefined) ?? element.options.other;
      plurals.add(element.value);
      if (option !== undefined) {
        flatten(option.value, locale, stateOf, element.value, parts, plurals);
      }
    }
  }
};

/**
 * The version of `message`, written in `locale`, that values in the given
 * states read: its text, and where each value it shows goes. A select on a
 * value takes `missing` when the value is missing, else the version for its
 * case, else `other`; a plural takes its count's category in `locale`. `#`
 * inside a plural is that plural's value. The interview fills the values in;
 * nothing here formats them. A message that does not parse reads as itself.
 */
export const dynamicMessageParts = (
  message: string,
  locale: LocaleTag,
  stateOf: (name: string) => DynamicValueState,
): readonly MessagePart[] => {
  const elements = parseMessage(message);
  if (typeof elements === 'string') return [message];
  const parts: MessagePart[] = [];
  flatten(elements, locale, stateOf, undefined, parts, new Set());
  return parts;
};

/** A version of a translation that leaves out a value its original shows. */
export type MissingDynamicPlacement = Readonly<{
  argument: string;
  /** The version: what each value the two texts use is in it. */
  when: Readonly<Record<string, string>>;
}>;

/**
 * The texts choose between more versions than can be compared one by one,
 * so whether the translation shows every value cannot be known.
 */
export const TOO_MANY_DYNAMIC_VERSIONS = 'tooManyVersions';

/**
 * The values the version of `message` for `scenario` shows, and the values
 * whose plural that version goes through.
 */
const versionIn = (
  message: string,
  locale: LocaleTag,
  scenario: ReadonlyMap<string, DynamicValueState>,
): Readonly<{ shown: ReadonlySet<string>; plurals: ReadonlySet<string> }> => {
  const elements = parseMessage(message);
  const parts: MessagePart[] = [];
  const plurals = new Set<string>();
  if (typeof elements !== 'string') {
    flatten(
      elements,
      locale,
      (name) => scenario.get(name) ?? { missing: false },
      undefined,
      parts,
      plurals,
    );
  }
  return {
    shown: new Set(
      parts.flatMap((part) =>
        typeof part === 'string' ? [] : [part.argument],
      ),
    ),
    plurals,
  };
};

// Beyond this many combinations of states the check gives up rather than
// stall: no realistic stage text uses enough values to reach it.
const MAX_SCENARIOS = 20_000;

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

type CountSample = Readonly<{
  /** One count for each pair of categories the two languages give it. */
  counts: readonly number[];
  /**
   * The categories of the translation's language that only one sampled
   * number selects, by that number.
   */
  singleNumberCategories: ReadonlySet<string>;
}>;

const countSamples = new Map<string, CountSample>();

/**
 * The counts a check comparing a text in `originalLocale` with one in
 * `locale` needs: a version of each text is chosen by its own language's
 * category for the count, so one count per pair of categories reaches every
 * pair of versions.
 */
const countSampleFor = (
  originalLocale: LocaleTag,
  locale: LocaleTag,
): CountSample => {
  const key = `${originalLocale} ${locale}`;
  const cached = countSamples.get(key);
  if (cached !== undefined) return cached;
  const byPair = new Map<string, number>();
  const membersOf = new Map<string, number>();
  for (const count of SAMPLE_COUNTS) {
    const category = pluralCategoryOf(locale, count);
    const pair = `${pluralCategoryOf(originalLocale, count)} ${category}`;
    if (!byPair.has(pair)) byPair.set(pair, count);
    membersOf.set(category, (membersOf.get(category) ?? 0) + 1);
  }
  const sample: CountSample = {
    counts: [...byPair.values()],
    singleNumberCategories: new Set(
      [...membersOf].flatMap(([category, members]) =>
        members === 1 ? [category] : [],
      ),
    ),
  };
  countSamples.set(key, sample);
  return sample;
};

const describeState = (state: DynamicValueState): string => {
  if (state.missing) return MISSING_CASE;
  if (state.count !== undefined) return String(state.count);
  return state.case ?? 'other';
};

/**
 * The first version of `translation` (written in `locale`) that leaves out a
 * value `original` (written in `originalLocale`) shows for the same values,
 * or undefined when the translation shows everything its original does: a
 * translation must show the values its original shows. Versions are compared
 * by what the values are, so languages with different plural categories
 * compare count by count. A plural category that only one number selects in
 * the translation's language may leave its number out (Arabic `zero`); since
 * a number answer may be negative, English `one`, which holds 1 and -1, may
 * not. Meant for messages
 * `findDynamicValueProblem` accepts. `TOO_MANY_DYNAMIC_VERSIONS` when the
 * two texts choose between too many versions to compare: such a translation
 * is not accepted unchecked.
 */
export const findMissingDynamicPlacement = (
  original: string,
  originalLocale: LocaleTag,
  translation: string,
  locale: LocaleTag,
  values: DynamicValueArguments,
): MissingDynamicPlacement | typeof TOO_MANY_DYNAMIC_VERSIONS | undefined => {
  const names = [
    ...new Set([
      ...dynamicValueNamesIn(original),
      ...dynamicValueNamesIn(translation),
    ]),
  ].filter((name) => argumentOf(values, name) !== undefined);
  if (names.length === 0) return undefined;

  const { counts, singleNumberCategories } = countSampleFor(
    originalLocale,
    locale,
  );

  const statesFor = (name: string): readonly DynamicValueState[] => {
    const value = argumentOf(values, name);
    if (value === undefined) return [{ missing: false }];
    const present: DynamicValueState[] = value.numeric
      ? counts.map((count) => ({ missing: false, count }))
      : [
          { missing: false },
          ...value.cases.map((key) => ({ missing: false, case: key })),
        ];
    return value.optional ? [{ missing: true }, ...present] : present;
  };

  const axes = names.map((name) => [name, statesFor(name)] as const);
  const total = axes.reduce(
    (product, [, states]) => product * states.length,
    1,
  );
  if (total > MAX_SCENARIOS) return TOO_MANY_DYNAMIC_VERSIONS;

  // A category that only one number selects may leave its number out. A
  // number answer can be negative, and plural rules read a negative count
  // as its size (English `one` holds -1 as well as 1), so in practice that
  // is a category for zero alone.
  const singleNumberCategory = (count: number | undefined): boolean =>
    count !== undefined &&
    singleNumberCategories.has(pluralCategoryOf(locale, count));

  for (let index = 0; index < total; index += 1) {
    const scenario = new Map<string, DynamicValueState>();
    let rest = index;
    for (const [name, states] of axes) {
      const state = states[rest % states.length];
      rest = Math.floor(rest / states.length);
      if (state !== undefined) scenario.set(name, state);
    }
    const required = versionIn(original, originalLocale, scenario).shown;
    if (required.size === 0) continue;
    // The one-number waiver holds only where this version of the
    // translation itself goes through that value's plural.
    const { shown, plurals } = versionIn(translation, locale, scenario);
    for (const name of required) {
      if (shown.has(name)) continue;
      const state = scenario.get(name);
      if (
        state !== undefined &&
        !state.missing &&
        plurals.has(name) &&
        singleNumberCategory(state.count)
      ) {
        continue;
      }
      return {
        argument: name,
        when: Object.fromEntries(
          [...scenario].map(([each, eachState]) => [
            each,
            describeState(eachState),
          ]),
        ),
      };
    }
  }
  return undefined;
};

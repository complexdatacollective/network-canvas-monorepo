import {
  type MessageFormatElement,
  parse,
  type ParserOptions,
  TYPE,
} from '@formatjs/icu-messageformat-parser';

import type { LocaleTag } from './localeTag.ts';
import { type MessagePart, pluralCountExamples } from './messageArguments.ts';

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

const MARKER_PROBLEM =
  'Text cannot contain the private-use character U+E000: the interview uses it to place values.';

/**
 * Why `message` cannot be the text of a site that may show dynamic values,
 * judged without knowing which values the stage binds, or undefined when it
 * may be: it parses, holds no number, date or time formatting, and no marker
 * character. Which values it shows, and how, is `findDynamicValueProblem`'s
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
  return visit(elements);
};

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
        const value = values[element.value];
        if (value === undefined) return unknownValue(element.value, values);
        if (value.optional && !guarded.has(element.value)) {
          return unguarded(element.value);
        }
        break;
      }
      case TYPE.select: {
        const name = element.value;
        const value = values[name];
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
          // has a value; `other` only once `missing` has taken the rest.
          const present =
            key !== MISSING_CASE &&
            (key !== 'other' || hasMissing || !value.optional);
          const inner = new Set(guarded);
          if (present) inner.add(name);
          else inner.delete(name);
          const problem = findElementsProblem(option.value, values, inner);
          if (problem !== undefined) return problem;
        }
        break;
      }
      case TYPE.plural: {
        const name = element.value;
        const value = values[name];
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
        (key === undefined ? undefined : element.options[key]) ??
        element.options.other;
      if (option !== undefined) {
        flatten(option.value, locale, stateOf, plural, parts);
      }
    } else if (element.type === TYPE.plural) {
      const state = stateOf(element.value);
      const category =
        !state.missing && state.count !== undefined
          ? pluralCategoryOf(locale, state.count)
          : 'other';
      const option = element.options[category] ?? element.options.other;
      if (option !== undefined) {
        flatten(option.value, locale, stateOf, element.value, parts);
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
  flatten(elements, locale, stateOf, undefined, parts);
  return parts;
};

/** A version of a translation that leaves out a value its original shows. */
export type MissingDynamicPlacement = Readonly<{
  argument: string;
  /** The version: what each value the two texts use is in it. */
  when: Readonly<Record<string, string>>;
}>;

const shownIn = (
  message: string,
  locale: LocaleTag,
  scenario: ReadonlyMap<string, DynamicValueState>,
): ReadonlySet<string> =>
  new Set(
    dynamicMessageParts(
      message,
      locale,
      (name) => scenario.get(name) ?? { missing: false },
    ).flatMap((part) => (typeof part === 'string' ? [] : [part.argument])),
  );

// Beyond this many combinations of states the check gives up rather than
// stall: no realistic stage text uses enough values to reach it.
const MAX_SCENARIOS = 20_000;

const describeState = (state: DynamicValueState): string => {
  if (state.missing) return MISSING_CASE;
  if (state.count !== undefined) return String(state.count);
  return state.case ?? 'other';
};

const pluralNamesIn = (message: string): ReadonlySet<string> => {
  const elements = parseMessage(message);
  const names = new Set<string>();
  if (typeof elements === 'string') return names;
  const visit = (nodes: readonly MessageFormatElement[]) => {
    for (const node of nodes) {
      if (node.type === TYPE.plural) names.add(node.value);
      if (node.type === TYPE.select || node.type === TYPE.plural) {
        for (const option of Object.values(node.options)) visit(option.value);
      }
    }
  };
  visit(elements);
  return names;
};

/**
 * The first version of `translation` (written in `locale`) that leaves out a
 * value `original` (written in `originalLocale`) shows for the same values,
 * or undefined when the translation shows everything its original does: a
 * translation must show the values its original shows. Versions are compared
 * by what the values are, so languages with different plural categories
 * compare count by count. As for declared arguments, a plural category that
 * only one whole number selects in the translation's language may leave its
 * number out (English "one person"). Meant for messages
 * `findDynamicValueProblem` accepts.
 */
export const findMissingDynamicPlacement = (
  original: string,
  originalLocale: LocaleTag,
  translation: string,
  locale: LocaleTag,
  values: DynamicValueArguments,
): MissingDynamicPlacement | undefined => {
  const names = [
    ...new Set([
      ...dynamicValueNamesIn(original),
      ...dynamicValueNamesIn(translation),
    ]),
  ].filter((name) => values[name] !== undefined);
  if (names.length === 0) return undefined;

  const translationExamples = pluralCountExamples(locale);
  const counts = [
    ...new Set(
      [pluralCountExamples(originalLocale), translationExamples].flatMap(
        (examples) =>
          [...examples.values()].flatMap((each) => each.slice(0, 2)),
      ),
    ),
  ].sort((a, b) => a - b);

  const statesFor = (name: string): readonly DynamicValueState[] => {
    const value = values[name];
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
  if (total > MAX_SCENARIOS) return undefined;

  const translationPlurals = pluralNamesIn(translation);
  const singleNumberCategory = (count: number | undefined): boolean => {
    if (count === undefined) return false;
    const category = pluralCategoryOf(locale, count);
    return (
      [...translationExamples].find(([each]) => each === category)?.[1]
        .length === 1
    );
  };

  for (let index = 0; index < total; index += 1) {
    const scenario = new Map<string, DynamicValueState>();
    let rest = index;
    for (const [name, states] of axes) {
      const state = states[rest % states.length];
      rest = Math.floor(rest / states.length);
      if (state !== undefined) scenario.set(name, state);
    }
    const required = shownIn(original, originalLocale, scenario);
    if (required.size === 0) continue;
    const shown = shownIn(translation, locale, scenario);
    for (const name of required) {
      if (shown.has(name)) continue;
      const state = scenario.get(name);
      if (
        state !== undefined &&
        !state.missing &&
        translationPlurals.has(name) &&
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

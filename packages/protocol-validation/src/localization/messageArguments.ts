import {
  type MessageFormatElement,
  parse,
  type ParserOptions,
  TYPE,
} from '@formatjs/icu-messageformat-parser';

import { isBlankText } from './blankText.ts';
import type { LocaleTag } from './localeTag.ts';
import { escapeMessageText } from './messageSyntax.ts';

/**
 * One argument a localized message may use, as the setting that holds it
 * declares it:
 * - `text`, a value shown where `{name}` is written;
 * - `select`, one of the listed cases or anything else, chosen by
 *   `{name, select, case {…} other {…}}`;
 * - `plural`, a number, chosen by its plural category with
 *   `{name, plural, one {…} other {…}}` and shown where `#` is written in
 *   one of those arms.
 */
export type MessageArgument =
  | Readonly<{ kind: 'text' }>
  | Readonly<{ kind: 'select'; cases: readonly string[] }>
  | Readonly<{ kind: 'plural' }>;

/** The arguments a localized message may use, by name. */
export type MessageArguments = Readonly<Record<string, MessageArgument>>;

// The same parse as the literal-only check: tags stay literal text.
const PARSE_OPTIONS: ParserOptions = { ignoreTag: true };

/** Every plural category CLDR defines, in its own order. */
const PLURAL_CATEGORIES = [
  'zero',
  'one',
  'two',
  'few',
  'many',
  'other',
] as const;

type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

const isPluralCategory = (key: string): key is PluralCategory =>
  (PLURAL_CATEGORIES as readonly string[]).includes(key);

/** The plural categories a language distinguishes, in CLDR order. */
export const pluralCategoriesOf = (
  locale: LocaleTag,
): readonly PluralCategory[] => {
  let categories: readonly string[];
  try {
    categories = new Intl.PluralRules(locale).resolvedOptions()
      .pluralCategories;
  } catch {
    categories = ['one', 'other'];
  }
  return PLURAL_CATEGORIES.filter((category) => categories.includes(category));
};

const parseMessage = (message: string): MessageFormatElement[] | string => {
  try {
    return parse(message, PARSE_OPTIONS);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return `Text is not valid message syntax (${error.message}).`;
  }
};

/** True when the elements show nothing whatever the arguments are. */
const isBlankElements = (elements: readonly MessageFormatElement[]): boolean =>
  elements.every(
    (element) => element.type === TYPE.literal && isBlankText(element.value),
  );

const describeAllowed = (declaration: MessageArguments): string => {
  const names = Object.keys(declaration);
  return names.length === 0
    ? 'This text cannot contain placeholders or formatting such as "{name}", plural or select.'
    : `This text can only use ${names.map((name) => `"${name}"`).join(', ')}.`;
};

const findElementsProblem = (
  elements: readonly MessageFormatElement[],
  declaration: MessageArguments,
): string | undefined => {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.literal:
      case TYPE.pound:
        break;
      case TYPE.argument: {
        const argument = declaration[element.value];
        if (argument === undefined) {
          return `"{${element.value}}" is not something this text can show. ${describeAllowed(declaration)}`;
        }
        if (argument.kind !== 'text') {
          return argument.kind === 'plural'
            ? `"${element.value}" is a number: write "#" inside its plural to show it.`
            : `"${element.value}" chooses between versions of the text with select; it cannot be shown as "{${element.value}}".`;
        }
        break;
      }
      case TYPE.select: {
        const argument = declaration[element.value];
        if (argument?.kind !== 'select') {
          return `"${element.value}" cannot choose between versions of this text. ${describeAllowed(declaration)}`;
        }
        for (const [key, option] of Object.entries(element.options)) {
          if (key !== 'other' && !argument.cases.includes(key)) {
            return `"${key}" is not a case of "${element.value}". Its cases are ${[...argument.cases, 'other'].map((name) => `"${name}"`).join(', ')}.`;
          }
          if (isBlankElements(option.value)) {
            return `The "${key}" version of this text is blank.`;
          }
          const problem = findElementsProblem(option.value, declaration);
          if (problem !== undefined) return problem;
        }
        break;
      }
      case TYPE.plural: {
        const argument = declaration[element.value];
        if (argument?.kind !== 'plural' || element.pluralType !== 'cardinal') {
          return `"${element.value}" cannot choose between versions of this text by number. ${describeAllowed(declaration)}`;
        }
        if (element.offset !== 0) {
          return `The plural of "${element.value}" cannot use an offset.`;
        }
        for (const [key, option] of Object.entries(element.options)) {
          if (!isPluralCategory(key)) {
            return `"${key}" is not a plural category. Use ${PLURAL_CATEGORIES.map((name) => `"${name}"`).join(', ')}.`;
          }
          if (isBlankElements(option.value)) {
            return `The "${key}" version of this text is blank.`;
          }
          const problem = findElementsProblem(option.value, declaration);
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
 * Why `message` is not a message the setting can hold, or undefined when it
 * is: it must parse, and use only the declared arguments, each as its kind
 * says, with `other` in every select and plural (the parser insists on that),
 * only declared cases and CLDR plural categories as arms, and no arm that
 * shows nothing. A message with no arguments at all is always allowed, so
 * one phrase can serve every case.
 */
export const findMessageArgumentProblem = (
  message: string,
  declaration: MessageArguments,
): string | undefined => {
  const elements = parseMessage(message);
  if (typeof elements === 'string') return elements;
  return findElementsProblem(elements, declaration);
};

/** One piece of a variant: text, or where an argument's value goes. */
export type MessagePart = string | Readonly<{ argument: string }>;

/**
 * One version of a message: the case of each select argument and the plural
 * category of each plural argument it is for, and what it reads. An argument
 * part naming a plural argument is its number.
 */
export type MessageVariant = Readonly<{
  when: Readonly<Record<string, string>>;
  parts: readonly MessagePart[];
}>;

type Axis = Readonly<{
  name: string;
  kind: 'select' | 'plural';
  keys: readonly string[];
}>;

/**
 * The choices a message makes in a language: each select argument's cases
 * then `other`, then each plural argument's categories in that language, in
 * declaration order.
 */
const axesOf = (
  declaration: MessageArguments,
  locale: LocaleTag,
): readonly Axis[] => [
  ...Object.entries(declaration).flatMap(([name, argument]): Axis[] =>
    argument.kind === 'select'
      ? [{ name, kind: 'select', keys: [...argument.cases, 'other'] }]
      : [],
  ),
  ...Object.entries(declaration).flatMap(([name, argument]): Axis[] =>
    argument.kind === 'plural'
      ? [{ name, kind: 'plural', keys: pluralCategoriesOf(locale) }]
      : [],
  ),
];

const combinations = (
  axes: readonly Axis[],
): readonly Readonly<Record<string, string>>[] =>
  axes.reduce<Readonly<Record<string, string>>[]>(
    (combos, axis) =>
      combos.flatMap((combo) =>
        axis.keys.map((key) => ({ ...combo, [axis.name]: key })),
      ),
    [{}],
  );

const pushText = (parts: MessagePart[], text: string) => {
  const last = parts.at(-1);
  if (typeof last === 'string') parts[parts.length - 1] = last + text;
  else if (text !== '') parts.push(text);
};

const flatten = (
  elements: readonly MessageFormatElement[],
  when: Readonly<Record<string, string>>,
  plural: string | undefined,
  parts: MessagePart[],
) => {
  for (const element of elements) {
    if (element.type === TYPE.literal) pushText(parts, element.value);
    else if (element.type === TYPE.argument)
      parts.push({ argument: element.value });
    else if (element.type === TYPE.pound) {
      if (plural === undefined) pushText(parts, '#');
      else parts.push({ argument: plural });
    } else if (element.type === TYPE.select || element.type === TYPE.plural) {
      const key = when[element.value];
      const option =
        (key === undefined ? undefined : element.options[key]) ??
        element.options.other;
      if (option !== undefined) {
        flatten(
          option.value,
          when,
          element.type === TYPE.plural ? element.value : plural,
          parts,
        );
      }
    }
  }
};

/**
 * `message`, written in `locale`, as one variant for every choice it can make
 * there (see `axesOf`). A message using no select or plural is one variant
 * that every choice reads the same. Meant for messages
 * `findMessageArgumentProblem` accepts; for one it rejects, the variants show
 * what can be read of it, or a single variant of the message as text when it
 * does not parse.
 */
export const messageVariants = (
  message: string,
  declaration: MessageArguments,
  locale: LocaleTag,
): readonly MessageVariant[] => {
  const elements = parseMessage(message);
  return combinations(axesOf(declaration, locale)).map((when) => {
    if (typeof elements === 'string') return { when, parts: [message] };
    const parts: MessagePart[] = [];
    flatten(elements, when, undefined, parts);
    return { when, parts };
  });
};

/**
 * Text as a run of literal message text. Inside a plural, `#` would show the
 * number, so it is quoted there; an apostrophe before the quote is doubled so
 * that it is not read as the start of one.
 */
const escapeText = (text: string, inPlural: boolean): string => {
  if (!inPlural || !text.includes('#')) return escapeMessageText(text);
  return text
    .split('#')
    .map((segment) => {
      const escaped = escapeMessageText(segment);
      return escaped.endsWith("'") && !escaped.endsWith("''")
        ? `${escaped}'`
        : escaped;
    })
    .join("'#'");
};

const renderParts = (
  parts: readonly MessagePart[],
  declaration: MessageArguments,
  inPlural: boolean,
): string =>
  parts
    .map((part) => {
      if (typeof part === 'string') return escapeText(part, inPlural);
      return declaration[part.argument]?.kind === 'plural'
        ? '#'
        : `{${part.argument}}`;
    })
    .join('');

/**
 * The message the variants make in `locale`: select arguments outermost,
 * then plural ones, each written only where its versions differ, so variants
 * that all read the same make a single phrase. Every variant is looked up by
 * its choices; one that is missing reads as empty.
 */
export const composeMessage = (
  variants: readonly MessageVariant[],
  declaration: MessageArguments,
  locale: LocaleTag,
): string => {
  const partsFor = (when: Readonly<Record<string, string>>) =>
    variants.find((variant) =>
      Object.entries(when).every(([name, key]) => variant.when[name] === key),
    )?.parts ?? [];

  // `#` means the number only inside a plural, so a plural whose number is
  // shown is kept even where every category reads the same.
  const showsNumber = variants.some((variant) =>
    variant.parts.some(
      (part) =>
        typeof part !== 'string' &&
        declaration[part.argument]?.kind === 'plural',
    ),
  );

  const compose = (
    axes: readonly Axis[],
    fixed: Readonly<Record<string, string>>,
    inPlural: boolean,
  ): string => {
    const [axis, ...rest] = axes;
    if (axis === undefined) {
      return renderParts(partsFor(fixed), declaration, inPlural);
    }
    const arms = axis.keys.map((key) =>
      compose(
        rest,
        { ...fixed, [axis.name]: key },
        inPlural || axis.kind === 'plural',
      ),
    );
    const keepsPlural = axis.kind === 'plural' && showsNumber;
    if (!keepsPlural && arms.every((arm) => arm === arms[0])) {
      return compose(rest, fixed, inPlural);
    }
    const options = axis.keys
      .map((key, index) => `${key} {${arms[index] ?? ''}}`)
      .join(' ');
    return `{${axis.name}, ${axis.kind}, ${options}}`;
  };

  return compose(axesOf(declaration, locale), {}, false);
};

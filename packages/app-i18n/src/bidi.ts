import { TYPE } from '@formatjs/icu-messageformat-parser';
import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser';

import type { TextDirection } from '@codaco/shared-consts';

/**
 * U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE. Between
 * them a value takes the direction of its own first strong character and is
 * laid out as one unit, so it cannot reorder with the sentence around it.
 * Both are invisible format characters that screen readers do not voice.
 */
export const FIRST_STRONG_ISOLATE = '\u2068';
export const POP_DIRECTIONAL_ISOLATE = '\u2069';

const ISOLATE_MARKS = new RegExp(
  `[${FIRST_STRONG_ISOLATE}${POP_DIRECTIONAL_ISOLATE}]`,
  'g',
);

/**
 * Formatted text without the isolates `isolateArguments` put in it, for text
 * that is used as data rather than shown: a file name, or a string searched
 * for what someone typed, which would not match across a value's edge.
 */
export const withoutIsolates = (text: string): string =>
  text.replace(ISOLATE_MARKS, '');

/**
 * A character that is written right to left (Hebrew, Arabic, Syriac, Thaana,
 * N'Ko and the rest of U+0590–U+08FF, their presentation forms, and the
 * right-to-left blocks beyond the BMP), or a formatting character that starts
 * right-to-left text (RLM, RLE, RLO, RLI).
 */
const RIGHT_TO_LEFT_TEXT =
  /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC\u200F\u202B\u202E\u2067\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;

/**
 * Whether a string value has to be isolated to keep its place in a sentence
 * written in `direction`.
 *
 * In a right-to-left sentence every value does: a Latin value that ends in
 * punctuation ("team-b!") has the punctuation moved to its other end, and one
 * that ends in a number ("Wave 2") can trade places with a number beside it.
 * In a left-to-right sentence only a value with right-to-left text in it can
 * reorder, so a value with none is left exactly as it is — which is what keeps
 * English output unchanged byte for byte.
 */
const needsIsolation = (value: string, direction: TextDirection): boolean =>
  value !== '' && (direction === 'rtl' || RIGHT_TO_LEFT_TEXT.test(value));

/**
 * The names of the arguments in `values` whose text has to be isolated in a
 * sentence written in `direction`. Only text is: a number, a date or a time is
 * formatted by Intl for the locale and has no direction of its own to
 * protect, and a rich value (a React node, a tag's function) is markup the
 * caller placed, not text.
 */
export function isolatedArgumentNames(
  values: Readonly<Record<string, unknown>> | undefined,
  direction: TextDirection,
): ReadonlySet<string> {
  const names = new Set<string>();
  if (values === undefined) return names;
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string' && needsIsolation(value, direction)) {
      names.add(name);
    }
  }
  return names;
}

const isolateMark = (value: string): MessageFormatElement => ({
  type: TYPE.literal,
  value,
});

/**
 * Wraps every plain `{name}` placeholder for an argument in `names` in a
 * first-strong isolate, wherever it sits: at the top level, in a plural or
 * select arm, or inside a rich-text tag (whose chunks then carry the isolate
 * characters with them).
 *
 * The message is rewritten rather than its values, because a value can also
 * choose a `select` arm, and a wrapped value would match none of them. Only
 * plain placeholders are wrapped: `{name, select, …}` and `{n, plural, …}`
 * choose words rather than show the value, and `{n, number}`, `{d, date}` and
 * `{t, time}` are formatted by Intl.
 */
export function isolateArguments(
  elements: readonly MessageFormatElement[],
  names: ReadonlySet<string>,
): MessageFormatElement[] {
  return elements.flatMap((element): MessageFormatElement[] => {
    switch (element.type) {
      case TYPE.argument:
        return names.has(element.value)
          ? [
              isolateMark(FIRST_STRONG_ISOLATE),
              element,
              isolateMark(POP_DIRECTIONAL_ISOLATE),
            ]
          : [element];
      case TYPE.select:
      case TYPE.plural:
        return [
          {
            ...element,
            options: Object.fromEntries(
              Object.entries(element.options).map(([key, option]) => [
                key,
                { ...option, value: isolateArguments(option.value, names) },
              ]),
            ),
          },
        ];
      case TYPE.tag:
        return [
          { ...element, children: isolateArguments(element.children, names) },
        ];
      case TYPE.literal:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
      case TYPE.pound:
      default:
        return [element];
    }
  });
}

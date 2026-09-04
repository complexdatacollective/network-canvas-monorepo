import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import type { IntlShape } from 'react-intl';

import { PSEUDO_LOCALE } from './locales.ts';
import type { CatalogMessages } from './locales.ts';
import { createAppIntl } from './messages.ts';
import type { AppIntlErrorHandler } from './messages.ts';

const ACCENTS: Readonly<Record<string, string>> = {
  a: 'á',
  e: 'é',
  i: 'î',
  o: 'ö',
  u: 'û',
  y: 'ý',
  A: 'Å',
  E: 'É',
  I: 'Î',
  O: 'Ö',
  U: 'Û',
  Y: 'Ý',
};

const accent = (value: string): string =>
  value.replace(/[aeiouyAEIOUY]/g, (character) => {
    const mapped = ACCENTS[character];
    return mapped === undefined ? character : mapped;
  });

const literal = (value: string): MessageFormatElement => ({
  type: TYPE.literal,
  value,
});

/**
 * Accents the literal text of a parsed message and nothing else. Working on
 * the AST rather than on formatted output is what keeps the two apart: a
 * placeholder's runtime value is not source copy and must survive verbatim,
 * while text nested inside a plural arm or a rich-text tag is source copy and
 * has to expand with the rest of the sentence.
 */
const accentElements = (
  elements: readonly MessageFormatElement[],
): MessageFormatElement[] =>
  elements.map((element) => {
    switch (element.type) {
      case TYPE.literal:
        return literal(accent(element.value));
      case TYPE.select:
      case TYPE.plural:
        return {
          ...element,
          options: Object.fromEntries(
            Object.entries(element.options).map(([key, option]) => [
              key,
              { ...option, value: accentElements(option.value) },
            ]),
          ),
        };
      case TYPE.tag:
        return { ...element, children: accentElements(element.children) };
      default:
        return element;
    }
  });

/**
 * How much source copy renders at this level, whichever arm a select or plural
 * chooses. Arms are excluded because each one carries its own padding (see
 * `padArms`); tag children are included because a tag's text always renders.
 */
const literalLength = (elements: readonly MessageFormatElement[]): number =>
  elements.reduce((total, element) => {
    switch (element.type) {
      case TYPE.literal:
        return total + element.value.length;
      case TYPE.tag:
        return total + literalLength(element.children);
      default:
        return total;
    }
  }, 0);

/**
 * Roughly a third: the expansion European translations of English bring.
 *
 * A level with no copy of its own gets none. A message that is nothing but a
 * select has all its copy inside the arms, and each of those is padded already
 * — a dot out here would be added to whichever arm rendered, on top of that
 * arm's own.
 */
const paddingFor = (elements: readonly MessageFormatElement[]): string => {
  const length = literalLength(elements);
  return length === 0 ? '' : '·'.repeat(Math.max(1, Math.ceil(length / 3)));
};

/**
 * Pads each arm by its own length rather than the message by its longest.
 *
 * A select renders exactly one arm, so a single trailing pad sized to the
 * longest one is wrong for every other arm: beside a 90-character arm, a
 * one-character arm rendered with about thirty dots after it — a layout check
 * that then fails on a string no translation of that arm could produce.
 * Sizing each arm to itself keeps the expansion proportional to what is
 * actually on screen, and stays static: which arm renders is still not known
 * here, and does not need to be.
 */
const padArms = (
  elements: readonly MessageFormatElement[],
): MessageFormatElement[] =>
  elements.map((element) => {
    switch (element.type) {
      case TYPE.select:
      case TYPE.plural:
        return {
          ...element,
          options: Object.fromEntries(
            Object.entries(element.options).map(([key, option]) => [
              key,
              { ...option, value: padded(option.value) },
            ]),
          ),
        };
      case TYPE.tag:
        return { ...element, children: padArms(element.children) };
      default:
        return element;
    }
  });

/** One level, with its arms padded and its own copy padded after them. */
const padded = (
  elements: readonly MessageFormatElement[],
): MessageFormatElement[] => [
  ...padArms(elements),
  literal(paddingFor(elements)),
];

/**
 * Accented, bracketed and padded, so a layout that cannot take a translation's
 * expansion clips here rather than after one lands.
 */
const pseudoMessage = (
  source: string | MessageFormatElement[],
): MessageFormatElement[] => {
  const accented = accentElements(
    typeof source === 'string' ? parse(source) : source,
  );
  return [literal('['), ...padded(accented), literal(']')];
};

/**
 * The development pseudo-locale formatter (en-XA).
 *
 * The catalog is resolved here rather than handed to react-intl, because
 * react-intl prefers `messages[id]` over any descriptor it is given: a
 * formatter holding the catalog would format the untouched translation and
 * ignore the pseudo-localized message entirely. So the lookup happens first
 * and its result is passed as the default message of a catalog-free
 * formatter.
 */
export function createPseudoIntl(options: {
  messages?: CatalogMessages;
  onError?: AppIntlErrorHandler;
  timeZone?: string;
}): IntlShape {
  const intl = createAppIntl({
    locale: PSEUDO_LOCALE,
    onError: options.onError,
    timeZone: options.timeZone,
  });
  const cache = new Map<string, MessageFormatElement[]>();

  const formatMessage = ((descriptor, values, opts) => {
    const id = descriptor.id;
    const source =
      (id === undefined ? undefined : options.messages?.[id]) ??
      descriptor.defaultMessage;
    if (source === undefined)
      return intl.formatMessage(descriptor, values, opts);

    let pseudo = id === undefined ? undefined : cache.get(id);
    if (pseudo === undefined) {
      try {
        pseudo = pseudoMessage(source);
      } catch {
        // Unparseable ICU is react-intl's error to report, with the id and the
        // message in hand; swallowing it here would turn a broken message into
        // a broken pseudo-locale instead.
        return intl.formatMessage(descriptor, values, opts);
      }
      if (id !== undefined) cache.set(id, pseudo);
    }
    const pseudoDescriptor = { ...descriptor, defaultMessage: pseudo };
    return intl.formatMessage(pseudoDescriptor, values, opts);
  }) as IntlShape['formatMessage'];

  return { ...intl, formatMessage };
}

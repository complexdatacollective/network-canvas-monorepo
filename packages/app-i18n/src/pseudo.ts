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
 * How much source copy a rendering of this message can contain. A select or
 * plural renders exactly one arm, so its arms are a maximum rather than a sum
 * — adding them up made a three-arm select expand by roughly the arm count
 * instead of by a third, which clips layouts that a real translation would fit.
 *
 * The longest arm is the honest static answer: the pseudo message is built
 * once per id and cached before any value exists, so which arm renders is not
 * knowable here, and the worst case is the one a layout check wants anyway.
 */
const literalLength = (elements: readonly MessageFormatElement[]): number =>
  elements.reduce((total, element) => {
    switch (element.type) {
      case TYPE.literal:
        return total + element.value.length;
      case TYPE.select:
      case TYPE.plural:
        return (
          total +
          Math.max(
            0,
            ...Object.values(element.options).map((option) =>
              literalLength(option.value),
            ),
          )
        );
      case TYPE.tag:
        return total + literalLength(element.children);
      default:
        return total;
    }
  }, 0);

/**
 * Accented, bracketed and padded by roughly a third — the expansion European
 * translations of English copy typically bring, so a layout that cannot take
 * it clips here rather than after a translation lands.
 */
const pseudoMessage = (
  source: string | MessageFormatElement[],
): MessageFormatElement[] => {
  const accented = accentElements(
    typeof source === 'string' ? parse(source) : source,
  );
  const padding = '·'.repeat(
    Math.max(1, Math.ceil(literalLength(accented) / 3)),
  );
  return [literal('['), ...accented, literal(`${padding}]`)];
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
}): IntlShape {
  const intl = createAppIntl({
    locale: PSEUDO_LOCALE,
    onError: options.onError,
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

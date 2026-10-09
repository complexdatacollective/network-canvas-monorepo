import { IntlMessageFormat } from 'intl-messageformat';

import {
  isSuppliedEnglishMessage,
  type LocaleTag,
} from '@codaco/protocol-validation';

/** The values a localized message's arguments take (see `localizedMessage`). */
export type LocalizedMessageValues = Readonly<Record<string, string | number>>;

/**
 * Formats a protocol-authored ICU message in the locale its text is written
 * in (English for Network Canvas's English wording, whatever language holds
 * it), with `values` for the arguments a localized message declares. Results
 * without values are cached per (locale, message), and the parsed message
 * per (locale, message) for those with values, so either cache is bounded by
 * the protocol's own strings.
 */
export type LocalizedMessageFormatter = (
  locale: LocaleTag,
  message: string,
  values?: LocalizedMessageValues,
) => string;

const joined = (formatted: string | readonly unknown[]): string =>
  typeof formatted === 'string' ? formatted : formatted.join('');

export function createLocalizedMessageFormatter(): LocalizedMessageFormatter {
  const texts = new Map<LocaleTag, Map<string, string>>();
  const parsed = new Map<LocaleTag, Map<string, IntlMessageFormat>>();

  const cacheFor = <Value>(
    caches: Map<LocaleTag, Map<string, Value>>,
    locale: LocaleTag,
  ): Map<string, Value> => {
    let cache = caches.get(locale);
    if (cache === undefined) {
      cache = new Map();
      caches.set(locale, cache);
    }
    return cache;
  };

  // Tags stay literal text, matching how protocol validation parses the
  // message: markdown fields legitimately contain `<br>` and similar.
  const parse = (locale: LocaleTag, message: string) =>
    new IntlMessageFormat(message, locale, undefined, { ignoreTag: true });

  return (heldIn, message, values) => {
    // Network Canvas's English wording, held under a language it supplies no
    // wording in, still chooses its plural by English rules.
    const locale = isSuppliedEnglishMessage(message) ? 'en' : heldIn;
    if (values !== undefined) {
      const formats = cacheFor(parsed, locale);
      let format = formats.get(message);
      if (format === undefined) {
        format = parse(locale, message);
        formats.set(message, format);
      }
      return joined(format.format<string>(values));
    }

    const cache = cacheFor(texts, locale);
    const cached = cache.get(message);
    if (cached !== undefined) return cached;
    const text = joined(parse(locale, message).format<string>());
    cache.set(message, text);
    return text;
  };
}

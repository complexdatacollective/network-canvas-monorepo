import { IntlMessageFormat } from 'intl-messageformat';

import {
  isolateArguments,
  isolatedArgumentNames,
} from '@codaco/app-i18n/messages';
import { type LocaleTag } from '@codaco/protocol-validation';
import { textDirectionOf } from '@codaco/shared-consts';

/** The values a localized message's arguments take (see `localizedMessage`). */
export type LocalizedMessageValues = Readonly<Record<string, string | number>>;

/**
 * Formats a protocol-authored ICU message in the locale its text is written
 * in, with `values` for the arguments a localized message declares. Text a
 * value puts into the sentence is bidi-isolated as app-i18n isolates it in
 * the interface's own messages (see `isolateArguments`): every text value in
 * a right-to-left language, and in a left-to-right one only a value with
 * right-to-left text in it. Results
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

export function createLocalizedMessageFormatter(): LocalizedMessageFormatter {
  const texts = new Map<LocaleTag, Map<string, string>>();
  const parsed = new Map<LocaleTag, Map<string, IntlMessageFormat>>();
  // Per parsed message, by the names of the values it isolates.
  const isolatedFormats = new WeakMap<
    IntlMessageFormat,
    Map<string, IntlMessageFormat>
  >();

  return (locale, message, values) => {
    if (values !== undefined) {
      const formats = cacheFor(parsed, locale);
      let format = formats.get(message);
      if (format === undefined) {
        format = parse(locale, message);
        formats.set(message, format);
      }
      const names = isolatedArgumentNames(values, textDirectionOf(locale));
      if (names.size > 0) {
        // Which values are isolated depends on which of them are text, so
        // each combination is a message of its own.
        let byNames = isolatedFormats.get(format);
        if (byNames === undefined) {
          byNames = new Map();
          isolatedFormats.set(format, byNames);
        }
        const key = [...names].toSorted().join(',');
        let isolated = byNames.get(key);
        if (isolated === undefined) {
          isolated = new IntlMessageFormat(
            isolateArguments(format.getAst(), names),
            locale,
            undefined,
            { ignoreTag: true },
          );
          byNames.set(key, isolated);
        }
        format = isolated;
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

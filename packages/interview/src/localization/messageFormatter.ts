import { IntlMessageFormat } from 'intl-messageformat';

import type { LocaleTag } from '@codaco/protocol-validation';

/**
 * Formats a protocol-authored ICU message in the locale its text is written
 * in. Results are cached per (locale, message), so the cache is bounded by the
 * protocol's own strings.
 */
export type LocalizedMessageFormatter = (
  locale: LocaleTag,
  message: string,
) => string;

export function createLocalizedMessageFormatter(): LocalizedMessageFormatter {
  const cache = new Map<LocaleTag, Map<string, string>>();

  return (locale, message) => {
    let messages = cache.get(locale);
    if (messages === undefined) {
      messages = new Map();
      cache.set(locale, messages);
    }

    const cached = messages.get(message);
    if (cached !== undefined) return cached;

    // Tags stay literal text, matching how protocol validation parses the
    // message: markdown fields legitimately contain `<br>` and similar.
    const formatted = new IntlMessageFormat(message, locale, undefined, {
      ignoreTag: true,
    }).format<string>();
    const text = typeof formatted === 'string' ? formatted : formatted.join('');
    messages.set(message, text);
    return text;
  };
}

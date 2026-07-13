import britishEnglishOverrides from '../../messages/en-GB.json';
import englishMessages from '../../messages/en.json';
import spanishMessages from '../../messages/es.json';
import type { Locale } from './locales';

type MessageCatalog = {
  [key: string]: string | MessageCatalog;
};

type MessageSource = {
  base: MessageCatalog;
  overrides?: MessageCatalog;
};

const messageSources = {
  'en-US': { base: englishMessages },
  'en-GB': { base: englishMessages, overrides: britishEnglishOverrides },
  'es': { base: spanishMessages },
} satisfies Record<Locale, MessageSource>;

function isMessageCatalog(
  value: string | MessageCatalog | undefined,
): value is MessageCatalog {
  return typeof value === 'object' && value !== null;
}

function mergeMessages(
  base: MessageCatalog,
  overrides: MessageCatalog,
): MessageCatalog {
  const merged: MessageCatalog = { ...base };

  for (const key of Object.keys(overrides)) {
    const baseValue = merged[key];
    const overrideValue = overrides[key];

    if (isMessageCatalog(baseValue) && isMessageCatalog(overrideValue)) {
      merged[key] = mergeMessages(baseValue, overrideValue);
    } else if (overrideValue !== undefined) {
      merged[key] = overrideValue;
    }
  }

  return merged;
}

export function loadLocaleMessages(locale: Locale): MessageCatalog {
  const source = messageSources[locale];
  if ('overrides' in source) {
    return mergeMessages(source.base, source.overrides);
  }

  return source.base;
}

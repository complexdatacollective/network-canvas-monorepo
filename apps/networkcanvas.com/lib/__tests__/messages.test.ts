import { describe, expect, it } from 'vitest';

import { supportedLocales } from '~/lib/i18n/locales';
import { loadLocaleMessages } from '~/lib/i18n/messages';
import enGB from '~/messages/en-GB.json';
import en from '~/messages/en.json';
import es from '~/messages/es.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageLeaves(value: unknown, prefix = ''): Array<[string, string]> {
  if (!isRecord(value)) {
    throw new Error(`Invalid message object at ${prefix}`);
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') return [[path, child]];
    if (isRecord(child)) return messageLeaves(child, path);
    throw new Error(`Invalid message value at ${path}`);
  });
}

function messageTokens(text: string): string[] {
  return text.match(/\{[^}]+\}|<\/?[a-z]+>/g)?.toSorted() ?? [];
}

describe('message catalogs', () => {
  it('keeps Spanish keys in parity with English', () => {
    expect(messageLeaves(es).map(([key]) => key)).toEqual(
      messageLeaves(en).map(([key]) => key),
    );
  });

  it.each(
    supportedLocales.map(({ locale }) => [locale, loadLocaleMessages(locale)]),
  )('contains no blank %s messages', (_locale, messages) => {
    expect(
      messageLeaves(messages).every(([, text]) => text.trim().length > 0),
    ).toBe(true);
  });

  it('limits regional overrides to keys in the base catalog', () => {
    const baseMessages = new Map(messageLeaves(en));

    for (const [key, override] of messageLeaves(enGB)) {
      const baseMessage = baseMessages.get(key);
      expect(baseMessage, `Unknown regional override: ${key}`).toBeDefined();
      expect(messageTokens(override)).toEqual(messageTokens(baseMessage ?? ''));
    }
  });

  it('inherits shared English messages and applies regional overrides', () => {
    const americanEnglish = new Map(messageLeaves(loadLocaleMessages('en-US')));
    const britishEnglish = new Map(messageLeaves(loadLocaleMessages('en-GB')));

    expect(britishEnglish.get('Hero.headline')).toBe(
      americanEnglish.get('Hero.headline'),
    );
    expect(americanEnglish.get('GetStarted.apps.fresco.description')).toContain(
      'centralized',
    );
    expect(britishEnglish.get('GetStarted.apps.fresco.description')).toContain(
      'centralised',
    );
    expect(
      americanEnglish.get('SummerUpdate.resources.documentation.heading'),
    ).toContain('organized');
    expect(
      britishEnglish.get('SummerUpdate.resources.documentation.heading'),
    ).toContain('organised');
  });

  it('keeps placeholders and rich-text tags in parity', () => {
    const englishLeaves = messageLeaves(en);
    const spanishLeaves = new Map(messageLeaves(es));

    for (const [key, englishText] of englishLeaves) {
      expect(messageTokens(spanishLeaves.get(key) ?? '')).toEqual(
        messageTokens(englishText),
      );
    }
  });
});

import { describe, expect, it } from 'vitest';

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

  it.each([
    ['en-US', en],
    ['en-GB', en],
    ['es', es],
  ])('contains no blank %s messages', (_locale, messages) => {
    expect(
      messageLeaves(messages).every(([, text]) => text.trim().length > 0),
    ).toBe(true);
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

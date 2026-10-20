import { describe, expect, it } from 'vitest';

import {
  canonicalizeLocale,
  isCanonicalLocale,
  isUndeterminedLocale,
} from '../localeTag.ts';

describe('canonicalizeLocale', () => {
  it.each(['en-US', 'es', 'zh-Hant-TW', 'en-x-foo', 'qaa'])(
    'keeps the canonical tag %s',
    (tag) => {
      expect(canonicalizeLocale(tag)).toBe(tag);
    },
  );

  it.each([
    ['en-us', 'en-US'],
    ['EN-US', 'en-US'],
    ['zh-hant-tw', 'zh-Hant-TW'],
    ['ZH-hans', 'zh-Hans'],
    ['en-X-FOO', 'en-x-foo'],
    ['iw', 'he'],
    ['in', 'id'],
    ['mo', 'ro'],
    ['art-lojban', 'jbo'],
  ])('canonicalizes %s to %s', (value, expected) => {
    expect(canonicalizeLocale(value)).toBe(expected);
  });

  it.each([
    'EN_us',
    'en_US',
    '',
    ' en',
    'en ',
    '*',
    'en--US',
    'x-private',
    'i-klingon',
    'constructor',
    'de-DE-1996-1996',
    'en-a-foo-a-bar',
  ])('returns undefined for the malformed value %j', (value) => {
    expect(canonicalizeLocale(value)).toBeUndefined();
  });
});

describe('isCanonicalLocale', () => {
  it.each(['en-US', 'es', 'zh-Hant-TW', 'en-x-foo'])(
    'accepts the canonical tag %s',
    (tag) => {
      expect(isCanonicalLocale(tag)).toBe(true);
    },
  );

  it.each([
    ['en-us', 'en-US'],
    ['iw', 'he'],
    ['zh-hant-tw', 'zh-Hant-TW'],
  ])(
    'rejects %s, whose canonical form %s can be suggested',
    (value, suggestion) => {
      expect(isCanonicalLocale(value)).toBe(false);
      expect(canonicalizeLocale(value)).toBe(suggestion);
    },
  );

  it.each(['EN_us', '', '*', 'x-private'])(
    'rejects the malformed value %j',
    (value) => {
      expect(isCanonicalLocale(value)).toBe(false);
    },
  );
});

describe('isUndeterminedLocale', () => {
  it.each(['und', 'UND', 'und-Latn', 'und-x-foo'])(
    'recognizes the undetermined language %s',
    (tag) => {
      expect(isUndeterminedLocale(tag)).toBe(true);
    },
  );

  it.each(['en', 'en-US', 'zh-Hant-TW', 'unk', 'undo', 'en-und', 'qaa'])(
    'does not mistake %s for it',
    (tag) => {
      expect(isUndeterminedLocale(tag)).toBe(false);
    },
  );
});

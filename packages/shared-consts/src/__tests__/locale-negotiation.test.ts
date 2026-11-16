import { describe, expect, it } from 'vitest';

import {
  canonicalizeLocaleTag,
  negotiateLocale,
  normalizeLocalePreferences,
  resolveLocale,
} from '../locale-negotiation.ts';

describe('canonicalizeLocaleTag', () => {
  it('canonicalizes case and trims', () => {
    expect(canonicalizeLocaleTag(' zh-hant-tw ')).toBe('zh-Hant-TW');
  });

  it.each(['', '  ', '*', 'EN_us'])('rejects %j', (value) => {
    expect(canonicalizeLocaleTag(value)).toBeUndefined();
  });
});

describe('normalizeLocalePreferences', () => {
  it('keeps order, drops malformed entries and repeats', () => {
    expect(normalizeLocalePreferences(['es-mx', '*', 'en', 'ES-MX'])).toEqual([
      'es-MX',
      'en',
    ]);
  });
});

describe('negotiateLocale', () => {
  // Browsers' language lists, as sent: an earlier regional fit beats a later
  // exact match, and a later exact match beats an earlier fit in another
  // language (ICU's default demotion of one region difference per place).
  it.each([
    { requested: ['es-MX', 'en'], available: ['en', 'es'], expected: 'es' },
    { requested: ['en-GB', 'sv'], available: ['en', 'sv'], expected: 'en' },
    {
      requested: ['pt-PT', 'en'],
      available: ['en', 'pt-BR'],
      expected: 'pt-BR',
    },
    {
      requested: ['zh-HK', 'zh'],
      available: ['zh-Hans', 'zh-Hant'],
      expected: 'zh-Hant',
    },
    {
      requested: ['zh-TW', 'zh-CN'],
      available: ['zh-Hans', 'zh-Hant'],
      expected: 'zh-Hant',
    },
    {
      requested: ['zh', 'zh-TW'],
      available: ['zh-Hans', 'zh-Hant'],
      expected: 'zh-Hans',
    },
    { requested: ['af', 'en'], available: ['en', 'nl'], expected: 'en' },
    { requested: ['ca', 'en'], available: ['en', 'es'], expected: 'en' },
    { requested: ['da', 'en'], available: ['en', 'nb'], expected: 'en' },
  ])(
    'gives $expected for $requested from $available',
    ({ requested, available, expected }) => {
      expect(negotiateLocale(requested, available)).toBe(expected);
    },
  );

  it('takes a fit in another language when nothing later is closer', () => {
    expect(negotiateLocale(['ca'], ['en', 'es'])).toBe('es');
    expect(negotiateLocale(['ca', 'fr'], ['en', 'es'])).toBe('es');
  });

  it('is undefined without a fallback when nothing fits', () => {
    expect(negotiateLocale(['ja'], ['en', 'fr'])).toBeUndefined();
    expect(negotiateLocale([], ['en', 'fr'])).toBeUndefined();
  });

  it('gives the fallback when nothing fits', () => {
    expect(negotiateLocale(['ja'], ['en', 'fr'], 'fr')).toBe('fr');
    expect(negotiateLocale(['*', 'EN_us'], ['en', 'fr'], 'fr')).toBe('fr');
  });

  it('prefers the fallback among equally good fits', () => {
    expect(negotiateLocale(['en-IN'], ['en-AU', 'en-NZ'], 'en-NZ')).toBe(
      'en-NZ',
    );
    expect(negotiateLocale(['en-IN'], ['en-AU', 'en-NZ'], 'en-AU')).toBe(
      'en-AU',
    );
  });

  it('ignores the order of the available locales', () => {
    expect(negotiateLocale(['en-IN'], ['en-AU', 'en-NZ'])).toBe(
      negotiateLocale(['en-IN'], ['en-NZ', 'en-AU']),
    );
  });

  it('matches a deprecated alias to the offered tag', () => {
    expect(negotiateLocale(['he'], ['en', 'iw'])).toBe('iw');
  });
});

describe('resolveLocale', () => {
  const available = ['en', 'es', 'zh-Hant'] as const;

  it('puts a choice ahead of the requested languages', () => {
    expect(
      resolveLocale({
        chosen: 'es',
        requested: ['en'],
        available,
        fallback: 'en',
      }),
    ).toEqual({ locale: 'es', source: 'chosen' });
  });

  it('matches a choice on its own when its exact tag is gone', () => {
    expect(
      resolveLocale({
        chosen: 'zh-TW',
        requested: ['en'],
        available,
        fallback: 'en',
      }),
    ).toEqual({ locale: 'zh-Hant', source: 'chosen' });
  });

  it.each([['ja'], ['EN_us'], [null], [undefined]])(
    'ignores the choice %s when nothing fits it',
    (chosen) => {
      expect(
        resolveLocale({
          chosen,
          requested: ['es-MX', 'en'],
          available,
          fallback: 'en',
        }),
      ).toEqual({ locale: 'es', source: 'negotiated' });
    },
  );

  it('falls back when nothing was chosen or requested', () => {
    expect(
      resolveLocale({ requested: ['*'], available, fallback: 'en' }),
    ).toEqual({ locale: 'en', source: 'default' });
  });

  it('is negotiated even when no requested language fits', () => {
    expect(
      resolveLocale({ requested: ['ja'], available, fallback: 'en' }),
    ).toEqual({ locale: 'en', source: 'negotiated' });
  });
});

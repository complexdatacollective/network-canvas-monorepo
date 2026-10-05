import { describe, expect, it } from 'vitest';

import {
  defineAppLocales,
  ecosystemLocales,
  mergeCatalogs,
  pseudoAppLocale,
} from '../locales.ts';

describe('defineAppLocales', () => {
  it('rejects non-canonical tags, duplicates, and empty labels', () => {
    expect(() =>
      defineAppLocales([{ locale: 'EN-gb', label: 'x', direction: 'ltr' }]),
    ).toThrow(/canonical/);
    expect(() =>
      defineAppLocales([
        { locale: 'en', label: 'English', direction: 'ltr' },
        { locale: 'en', label: 'English', direction: 'ltr' },
      ]),
    ).toThrow(/duplicate/);
    expect(() =>
      defineAppLocales([{ locale: 'en', label: '  ', direction: 'ltr' }]),
    ).toThrow(/empty label/);
  });
});

describe('ecosystemLocales', () => {
  it('opens with the English source locale and includes en-GB', () => {
    expect(ecosystemLocales[0]?.locale).toBe('en');
    expect(ecosystemLocales.map((entry) => entry.locale)).toContain('en-GB');
  });

  it('does not include the pseudo-locale', () => {
    expect(ecosystemLocales.map((entry) => entry.locale)).not.toContain(
      pseudoAppLocale.locale,
    );
  });
});

describe('mergeCatalogs', () => {
  it('merges later catalogs over earlier ones', () => {
    expect(
      mergeCatalogs({ 'a.x': 'one', 'a.y': 'keep' }, { 'a.x': 'two' }),
    ).toEqual({ 'a.x': 'two', 'a.y': 'keep' });
  });
});

import { describe, expect, it } from 'vitest';

import {
  getLocaleMetadata,
  type ResolvedLocalizedString,
} from '@codaco/protocol-validation';

import { toPresentationalText } from '../presentationalText';

const options = ['en', 'ar', 'und'].map((locale) => getLocaleMetadata(locale));

const resolved = (text: string, locale: string): ResolvedLocalizedString => ({
  text,
  locale,
  selectedLocale: locale,
  usedFallback: false,
  matchedBy: 'selected',
});

describe('toPresentationalText', () => {
  it('carries the language and direction the text is written in', () => {
    expect(toPresentationalText(resolved('مرحبا', 'ar'), options)).toEqual({
      text: 'مرحبا',
      lang: 'ar',
      dir: 'rtl',
    });
    expect(toPresentationalText(resolved('Hello', 'en'), options)).toEqual({
      text: 'Hello',
      lang: 'en',
      dir: 'ltr',
    });
  });

  it('leaves text in the unspecified language as a plain string', () => {
    expect(toPresentationalText(resolved('Hello', 'und'), options)).toBe(
      'Hello',
    );
  });

  it('refuses a language the options do not describe', () => {
    expect(() =>
      toPresentationalText(resolved('Bonjour', 'fr'), options),
    ).toThrow('No locale option describes "fr"');
  });
});

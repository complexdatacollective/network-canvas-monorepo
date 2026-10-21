import { describe, expect, it } from 'vitest';

import { resolveInterviewLocale } from '../locales';

describe('interview-owned interface locale negotiation', () => {
  it.each([
    [undefined, 'en'],
    [null, 'en'],
    ['', 'en'],
    ['en', 'en'],
    ['en-GB', 'en-GB'],
    ['en-US', 'en'],
    ['es', 'es'],
    ['es-MX', 'es'],
    ['es-AR', 'es'],
    [' ES-mx ', 'es'],
    ['pt-BR', 'pt-BR'],
    ['pt', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['pt-AO', 'pt-BR'],
    ['not_a_locale', 'en'],
    ['ar', 'en'],
    [['not_a_locale', 'ja', 'es-CO'], 'es'],
    [['en-GB', 'es'], 'en-GB'],
    [['es-MX', 'en'], 'es'],
    [['ar', 'zh-TW', 'en'], 'zh-Hant'],
  ] as const)('matches request %j to %s', (request, expected) => {
    expect(resolveInterviewLocale(request)).toBe(expected);
  });

  it('follows a stated protocol language the interface has, ahead of the browser', () => {
    expect(resolveInterviewLocale(['en-GB'], 'es')).toBe('es');
    expect(resolveInterviewLocale(['en-GB'], 'fr-CA')).toBe('fr');
    expect(resolveInterviewLocale(['en'], 'zh-Hant-TW')).toBe('zh-Hant');
  });

  it('negotiates from the browser alone without a stated preference', () => {
    expect(resolveInterviewLocale(['en-GB', 'es'], null)).toBe('en-GB');
    expect(resolveInterviewLocale(['de-AT'], undefined)).toBe('de');
  });

  it('falls through to the browser when the interface lacks the stated language', () => {
    expect(resolveInterviewLocale(['es'], 'ar')).toBe('es');
    expect(resolveInterviewLocale(['es'], 'not_a_locale')).toBe('es');
    expect(resolveInterviewLocale([], 'ar')).toBe('en');
  });
});

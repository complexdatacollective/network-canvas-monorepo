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
    ['not_a_locale', 'en'],
    ['ar', 'en'],
    [['not_a_locale', 'fr', 'es-CO'], 'es'],
    [['en-GB', 'es'], 'en-GB'],
  ] as const)('matches request %j to %s', (request, expected) => {
    expect(resolveInterviewLocale(request)).toBe(expected);
  });

  it('matches an explicit menu preference before the host request and can clear it', () => {
    expect(resolveInterviewLocale('en-GB', 'es')).toBe('es');
    expect(resolveInterviewLocale('en-GB', null)).toBe('en-GB');
    expect(resolveInterviewLocale('es', 'not_a_locale')).toBe('es');
  });
});

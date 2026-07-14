import { describe, expect, it } from 'vitest';

import { getLocaleCookie, getLocalizedPathname } from '~/lib/i18n/clientLocale';

describe('client locale selection', () => {
  it('builds locale-prefixed static paths with trailing slashes', () => {
    expect(getLocalizedPathname('en-GB', '/')).toBe('/en-GB/');
    expect(getLocalizedPathname('es', '/get-started')).toBe('/es/get-started/');
  });

  it.each([
    ['/es', 'en-GB', '/en-GB/'],
    ['/en-US/', 'es', '/es/'],
    ['/en-GB/get-started/', 'en-US', '/en-US/get-started/'],
    ['/en-gb/get-started', 'es', '/es/get-started/'],
  ] as const)(
    'replaces the locale prefix in %s with %s',
    (pathname, locale, expected) => {
      expect(getLocalizedPathname(locale, pathname)).toBe(expected);
    },
  );

  it('persists an explicit locale for one year', () => {
    expect(getLocaleCookie('en-US')).toBe(
      'NEXT_LOCALE=en-US; Path=/; Max-Age=31536000; SameSite=Lax',
    );
  });
});

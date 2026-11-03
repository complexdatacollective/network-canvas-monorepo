import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getLocaleCookies,
  getLocalizedPathname,
  readLocalePreference,
} from '~/lib/i18n/clientLocale';

describe('client locale selection', () => {
  afterEach(() => vi.restoreAllMocks());

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

  it('persists an explicit locale for one year on every Network Canvas website', () => {
    expect(
      getLocaleCookies('en-US', 'protocolgallery.networkcanvas.com'),
    ).toEqual([
      'NEXT_LOCALE=; Path=/; Max-Age=0; SameSite=Lax',
      'NEXT_LOCALE=en-US; Path=/; Domain=networkcanvas.com; Max-Age=31536000; SameSite=Lax',
    ]);
  });

  it('expires the preference so the edge negotiates again', () => {
    expect(getLocaleCookies(null, 'networkcanvas.com')).toEqual([
      'NEXT_LOCALE=; Path=/; Max-Age=0; SameSite=Lax',
      'NEXT_LOCALE=; Path=/; Domain=networkcanvas.com; Max-Age=0; SameSite=Lax',
    ]);
  });

  // A cookie store that ignores the host-only flag when matching (RFC 6265, as
  // jsdom's does) sees both cookies as one on the apex host.
  it.each(['networkcanvas.com', 'protocolgallery.networkcanvas.com'])(
    'keeps the choice in the cookie store on %s',
    (host) => {
      // Vitest's jsdom environment exposes its JSDOM instance.
      const { jsdom } = globalThis as unknown as {
        jsdom: { reconfigure: (options: { url: string }) => void };
      };
      const before = window.location.href;
      jsdom.reconfigure({ url: `https://${host}/` });
      try {
        document.cookie = 'NEXT_LOCALE=fr; Path=/';
        for (const cookie of getLocaleCookies('es', host)) {
          document.cookie = cookie;
        }
        expect(document.cookie).toBe('NEXT_LOCALE=es');
      } finally {
        for (const cookie of getLocaleCookies(null, host)) {
          document.cookie = cookie;
        }
        jsdom.reconfigure({ url: before });
      }
    },
  );

  it("keeps a deploy preview's choice to that preview", () => {
    expect(getLocaleCookies('es', 'deploy-preview-1--nc.netlify.app')).toEqual([
      'NEXT_LOCALE=es; Path=/; Max-Age=31536000; SameSite=Lax',
    ]);
  });

  it.each([
    ['NEXT_LOCALE=es', 'es'],
    ['other=1; NEXT_LOCALE=en-GB; another=2', 'en-GB'],
    ['other=1', null],
    ['NEXT_LOCALE=', null],
    ['NEXT_LOCALE=ja', null],
  ] as const)('reads %s as the preference %s', (cookie, expected) => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(cookie);
    expect(readLocalePreference()).toBe(expected);
  });
});

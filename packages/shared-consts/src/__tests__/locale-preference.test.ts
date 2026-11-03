import { describe, expect, it } from 'vitest';

import {
  readLocalePreferenceCookie,
  serializeLocalePreferenceCookies,
  webStorageLocalePreference,
} from '../locale-preference.ts';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};

describe('webStorageLocalePreference', () => {
  it('keeps, reads and forgets a choice under its own key', () => {
    const storage = memoryStorage();
    const app = webStorageLocalePreference(() => storage, 'app.locale');
    const interview = webStorageLocalePreference(() => storage, 'interview:1');

    expect(app.write('es')).toBe(true);
    expect(app.read()).toBe('es');
    expect(interview.read()).toBeNull();

    expect(app.write(null)).toBe(true);
    expect(app.read()).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it.each([
    [
      'refuses access',
      () => {
        throw new Error('SecurityError');
      },
    ],
    ['is missing', () => null],
  ])('reads nothing and reports a failed write when storage %s', (_, get) => {
    const store = webStorageLocalePreference(get, 'app.locale');
    expect(store.read()).toBeNull();
    expect(store.write('es')).toBe(false);
  });
});

describe('locale preference cookies', () => {
  const cookie = { name: 'site.locale', maxAge: 31_536_000 };

  it.each([
    ['site.locale=es', 'es'],
    ['other=1; site.locale=en-GB; another=2', 'en-GB'],
    ['other=1', null],
    ['site.locale=', null],
    ['', null],
    [null, null],
  ] as const)('reads %s as %s', (header, expected) => {
    expect(readLocalePreferenceCookie(cookie, header)).toBe(expected);
  });

  it('reads past an expired duplicate to the kept choice', () => {
    expect(
      readLocalePreferenceCookie(cookie, 'site.locale=; site.locale=es'),
    ).toBe('es');
  });

  it('keeps a choice for its max age, or expires it', () => {
    expect(serializeLocalePreferenceCookies(cookie, 'es')).toEqual([
      'site.locale=es; Path=/; Max-Age=31536000; SameSite=Lax',
    ]);
    expect(serializeLocalePreferenceCookies(cookie, null)).toEqual([
      'site.locale=; Path=/; Max-Age=0; SameSite=Lax',
    ]);
  });

  describe('shared by a domain', () => {
    const shared = { ...cookie, domain: 'example.org' };

    it.each(['example.org', 'docs.example.org', 'Gallery.Example.org:443'])(
      'keeps a choice made on %s for the whole domain',
      (host) => {
        expect(serializeLocalePreferenceCookies(shared, 'es', host)).toEqual([
          'site.locale=es; Path=/; Domain=example.org; Max-Age=31536000; SameSite=Lax',
          'site.locale=; Path=/; Max-Age=0; SameSite=Lax',
        ]);
      },
    );

    it('forgets the shared choice and the host-only one', () => {
      expect(
        serializeLocalePreferenceCookies(shared, null, 'docs.example.org'),
      ).toEqual([
        'site.locale=; Path=/; Domain=example.org; Max-Age=0; SameSite=Lax',
        'site.locale=; Path=/; Max-Age=0; SameSite=Lax',
      ]);
    });

    it.each(['preview--site.netlify.app', 'localhost:3000', 'notexample.org'])(
      'keeps a choice made on %s for that host alone',
      (host) => {
        expect(serializeLocalePreferenceCookies(shared, 'es', host)).toEqual([
          'site.locale=es; Path=/; Max-Age=31536000; SameSite=Lax',
        ]);
      },
    );
  });
});

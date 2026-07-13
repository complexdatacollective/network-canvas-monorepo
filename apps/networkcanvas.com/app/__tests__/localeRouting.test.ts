import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { getStaticLocaleParams, locales } from '~/lib/i18n/locales';
import { routing } from '~/lib/i18n/routing';
import localeProxy, { config } from '~/proxy';

type NegotiationCase = {
  name: string;
  headers: Record<string, string>;
  destination: string;
};

const negotiationCases: readonly NegotiationCase[] = [
  {
    name: 'Spain Spanish browser language',
    headers: { 'accept-language': 'es-ES,es;q=0.9,en;q=0.8' },
    destination: 'http://localhost/es',
  },
  {
    name: 'Mexican Spanish browser language',
    headers: { 'accept-language': 'es-MX,es;q=0.9,en;q=0.8' },
    destination: 'http://localhost/es',
  },
  {
    name: 'Argentinian Spanish browser language',
    headers: { 'accept-language': 'es-AR,es;q=0.9,en;q=0.8' },
    destination: 'http://localhost/es',
  },
  {
    name: 'US English fallback',
    headers: {},
    destination: 'http://localhost/en-US',
  },
  {
    name: 'saved UK English preference before Spanish browser language',
    headers: {
      'accept-language': 'es-ES,es;q=0.9',
      'cookie': 'nf_lang=en-GB',
    },
    destination: 'http://localhost/en-GB',
  },
  {
    name: 'UK English browser language',
    headers: { 'accept-language': 'en-GB,en;q=0.9' },
    destination: 'http://localhost/en-GB',
  },
  {
    name: 'Australian English browser language',
    headers: { 'accept-language': 'en-AU,en;q=0.9' },
    destination: 'http://localhost/en-GB',
  },
  {
    name: 'Canadian English browser language',
    headers: { 'accept-language': 'en-CA,en;q=0.9' },
    destination: 'http://localhost/en-US',
  },
];

describe('locale routing', () => {
  it('generates US English, UK English, and Spanish static params', () => {
    expect(locales).toEqual(['en-US', 'en-GB', 'es']);
    expect(getStaticLocaleParams()).toEqual([
      { locale: 'en-US' },
      { locale: 'en-GB' },
      { locale: 'es' },
    ]);
  });

  it('always prefixes routes and defaults to US English', () => {
    expect(routing.defaultLocale).toBe('en-US');
    expect(routing.localePrefix).toBe('always');
    expect(routing.localeDetection).toBe(true);
    expect(routing.localeCookie).toMatchObject({
      name: 'nf_lang',
      maxAge: 31_536_000,
      sameSite: 'lax',
    });
  });

  it.each(negotiationCases)('negotiates $name', ({ headers, destination }) => {
    const response = localeProxy(
      new NextRequest('http://localhost/', { headers }),
    );

    expect(response.headers.get('location')).toBe(destination);
  });

  it('normalizes the cited legacy download.html route before negotiation', () => {
    const response = localeProxy(
      new NextRequest('http://localhost/download.html', {
        headers: { 'accept-language': 'es-ES,es;q=0.9' },
      }),
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost/es/download',
    );
  });

  it('matches page routes while excluding framework and asset requests', () => {
    expect(config.matcher).toEqual([
      '/download.html',
      '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
    ]);

    const matcher = new RegExp(`^${config.matcher[1]}$`);
    expect(
      ['/', '/download', '/get-started'].every((pathname) =>
        matcher.test(pathname),
      ),
    ).toBe(true);
    expect(
      ['/_next/static/app.js', '/images/logo.svg'].some((pathname) =>
        matcher.test(pathname),
      ),
    ).toBe(false);
  });
});

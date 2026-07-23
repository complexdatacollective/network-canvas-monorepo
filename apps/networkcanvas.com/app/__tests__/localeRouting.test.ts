import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getStaticLocaleParams, locales } from '~/lib/i18n/locales';
import { routing } from '~/lib/i18n/routing';
import {
  config,
  detectLocale,
  getLocaleRedirect,
} from '~/netlify/edge-functions/locale';

type NegotiationCase = {
  name: string;
  headers: Record<string, string>;
  savedLocale?: string;
  destination: string;
};

type EdgeImportMap = {
  imports: Record<string, string>;
};

const edgeImportMapPath = resolve(process.cwd(), 'netlify/import-map.json');

const negotiationCases: readonly NegotiationCase[] = [
  {
    name: 'Spain Spanish browser language',
    headers: { 'accept-language': 'es-ES,es;q=0.9,en;q=0.8' },
    destination: 'http://localhost/es/',
  },
  {
    name: 'Mexican Spanish browser language',
    headers: { 'accept-language': 'es-MX,es;q=0.9,en;q=0.8' },
    destination: 'http://localhost/es/',
  },
  {
    name: 'Argentinian Spanish browser language',
    headers: { 'accept-language': 'es-AR,es;q=0.9,en;q=0.8' },
    destination: 'http://localhost/es/',
  },
  {
    name: 'US English fallback',
    headers: {},
    destination: 'http://localhost/en-US/',
  },
  {
    name: 'saved UK English preference before Spanish browser language',
    headers: { 'accept-language': 'es-ES,es;q=0.9' },
    savedLocale: 'en-GB',
    destination: 'http://localhost/en-GB/',
  },
  {
    name: 'UK English browser language',
    headers: { 'accept-language': 'en-GB,en;q=0.9' },
    destination: 'http://localhost/en-GB/',
  },
  {
    name: 'Australian English browser language',
    headers: { 'accept-language': 'en-AU,en;q=0.9' },
    destination: 'http://localhost/en-GB/',
  },
  {
    name: 'Canadian English browser language',
    headers: { 'accept-language': 'en-CA,en;q=0.9' },
    destination: 'http://localhost/en-US/',
  },
];

describe('locale routing', () => {
  it('maps the shared locale definition into the Netlify edge graph', () => {
    const importMap = JSON.parse(
      readFileSync(edgeImportMapPath, 'utf8'),
    ) as EdgeImportMap;
    const sharedLocalesTarget = importMap.imports['@codaco/shared-consts'];
    if (!sharedLocalesTarget) {
      throw new Error('Missing shared locale entry in the edge import map');
    }

    expect(sharedLocalesTarget).toBe(
      '../../../packages/shared-consts/src/site-locales.ts',
    );
    expect(
      existsSync(resolve(dirname(edgeImportMapPath), sharedLocalesTarget)),
    ).toBe(true);
  });

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
      name: 'NEXT_LOCALE',
      maxAge: 31_536_000,
      sameSite: 'lax',
    });
  });

  it.each(negotiationCases)(
    'negotiates $name',
    ({ headers, savedLocale, destination }) => {
      const request = new Request('http://localhost/', { headers });

      expect(detectLocale(request, savedLocale)).toBe(
        new URL(destination).pathname.split('/')[1],
      );
      expect(getLocaleRedirect(request, savedLocale)?.toString()).toBe(
        destination,
      );
    },
  );

  it('normalizes the cited legacy download.html route before negotiation', () => {
    const redirect = getLocaleRedirect(
      new Request('http://localhost/download.html', {
        headers: { 'accept-language': 'es-ES,es;q=0.9' },
      }),
    );

    expect(redirect?.toString()).toBe('http://localhost/es/get-started/');
  });

  it.each(locales)('preserves the %s locale for legacy downloads', (locale) => {
    const redirect = getLocaleRedirect(
      new Request(`http://localhost/${locale}/download`),
    );

    expect(redirect?.toString()).toBe(
      `http://localhost/${locale}/get-started/`,
    );
  });

  it('negotiates and preserves localized announcement routes', () => {
    expect(
      getLocaleRedirect(
        new Request('http://localhost/summer-2026-update', {
          headers: { 'accept-language': 'es-ES,es;q=0.9' },
        }),
      )?.toString(),
    ).toBe('http://localhost/es/summer-2026-update/');
    expect(
      getLocaleRedirect(
        new Request('http://localhost/summer-2026-update/'),
        'es',
      )?.toString(),
    ).toBe('http://localhost/es/summer-2026-update/');
    expect(
      getLocaleRedirect(
        new Request('http://localhost/es/summer-2026-update/'),
      )?.toString(),
    ).toBeUndefined();
  });

  it('recognizes locale paths after Netlify normalizes their casing', () => {
    expect(
      getLocaleRedirect(new Request('http://localhost/en-us/get-started/')),
    ).toBeUndefined();
    expect(
      getLocaleRedirect(new Request('http://localhost/en-gb/get-started/')),
    ).toBeUndefined();
  });

  it('runs for all paths while bypassing localized routes and assets', () => {
    expect(config.path).toBe('/*');
    expect(
      getLocaleRedirect(new Request('http://localhost/en-US/get-started/')),
    ).toBeUndefined();
    expect(
      getLocaleRedirect(new Request('http://localhost/_next/static/app.js')),
    ).toBeUndefined();
    expect(
      getLocaleRedirect(new Request('http://localhost/images/logo.svg')),
    ).toBeUndefined();
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { siteLocalePreferenceCookie } from '@codaco/shared-consts';
import { sections } from '~/app/types';

import localeRedirect, { config, detectLocale } from '../locale';

type EdgeImportMap = { imports: Record<string, string> };

const edgeImportMapPath = resolve(process.cwd(), 'netlify/import-map.json');

const request = (
  headers: Record<string, string> = {},
  url = 'https://documentation.networkcanvas.com/',
) => new Request(url, { headers });

describe('documentation locale edge function', () => {
  it('runs for the site root and every section, with and without a page', () => {
    expect(config.path).toEqual([
      '/',
      ...sections.flatMap((section) => [`/${section}`, `/${section}/*`]),
    ]);
  });

  it.each([
    ['an English browser', 'en-US,en;q=0.9'],
    ['a British English browser', 'en-GB'],
    ['a Spanish browser that also reads English', 'es-ES,es;q=0.9,en;q=0.8'],
    ['a browser in a language the documentation lacks', 'de-DE,de;q=0.9'],
    ['a browser that sends no languages', undefined],
    ['a malformed header', ';;;,q=2'],
  ])('sends %s to English, the only documentation language', (_, header) => {
    const headers: Record<string, string> =
      header === undefined ? {} : { 'accept-language': header };
    expect(detectLocale(request(headers))).toBe('en');
  });

  it('reads the language chosen on any Network Canvas website', () => {
    expect(
      detectLocale(
        request({
          'cookie': `theme=dark; ${siteLocalePreferenceCookie.name}=en-GB`,
          'accept-language': 'es',
        }),
      ),
    ).toBe('en');
  });

  it('negotiates the browser languages when the chosen language is not offered', () => {
    expect(
      detectLocale(
        request({
          'cookie': `${siteLocalePreferenceCookie.name}=zh-Hant`,
          'accept-language': 'fr-FR,en;q=0.5',
        }),
      ),
    ).toBe('en');
  });

  it('redirects the root temporarily, keeping the query string', () => {
    const response = localeRedirect(
      request(
        { 'accept-language': 'en-US' },
        'https://documentation.networkcanvas.com/?utm_source=architect',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://documentation.networkcanvas.com/en?utm_source=architect',
    );
  });

  it.each([
    [
      '/design-protocols/interface-documentation/network-composer',
      '/en/design-protocols/interface-documentation/network-composer',
    ],
    ['/get-started', '/en/get-started'],
    [
      '/analyze-data/data-export?ref=fresco',
      '/en/analyze-data/data-export?ref=fresco',
    ],
  ])('adds the language to %s, keeping the rest of the address', (from, to) => {
    const response = localeRedirect(
      request(
        { 'accept-language': 'en-US' },
        `https://documentation.networkcanvas.com${from}`,
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `https://documentation.networkcanvas.com${to}`,
    );
  });

  // Netlify fetches remote import-map targets when it bundles the edge
  // function, outside the lockfile's integrity checks. npm packages must
  // resolve from node_modules instead.
  it('maps edge imports only to files in the repository', () => {
    const importMap = JSON.parse(
      readFileSync(edgeImportMapPath, 'utf8'),
    ) as EdgeImportMap;

    expect(importMap.imports['@codaco/shared-consts']).toBe(
      '../../../packages/shared-consts/src/site-locales.ts',
    );
    for (const target of Object.values(importMap.imports)) {
      expect(target).toMatch(/^\.\.?\//);
      expect(existsSync(resolve(dirname(edgeImportMapPath), target))).toBe(
        true,
      );
    }
  });
});

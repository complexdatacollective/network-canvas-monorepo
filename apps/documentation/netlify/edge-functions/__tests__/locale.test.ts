import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { siteLocalePreferenceCookie } from '@codaco/shared-consts';

import localeRedirect, { config, detectLocale } from '../locale';

type EdgeImportMap = { imports: Record<string, string> };

const edgeImportMapPath = resolve(process.cwd(), 'netlify/import-map.json');

const origin = 'https://documentation.networkcanvas.com';

// Requests `path` from a site that answers each address in `answers` with its
// status and every other address with 404 — both as the rest of Netlify's
// chain (`context.next()`) and when the edge function fetches an address.
const visit = async (
  path: string,
  answers: Record<string, number> = {},
  headers: Record<string, string> = { 'accept-language': 'en-US' },
) => {
  const answer = (url: URL) =>
    new Response(null, { status: answers[url.pathname] ?? 404 });
  const fetch = vi.fn((url: URL) => Promise.resolve(answer(url)));
  vi.stubGlobal('fetch', fetch);
  const url = new URL(path, origin);
  const next = vi.fn(() => Promise.resolve(answer(url)));
  const response = await localeRedirect(new Request(url, { headers }), {
    next,
  });
  return { response, next, fetch };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = (
  headers: Record<string, string> = {},
  url = 'https://documentation.networkcanvas.com/',
) => new Request(url, { headers });

describe('documentation locale edge function', () => {
  it.each([
    '/',
    '/design-protocols/interface-documentation/network-composer',
    '/asd/get-started',
    '/en/get-started/',
  ])('runs for the page address %s', (path) => {
    expect(new RegExp(String(config.pattern)).test(path)).toBe(true);
  });

  it.each([
    '/images/mark.svg',
    '/_next/static/chunks/main.js',
    '/sitemap.xml',
    '/protocols/sample.netcanvas',
  ])('never runs for the file %s', (path) => {
    expect(new RegExp(String(config.pattern)).test(path)).toBe(false);
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

  it('redirects the root temporarily, keeping the query string', async () => {
    const { response, next } = await visit('/?utm_source=architect');

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe(
      `${origin}/en?utm_source=architect`,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('leaves alone an address that starts with a documentation language', async () => {
    const { response, next } = await visit('/en/no-such-page');

    expect(response).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['a file without an extension', '/algolia-logo', 200],
    ['an old address netlify.toml redirects', '/faq', 301],
  ])('passes on what the site answers for %s', async (_, path, status) => {
    const { response, fetch } = await visit(path, { [path]: status });

    expect(response?.status).toBe(status);
    expect(response?.headers.get('location')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      '/design-protocols/interface-documentation/network-composer',
      '/en/design-protocols/interface-documentation/network-composer',
    ],
    [
      '/asd/design-protocols/interface-documentation/network-composer',
      '/en/design-protocols/interface-documentation/network-composer',
    ],
    [
      '/analyze-data/data-export?ref=fresco',
      '/en/analyze-data/data-export?ref=fresco',
    ],
    ['/asd', '/en'],
    // A page that moved still counts: its old address redirects to it.
    [
      '/design-protocols/key-concepts/preview-mode',
      '/en/design-protocols/key-concepts/preview-mode',
    ],
    // Neither address is a page, so the reader sees "not found" in English.
    ['/asd/no-such-page', '/en/asd/no-such-page'],
  ])('sends %s to %s', async (from, to) => {
    const { response } = await visit(from, {
      '/en': 200,
      '/en/design-protocols/interface-documentation/network-composer': 200,
      '/en/analyze-data/data-export': 200,
      '/en/design-protocols/key-concepts/preview-mode': 301,
    });

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe(`${origin}${to}`);
  });

  it('asks the site about candidate pages without following redirects', async () => {
    const { fetch } = await visit('/asd/x');

    expect(fetch).toHaveBeenCalledWith(new URL(`${origin}/en/asd/x`), {
      method: 'HEAD',
      redirect: 'manual',
    });
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

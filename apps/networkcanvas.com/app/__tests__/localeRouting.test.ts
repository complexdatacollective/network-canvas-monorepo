import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { Context } from '@netlify/edge-functions';
import { describe, expect, it, vi } from 'vitest';

import { getStaticLocaleParams, locales } from '~/lib/i18n/locales';
import { routing } from '~/lib/i18n/routing';
import { loadProtocolGallery } from '~/lib/protocolGallery';
import localeRedirect, {
  config,
  detectLocale,
  getConfiguredGalleryHost,
  getGalleryCanonicalRedirect,
  getGalleryLegacyRedirect,
  getGalleryRewrite,
  getLocaleRedirect,
  isProtocolGalleryHost,
  legacyGallerySlugs,
} from '~/netlify/edge-functions/locale';

const galleryOrigin = 'https://protocolgallery.networkcanvas.com';

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

  it('negotiates protocol gallery index and detail routes', () => {
    expect(
      getLocaleRedirect(
        new Request('http://localhost/protocol-gallery', {
          headers: { 'accept-language': 'es-ES,es;q=0.9' },
        }),
      )?.toString(),
    ).toBe('http://localhost/es/protocol-gallery/');
    expect(
      getLocaleRedirect(
        new Request('http://localhost/protocol-gallery/test-to-prep'),
        'en-GB',
      )?.toString(),
    ).toBe('http://localhost/en-GB/protocol-gallery/test-to-prep/');
    expect(
      getLocaleRedirect(
        new Request('http://localhost/es/protocol-gallery/test-to-prep/'),
      ),
    ).toBeUndefined();
  });

  describe('protocol gallery host', () => {
    it('recognizes only the gallery subdomain', () => {
      expect(isProtocolGalleryHost('protocolgallery.networkcanvas.com')).toBe(
        true,
      );
      expect(isProtocolGalleryHost('networkcanvas.com')).toBe(false);
    });

    it('also recognises a configured gallery origin, so its short URLs resolve', () => {
      expect(getConfiguredGalleryHost('https://gallery.example.test')).toBe(
        'gallery.example.test',
      );
      expect(getConfiguredGalleryHost(undefined)).toBeUndefined();
      expect(getConfiguredGalleryHost('not a url')).toBeUndefined();

      expect(
        isProtocolGalleryHost('gallery.example.test', 'gallery.example.test'),
      ).toBe(true);
      expect(
        isProtocolGalleryHost(
          'protocolgallery.networkcanvas.com',
          'gallery.example.test',
        ),
      ).toBe(true);
      expect(isProtocolGalleryHost('gallery.example.test', undefined)).toBe(
        false,
      );
    });

    it('negotiates a locale before anything is rewritten', () => {
      expect(
        getLocaleRedirect(
          new Request(`${galleryOrigin}/`, {
            headers: { 'accept-language': 'es-ES,es;q=0.9' },
          }),
        )?.toString(),
      ).toBe(`${galleryOrigin}/es/`);
      expect(
        getLocaleRedirect(
          new Request(`${galleryOrigin}/gate/`),
          'en-GB',
        )?.toString(),
      ).toBe(`${galleryOrigin}/en-GB/gate/`);
    });

    it('inserts the exported route prefix after the locale segment', () => {
      expect(
        getGalleryRewrite(new URL(`${galleryOrigin}/en-US/`))?.toString(),
      ).toBe(`${galleryOrigin}/en-US/protocol-gallery/`);
      expect(
        getGalleryRewrite(new URL(`${galleryOrigin}/en-US`))?.toString(),
      ).toBe(`${galleryOrigin}/en-US/protocol-gallery/`);
      expect(
        getGalleryRewrite(new URL(`${galleryOrigin}/es/gate/`))?.toString(),
      ).toBe(`${galleryOrigin}/es/protocol-gallery/gate/`);
    });

    it('maps the RSC payloads the client router fetches', () => {
      for (const payload of [
        'index.txt',
        '__next._full.txt',
        '__next._tree.txt',
        '__next.$d$locale.txt',
      ]) {
        expect(
          getGalleryRewrite(
            new URL(`${galleryOrigin}/en-US/gate/${payload}`),
          )?.toString(),
        ).toBe(`${galleryOrigin}/en-US/protocol-gallery/gate/${payload}`);
      }
    });

    it('leaves shared site-root assets alone', () => {
      for (const pathname of [
        '/_next/static/app.js',
        '/images/logo.svg',
        '/protocols/protocol-gallery/gate/gate.netcanvas',
        '/videos/intro.mp4',
        '/downloads/classic/architect/6.6.0/apple-silicon',
      ]) {
        expect(
          getGalleryRewrite(new URL(`${galleryOrigin}${pathname}`)),
        ).toBeUndefined();
      }
    });

    it('sends the exported route to its short form', () => {
      expect(
        getGalleryCanonicalRedirect(
          new URL(`${galleryOrigin}/en-US/protocol-gallery`),
        )?.toString(),
      ).toBe(`${galleryOrigin}/en-US/`);
      expect(
        getGalleryCanonicalRedirect(
          new URL(`${galleryOrigin}/en-US/protocol-gallery/`),
        )?.toString(),
      ).toBe(`${galleryOrigin}/en-US/`);
      expect(
        getGalleryCanonicalRedirect(
          new URL(`${galleryOrigin}/es/protocol-gallery/gate/?q=1#downloads`),
        )?.toString(),
      ).toBe(`${galleryOrigin}/es/gate/?q=1#downloads`);
      expect(
        getGalleryCanonicalRedirect(new URL(`${galleryOrigin}/es/gate/`)),
      ).toBeUndefined();
      expect(
        getGalleryCanonicalRedirect(
          new URL(`${galleryOrigin}/es/protocol-gallery-archive/`),
        ),
      ).toBeUndefined();
    });

    it('redirects the legacy author-list URLs to their gallery slugs', () => {
      expect(
        getGalleryLegacyRedirect(
          new URL(
            `${galleryOrigin}/protocol/oser-c-batty-e-booty-m-eddens-k-knudsen-h-perry-b-rockett-m-staton-m`,
          ),
          'en-US',
        )?.toString(),
      ).toBe(`${galleryOrigin}/en-US/gate/`);
      expect(
        getGalleryLegacyRedirect(
          new URL(
            `${galleryOrigin}/protocol/manderson-l-brear-m-rusere-f-farrell-m-g%C3%B3mez-oliv%C3%A9-f-berkman-l-kahn-k-harling-g/`,
          ),
          'es',
        )?.toString(),
      ).toBe(`${galleryOrigin}/es/kaya/`);
    });

    it('maps every legacy URL onto a study in the gallery', async () => {
      const slugs = new Set(
        (await loadProtocolGallery()).map((protocol) => protocol.slug),
      );

      expect(
        Object.values(legacyGallerySlugs).filter((slug) => !slugs.has(slug)),
      ).toEqual([]);
    });

    it('leaves unknown legacy URLs to the ordinary 404', () => {
      expect(
        getGalleryLegacyRedirect(
          new URL(`${galleryOrigin}/protocol/nobody-a`),
          'en-US',
        ),
      ).toBeUndefined();
      expect(
        getGalleryLegacyRedirect(new URL(`${galleryOrigin}/gate/`), 'en-US'),
      ).toBeUndefined();
    });
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
    expect(
      getLocaleRedirect(
        new Request(
          'http://localhost/downloads/classic/architect/6.6.0/apple-silicon',
        ),
      ),
    ).toBeUndefined();
  });
});

describe('edge handler', () => {
  // Only the members the handler reaches for; the rest of Netlify's Context
  // is irrelevant to routing.
  const makeContext = () => {
    const next = vi.fn(async () => new Response('next'));
    const rewrite = vi.fn(
      async (url: string | URL) =>
        new Response(null, { headers: { 'x-rewrite': String(url) } }),
    );
    const context = {
      cookies: { get: () => undefined },
      next,
      rewrite,
    };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return { context: context as unknown as Context, next, rewrite };
  };

  it('rewrites localized gallery paths through the platform, not by returning a URL', async () => {
    const { context, next, rewrite } = makeContext();

    const response = await localeRedirect(
      new Request(`${galleryOrigin}/en-US/gate/`),
      context,
    );

    expect(response).toBeInstanceOf(Response);
    expect(rewrite).toHaveBeenCalledTimes(1);
    expect(String(rewrite.mock.calls[0]?.[0])).toBe(
      `${galleryOrigin}/en-US/protocol-gallery/gate/`,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('continues normally off the gallery host', async () => {
    const { context, next, rewrite } = makeContext();

    await localeRedirect(
      new Request('https://networkcanvas.com/en-US/get-started/'),
      context,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(rewrite).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  documentationUrl,
  protocolGalleryHref,
  protocolGalleryUrl,
  resolveWebsiteNavigationUrl,
} from '../siteUrls';

const galleryOrigin = 'https://protocolgallery.networkcanvas.com';

describe('website site URLs', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the canonical documentation site when no override is configured', () => {
    expect(documentationUrl('/en/get-started')).toBe(
      'https://documentation.networkcanvas.com/en/get-started',
    );
  });

  it('builds documentation links against the configured deployment', () => {
    vi.stubEnv('NEXT_PUBLIC_DOCUMENTATION_URL', 'http://localhost:3000');

    expect(documentationUrl('/en/get-started?from=website#overview')).toBe(
      'http://localhost:3000/en/get-started?from=website#overview',
    );
  });

  it('rewrites the shared navigation documentation destination', () => {
    vi.stubEnv('NEXT_PUBLIC_DOCUMENTATION_URL', 'http://localhost:3000');

    expect(
      resolveWebsiteNavigationUrl(
        'https://documentation.networkcanvas.com/en',
        'en-US',
      ),
    ).toBe('http://localhost:3000/en');
  });

  it('keeps canonical self-links inside the active website deployment', () => {
    expect(
      resolveWebsiteNavigationUrl(
        'https://networkcanvas.com/get-started#architect-classic-downloads',
        'en-US',
      ),
    ).toBe('/get-started#architect-classic-downloads');
  });

  it('resolves the shared navigation protocol gallery destination locally when no subdomain is configured', () => {
    expect(resolveWebsiteNavigationUrl(`${galleryOrigin}/`, 'en-US')).toBe(
      '/protocol-gallery',
    );
  });

  it('keeps the gallery on this site when no subdomain is configured', () => {
    expect(protocolGalleryHref('en-US')).toBe('/en-US/protocol-gallery/');
    expect(protocolGalleryHref('es', 'gate')).toBe(
      '/es/protocol-gallery/gate/',
    );
    expect(protocolGalleryUrl('en-GB', 'gate')).toBe(
      'https://networkcanvas.com/en-GB/protocol-gallery/gate/',
    );
  });

  describe('with the gallery subdomain configured', () => {
    beforeEach(() =>
      vi.stubEnv('NEXT_PUBLIC_PROTOCOL_GALLERY_URL', galleryOrigin),
    );

    it('drops the route prefix from same-host gallery links', () => {
      expect(protocolGalleryHref('en-US')).toBe('/en-US/');
      expect(protocolGalleryHref('es', 'gate')).toBe('/es/gate/');
    });

    it('builds canonicals against the gallery origin', () => {
      expect(protocolGalleryUrl('en-GB')).toBe(`${galleryOrigin}/en-GB/`);
      expect(protocolGalleryUrl('en-GB', 'gate')).toBe(
        `${galleryOrigin}/en-GB/gate/`,
      );
    });

    it('carries the locale onto the gallery origin from either host', () => {
      expect(resolveWebsiteNavigationUrl(`${galleryOrigin}/`, 'es')).toBe(
        `${galleryOrigin}/es/`,
      );
      expect(
        resolveWebsiteNavigationUrl(
          `${galleryOrigin}/`,
          'en-GB',
          'protocolGallery',
        ),
      ).toBe(`${galleryOrigin}/en-GB/`);
    });

    it('localizes website destinations when leaving the gallery host', () => {
      const href =
        'https://networkcanvas.com/get-started#architect-classic-downloads';

      expect(resolveWebsiteNavigationUrl(href, 'es', 'protocolGallery')).toBe(
        'https://networkcanvas.com/es/get-started/#architect-classic-downloads',
      );
      expect(resolveWebsiteNavigationUrl(href, 'es')).toBe(
        '/get-started#architect-classic-downloads',
      );
    });

    it("sends the navigation's site-relative destinations back to the website with the locale", () => {
      expect(resolveWebsiteNavigationUrl('/', 'es', 'protocolGallery')).toBe(
        'https://networkcanvas.com/es/',
      );
      expect(
        resolveWebsiteNavigationUrl('/get-started', 'en-GB', 'protocolGallery'),
      ).toBe('https://networkcanvas.com/en-GB/get-started/');
      expect(resolveWebsiteNavigationUrl('/get-started', 'es')).toBe(
        '/get-started',
      );
    });

    it('rejects a configured gallery URL that is not an origin', () => {
      vi.stubEnv('NEXT_PUBLIC_PROTOCOL_GALLERY_URL', `${galleryOrigin}/en-US`);

      expect(() => protocolGalleryHref('en-US')).toThrow(/must be an origin/);
    });
  });

  it('does not rewrite relative, subdomain, or third-party links', () => {
    vi.stubEnv('NEXT_PUBLIC_DOCUMENTATION_URL', 'http://localhost:3000');

    expect(resolveWebsiteNavigationUrl('/get-started', 'en-US')).toBe(
      '/get-started',
    );
    expect(
      resolveWebsiteNavigationUrl(
        'https://community.networkcanvas.com/',
        'en-US',
      ),
    ).toBe('https://community.networkcanvas.com/');
    expect(resolveWebsiteNavigationUrl('https://example.com/', 'en-US')).toBe(
      'https://example.com/',
    );
  });

  it('rejects a configured URL that is not an origin', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_DOCUMENTATION_URL',
      'https://documentation.networkcanvas.dev/en',
    );

    expect(() => documentationUrl('/en')).toThrow(/must be an origin/);
  });
});

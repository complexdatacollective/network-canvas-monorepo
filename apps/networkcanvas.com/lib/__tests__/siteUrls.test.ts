import { afterEach, describe, expect, it, vi } from 'vitest';

import { documentationUrl, resolveWebsiteNavigationUrl } from '../siteUrls';

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
      resolveWebsiteNavigationUrl('https://documentation.networkcanvas.com/en'),
    ).toBe('http://localhost:3000/en');
  });

  it('keeps canonical self-links inside the active website deployment', () => {
    expect(
      resolveWebsiteNavigationUrl(
        'https://networkcanvas.com/get-started#architect-classic-downloads',
      ),
    ).toBe('/get-started#architect-classic-downloads');
  });

  it('does not rewrite relative, subdomain, or third-party links', () => {
    vi.stubEnv('NEXT_PUBLIC_DOCUMENTATION_URL', 'http://localhost:3000');

    expect(resolveWebsiteNavigationUrl('/get-started')).toBe('/get-started');
    expect(
      resolveWebsiteNavigationUrl('https://community.networkcanvas.com/'),
    ).toBe('https://community.networkcanvas.com/');
    expect(resolveWebsiteNavigationUrl('https://example.com/')).toBe(
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

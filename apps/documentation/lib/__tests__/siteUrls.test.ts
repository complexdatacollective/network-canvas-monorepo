import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveNetworkCanvasUrl } from '../siteUrls';

describe('documentation site URLs', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the canonical website when no override is configured', () => {
    expect(resolveNetworkCanvasUrl('https://networkcanvas.com/')).toBe(
      'https://networkcanvas.com/',
    );
  });

  it('rewrites website links to the configured deployment', () => {
    vi.stubEnv('NEXT_PUBLIC_NETWORK_CANVAS_URL', 'http://localhost:3001');

    expect(
      resolveNetworkCanvasUrl(
        'https://networkcanvas.com/get-started?from=docs#collect',
      ),
    ).toBe('http://localhost:3001/get-started?from=docs#collect');
  });

  it('canonicalizes the legacy download path for local development', () => {
    vi.stubEnv('NEXT_PUBLIC_NETWORK_CANVAS_URL', 'http://localhost:3001');

    expect(resolveNetworkCanvasUrl('https://networkcanvas.com/download')).toBe(
      'http://localhost:3001/get-started',
    );
  });

  it('does not rewrite relative, subdomain, or third-party links', () => {
    vi.stubEnv('NEXT_PUBLIC_NETWORK_CANVAS_URL', 'http://localhost:3001');

    expect(resolveNetworkCanvasUrl('/en/get-started')).toBe('/en/get-started');
    expect(
      resolveNetworkCanvasUrl('https://community.networkcanvas.com/'),
    ).toBe('https://community.networkcanvas.com/');
    expect(resolveNetworkCanvasUrl('https://example.com/')).toBe(
      'https://example.com/',
    );
  });

  it('rejects a configured URL that is not an origin', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_NETWORK_CANVAS_URL',
      'https://networkcanvas.dev/en-US',
    );

    expect(() => resolveNetworkCanvasUrl('https://networkcanvas.com/')).toThrow(
      /must be an origin/,
    );
  });
});

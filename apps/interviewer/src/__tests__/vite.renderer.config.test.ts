import { afterEach, describe, expect, it, vi } from 'vitest';

import { CSP_DIRECTIVES } from '../../vite.renderer.config';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('production content security policy', () => {
  it('only permits scripts bundled with the app', () => {
    expect(CSP_DIRECTIVES).toContain("script-src 'self'");
  });

  it('permits fetching protocol asset object URLs', () => {
    expect(CSP_DIRECTIVES).toContain(
      "connect-src 'self' https://api.github.com https://api.mapbox.com https://events.mapbox.com https://ph-relay.networkcanvas.com blob:",
    );
  });

  // Interviewer 9 frames the /v8/ build from its own origin; nothing frames
  // the root build, and nothing but the same origin frames either.
  it.each([
    ['', "frame-ancestors 'none'"],
    ['/v8/', "frame-ancestors 'self'"],
  ])('lets a build under "%s" be framed only by %s', async (base, rule) => {
    vi.stubEnv('INTERVIEWER_BASE_PATH', base);
    vi.resetModules();
    const { CSP_DIRECTIVES: directives } =
      await import('../../vite.renderer.config');
    expect(directives.filter((d) => d.startsWith('frame-ancestors'))).toEqual([
      rule,
    ]);
  });
});

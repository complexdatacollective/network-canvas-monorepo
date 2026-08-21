import { describe, expect, it } from 'vitest';

import { CSP_DIRECTIVES } from '../../vite.renderer.config';

describe('production content security policy', () => {
  it('permits scripts from the controlled PostHog relay', () => {
    expect(CSP_DIRECTIVES).toContain(
      "script-src 'self' https://ph-relay.networkcanvas.com",
    );
  });

  it('permits fetching protocol asset object URLs', () => {
    expect(CSP_DIRECTIVES).toContain(
      "connect-src 'self' https://api.github.com https://api.mapbox.com https://events.mapbox.com https://ph-relay.networkcanvas.com blob:",
    );
  });
});

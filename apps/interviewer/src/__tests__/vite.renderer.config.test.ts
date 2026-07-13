import { describe, expect, it } from 'vitest';

import { CSP_DIRECTIVES } from '../../vite.renderer.config';

describe('production content security policy', () => {
  it('permits fetching protocol asset object URLs', () => {
    expect(CSP_DIRECTIVES).toContain(
      "connect-src 'self' https://api.github.com https://api.mapbox.com https://events.mapbox.com https://ph-relay.networkcanvas.com blob:",
    );
  });
});

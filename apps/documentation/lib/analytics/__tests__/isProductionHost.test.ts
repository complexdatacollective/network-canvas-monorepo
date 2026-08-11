import { describe, expect, it } from 'vitest';

import { isProductionHost } from '../isProductionHost';

describe('isProductionHost', () => {
  it('accepts the live documentation site', () => {
    expect(isProductionHost('documentation.networkcanvas.com')).toBe(true);
  });

  it('rejects deploy previews, the dev site, and local development', () => {
    expect(
      isProductionHost('deploy-preview-42--documentation-dev.netlify.app'),
    ).toBe(false);
    expect(isProductionHost('documentation-dev.netlify.app')).toBe(false);
    expect(isProductionHost('localhost')).toBe(false);
  });

  it('rejects a look-alike host that merely contains the domain', () => {
    expect(isProductionHost('evil-documentation.networkcanvas.com')).toBe(
      false,
    );
    expect(
      isProductionHost('documentation.networkcanvas.com.example.org'),
    ).toBe(false);
  });
});

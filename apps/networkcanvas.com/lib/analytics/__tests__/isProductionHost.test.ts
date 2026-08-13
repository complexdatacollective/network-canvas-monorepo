import { describe, expect, it } from 'vitest';

import { isProductionHost } from '../isProductionHost';

describe('isProductionHost', () => {
  it('accepts the live site', () => {
    expect(isProductionHost('networkcanvas.com')).toBe(true);
    expect(isProductionHost('www.networkcanvas.com')).toBe(true);
  });

  it('rejects deploy previews, the dev site, and local development', () => {
    expect(
      isProductionHost('deploy-preview-42--networkcanvasdotdev.netlify.app'),
    ).toBe(false);
    expect(isProductionHost('networkcanvasdotdev.netlify.app')).toBe(false);
    expect(isProductionHost('localhost')).toBe(false);
  });

  it('rejects a look-alike host that merely ends with the domain', () => {
    expect(isProductionHost('evil-networkcanvas.com')).toBe(false);
    expect(isProductionHost('networkcanvas.com.example.org')).toBe(false);
  });
});

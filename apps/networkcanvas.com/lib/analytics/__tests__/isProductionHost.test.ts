import { afterEach, describe, expect, it, vi } from 'vitest';

import { isProductionHost } from '../isProductionHost';

describe('isProductionHost', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts the live site', () => {
    expect(isProductionHost('networkcanvas.com')).toBe(true);
    expect(isProductionHost('www.networkcanvas.com')).toBe(true);
    expect(isProductionHost('protocolgallery.networkcanvas.com')).toBe(true);
  });

  it('rejects deploy previews, the dev site, and local development', () => {
    expect(
      isProductionHost('deploy-preview-42--networkcanvasdotdev.netlify.app'),
    ).toBe(false);
    expect(isProductionHost('networkcanvasdotdev.netlify.app')).toBe(false);
    expect(isProductionHost('localhost')).toBe(false);
  });

  it('accepts the gallery origin the deployment configures', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_PROTOCOL_GALLERY_URL',
      'https://gallery.example.org',
    );

    expect(isProductionHost('gallery.example.org')).toBe(true);
    expect(isProductionHost('networkcanvas.com')).toBe(true);
    expect(isProductionHost('other.example.org')).toBe(false);
  });

  it('ignores a configured origin that is not HTTPS or not a URL', () => {
    vi.stubEnv('NEXT_PUBLIC_PROTOCOL_GALLERY_URL', 'http://localhost:3000');
    expect(isProductionHost('localhost')).toBe(false);

    vi.stubEnv('NEXT_PUBLIC_PROTOCOL_GALLERY_URL', 'not a url');
    expect(isProductionHost('not a url')).toBe(false);
    expect(isProductionHost('networkcanvas.com')).toBe(true);
  });

  it('rejects a look-alike host that merely ends with the domain', () => {
    expect(isProductionHost('evil-networkcanvas.com')).toBe(false);
    expect(isProductionHost('networkcanvas.com.example.org')).toBe(false);
  });
});

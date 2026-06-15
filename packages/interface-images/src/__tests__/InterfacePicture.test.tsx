import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import manifest from '../generated/manifest';
import InterfacePicture from '../InterfacePicture';

describe('InterfacePicture', () => {
  it('renders a picture with a webp source per shipped width', () => {
    const { container } = render(
      <InterfacePicture
        type="Sociogram"
        ratio="16:9"
        alt="Sociogram interface"
      />,
    );

    const source = container.querySelector('picture > source:not([media])');
    expect(source).not.toBeNull();
    expect(source?.getAttribute('type')).toBe('image/webp');

    const srcSet = source?.getAttribute('srcset') ?? '';
    for (const variant of manifest.Sociogram['16:9'].variants) {
      expect(srcSet).toContain(`${variant.url} ${variant.w}w`);
    }
  });

  it('reserves space via explicit width/height on the img fallback', () => {
    const { container } = render(
      <InterfacePicture
        type="Sociogram"
        ratio="4:3"
        alt="Sociogram interface"
      />,
    );

    const variants = manifest.Sociogram['4:3'].variants;
    const largest = variants[variants.length - 1];
    const img = container.querySelector('img');
    expect(img?.getAttribute('width')).toBe(String(largest?.w));
    expect(img?.getAttribute('height')).toBe(String(largest?.h));
    expect(img?.getAttribute('alt')).toBe('Sociogram interface');
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('renders art-directed sources before the base source', () => {
    const { container } = render(
      <InterfacePicture
        type="Sociogram"
        ratio="16:9"
        alt="Sociogram interface"
        artDirection={[{ media: '(max-width: 40rem)', ratio: '1:1' }]}
      />,
    );

    const sources = [...container.querySelectorAll('picture > source')];
    expect(sources).toHaveLength(2);
    expect(sources[0]?.getAttribute('media')).toBe('(max-width: 40rem)');
    const squareSrcSet = sources[0]?.getAttribute('srcset') ?? '';
    const square = manifest.Sociogram['1:1'].variants[0];
    expect(squareSrcSet).toContain(`${square?.url} ${square?.w}w`);
    expect(sources[1]?.getAttribute('media')).toBeNull();
  });

  it('passes sizes through to every source', () => {
    const { container } = render(
      <InterfacePicture
        type="Sociogram"
        alt="Sociogram interface"
        sizes="(min-width: 64rem) 50vw, 100vw"
      />,
    );
    for (const source of container.querySelectorAll('picture > source')) {
      expect(source.getAttribute('sizes')).toBe(
        '(min-width: 64rem) 50vw, 100vw',
      );
    }
  });

  // The fallback and "no variants" branches are unreachable with the real
  // generated manifest (every interface ships all three ratios), so exercise
  // them against a manifest mocked to a restricted/empty shape for a real
  // interface key — keeping the props statically valid (no type suppression).
  it('falls back to the next available ratio when the requested one is missing', async () => {
    vi.resetModules();
    vi.doMock('../generated/manifest', () => ({
      default: {
        Sociogram: {
          '4:3': {
            width: 1024,
            height: 768,
            variants: [{ w: 320, h: 240, url: '/sociogram.4x3.320.webp' }],
          },
        },
      },
    }));
    const { default: PictureWithRestrictedManifest } =
      await import('../InterfacePicture');
    const { container } = render(
      <PictureWithRestrictedManifest
        type="Sociogram"
        ratio="16:9"
        alt="Sociogram interface"
      />,
    );
    const source = container.querySelector('picture > source:not([media])');
    expect(source?.getAttribute('srcset')).toContain(
      '/sociogram.4x3.320.webp 320w',
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('width')).toBe('320');
    expect(img?.getAttribute('height')).toBe('240');
    vi.doUnmock('../generated/manifest');
    vi.resetModules();
  });

  it('throws when the interface has no generated images', async () => {
    vi.resetModules();
    vi.doMock('../generated/manifest', () => ({ default: { Sociogram: {} } }));
    const { default: PictureWithEmptyManifest } =
      await import('../InterfacePicture');
    expect(() =>
      render(
        <PictureWithEmptyManifest
          type="Sociogram"
          ratio="16:9"
          alt="Sociogram interface"
        />,
      ),
    ).toThrow('No images generated for interface "Sociogram"');
    vi.doUnmock('../generated/manifest');
    vi.resetModules();
  });
});

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
});

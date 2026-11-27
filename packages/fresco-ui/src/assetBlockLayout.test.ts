import { describe, expect, it } from 'vitest';

import {
  assetBlockAudioRowVariants,
  assetBlockMediaVariants,
} from './assetBlockLayout';

/**
 * The classes the interview draws each block with, written out whole: a
 * change to a band, or to where a block sits, is a change to what a
 * participant sees, and has to be made on purpose.
 */
describe('assetBlockMediaVariants', () => {
  it.each([
    ['small', 'w-full object-contain max-h-48'],
    ['medium', 'w-full object-contain max-h-96'],
    ['large', 'w-full object-contain max-h-[60vh]'],
  ] as const)('holds a %s file to %s', (size, expected) => {
    expect(assetBlockMediaVariants({ size })).toBe(expected);
  });

  it('leaves a file with no size as tall as it is at the page’s width', () => {
    expect(assetBlockMediaVariants({})).toBe('w-full object-contain');
  });

  it('holds a picture being resized to the height it is dragged to', () => {
    expect(assetBlockMediaVariants({ dragged: true })).toBe(
      'w-full object-contain max-h-(--asset-block-dragged-height)',
    );
  });

  it('adds a caller’s own classes after its own', () => {
    expect(
      assetBlockMediaVariants({
        size: 'medium',
        className: 'rounded',
      }),
    ).toBe('w-full object-contain max-h-96 rounded');
  });
});

describe('assetBlockAudioRowVariants', () => {
  it('centres a player on its line', () => {
    expect(assetBlockAudioRowVariants()).toBe('flex justify-center');
  });
});

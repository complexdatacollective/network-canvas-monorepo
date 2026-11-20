import { describe, expect, it } from 'vitest';

import {
  assetBlockAudioRowVariants,
  assetBlockMediaVariants,
} from './assetBlockLayout';

/**
 * The classes the interview drew each block with before they were read from
 * here, written out whole: a change to a band or to the right-to-left rule is
 * a change to what a participant sees, and has to be made on purpose.
 */
describe('assetBlockMediaVariants', () => {
  it.each([
    ['small', 'max-h-48'],
    ['medium', 'max-h-96'],
    ['large', 'max-h-[60vh]'],
  ] as const)('holds a %s file to %s', (size, expected) => {
    expect(assetBlockMediaVariants({ size })).toBe(expected);
  });

  it.each([
    ['start', 'max-h-48 object-left rtl:object-right'],
    ['center', 'max-h-48'],
    ['end', 'max-h-48 object-right rtl:object-left'],
  ] as const)(
    'places a file held to a height at the %s of its box',
    (align, expected) => {
      expect(assetBlockMediaVariants({ size: 'small', align })).toBe(expected);
    },
  );

  it.each(['start', 'center', 'end'] as const)(
    'does not place a file with no size, which fills the page’s width (%s)',
    (align) => {
      expect(assetBlockMediaVariants({ align })).toBe('');
    },
  );

  it('places a file at every size alike', () => {
    expect(assetBlockMediaVariants({ size: 'large', align: 'end' })).toBe(
      'max-h-[60vh] object-right rtl:object-left',
    );
    expect(assetBlockMediaVariants({ size: 'medium', align: 'start' })).toBe(
      'max-h-96 object-left rtl:object-right',
    );
  });

  it('adds a caller’s own classes after its own', () => {
    expect(
      assetBlockMediaVariants({
        size: 'medium',
        align: 'start',
        className: 'w-full rounded object-contain',
      }),
    ).toBe(
      'max-h-96 object-left rtl:object-right w-full rounded object-contain',
    );
  });
});

describe('assetBlockAudioRowVariants', () => {
  it.each([
    ['start', 'flex justify-start'],
    ['center', 'flex justify-center'],
    ['end', 'flex justify-end'],
  ] as const)('sits a player at the %s of its line', (align, expected) => {
    expect(assetBlockAudioRowVariants({ align })).toBe(expected);
  });
});

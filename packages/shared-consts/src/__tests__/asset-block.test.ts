import { describe, expect, it } from 'vitest';

import {
  ASSET_BLOCK_ALIGNMENTS,
  ASSET_BLOCK_DEFAULTS,
  ASSET_BLOCK_KINDS,
  ASSET_BLOCK_SIZES,
  isAssetBlockAlignment,
  isAssetBlockKind,
  isAssetBlockSize,
} from '../asset-block.ts';

// Values none of the guards may take: near misses, other types, and names
// every object inherits.
const NOT_ANY = [
  '',
  'Image',
  'SMALL',
  ' start',
  'full',
  'left',
  'network',
  'constructor',
  '__proto__',
  undefined,
  null,
  0,
  true,
  {},
  ['image'],
];

describe('the words a block is described in', () => {
  it('lists the kinds, sizes and positions in the order they are offered', () => {
    expect(ASSET_BLOCK_KINDS).toEqual(['image', 'audio', 'video']);
    expect(ASSET_BLOCK_SIZES).toEqual(['small', 'medium', 'large']);
    expect(ASSET_BLOCK_ALIGNMENTS).toEqual(['start', 'center', 'end']);
  });

  it('centres a block that plays by itself and again, unless it says otherwise', () => {
    expect(ASSET_BLOCK_DEFAULTS).toEqual({
      align: 'center',
      autoplay: true,
      loop: true,
    });
  });
});

describe.each([
  ['isAssetBlockKind', isAssetBlockKind, ASSET_BLOCK_KINDS],
  ['isAssetBlockSize', isAssetBlockSize, ASSET_BLOCK_SIZES],
  ['isAssetBlockAlignment', isAssetBlockAlignment, ASSET_BLOCK_ALIGNMENTS],
] as const)('%s', (_name, guard, values) => {
  it.each([...values])('takes "%s"', (value) => {
    expect(guard(value)).toBe(true);
  });

  it.each(NOT_ANY)('refuses %j', (value) => {
    expect(guard(value)).toBe(false);
  });

  it('takes no value of another list', () => {
    const others = [
      ...ASSET_BLOCK_KINDS,
      ...ASSET_BLOCK_SIZES,
      ...ASSET_BLOCK_ALIGNMENTS,
    ].filter((value) => !values.some((own) => own === value));
    expect(others.filter((value) => guard(value))).toEqual([]);
  });
});

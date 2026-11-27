import { describe, expect, it } from 'vitest';

import {
  ASSET_BLOCK_DEFAULTS,
  ASSET_BLOCK_KINDS,
  ASSET_BLOCK_SIZES,
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
  it('lists the kinds and sizes in the order they are offered', () => {
    expect(ASSET_BLOCK_KINDS).toEqual(['image', 'audio', 'video']);
    expect(ASSET_BLOCK_SIZES).toEqual(['small', 'medium', 'large']);
  });

  it('plays a block by itself and again, unless it says otherwise', () => {
    expect(ASSET_BLOCK_DEFAULTS).toEqual({
      autoplay: true,
      loop: true,
    });
  });
});

describe.each([
  ['isAssetBlockKind', isAssetBlockKind, ASSET_BLOCK_KINDS],
  ['isAssetBlockSize', isAssetBlockSize, ASSET_BLOCK_SIZES],
] as const)('%s', (_name, guard, values) => {
  it.each([...values])('takes "%s"', (value) => {
    expect(guard(value)).toBe(true);
  });

  it.each(NOT_ANY)('refuses %j', (value) => {
    expect(guard(value)).toBe(false);
  });

  it('takes no value of another list', () => {
    const others = [...ASSET_BLOCK_KINDS, ...ASSET_BLOCK_SIZES].filter(
      (value) => !values.some((own) => own === value),
    );
    expect(others.filter((value) => guard(value))).toEqual([]);
  });
});

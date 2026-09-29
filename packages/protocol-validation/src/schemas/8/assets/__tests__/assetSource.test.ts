import { describe, expect, it } from 'vitest';

import { assetSourceSchema, isSafeAssetSource } from '../assets.ts';

const REFUSED = ['', '..', 'a/b', 'a\\b', '../escape.png', '/abs.png'];
const ACCEPTED = ['photo.png', 'a..b.mp4', '.hidden', 'name with spaces.csv'];

describe('an asset source', () => {
  it.each(REFUSED)('refuses %j', (source) => {
    expect(isSafeAssetSource(source)).toBe(false);
    expect(assetSourceSchema.safeParse(source).success).toBe(false);
  });

  it.each(ACCEPTED)('accepts %j', (source) => {
    expect(isSafeAssetSource(source)).toBe(true);
    expect(assetSourceSchema.safeParse(source).success).toBe(true);
  });
});

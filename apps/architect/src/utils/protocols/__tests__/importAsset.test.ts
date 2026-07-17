import { describe, expect, it } from 'vitest';

import { getSupportedAssetType } from '../importAsset';

describe('getSupportedAssetType', () => {
  it('recognizes SVG files as image resources', () => {
    expect(getSupportedAssetType('responsive-background.svg')).toBe('image');
    expect(getSupportedAssetType('RESPONSIVE-BACKGROUND.SVG')).toBe('image');
  });
});

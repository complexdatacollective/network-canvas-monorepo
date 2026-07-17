import { describe, expect, it } from 'vitest';

import { HUE_SWATCHES, NEUTRAL_SWATCHES, SWATCHES } from '../palette';

const HEX = /^#[0-9a-f]{6}$/;

describe('colour palette', () => {
  it('exposes every swatch as a 6-digit lowercase hex value', () => {
    for (const swatch of SWATCHES) {
      expect(swatch.value).toMatch(HEX);
    }
  });

  it('gives every swatch a non-empty label', () => {
    for (const swatch of SWATCHES) {
      expect(swatch.label.trim()).not.toBe('');
    }
  });

  it('contains no duplicate colours', () => {
    const values = SWATCHES.map((swatch) => swatch.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('combines the neutrals and the eight hues', () => {
    expect(SWATCHES).toEqual([...NEUTRAL_SWATCHES, ...HUE_SWATCHES]);
    expect(HUE_SWATCHES).toHaveLength(8);
  });
});

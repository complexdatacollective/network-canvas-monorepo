import { describe, expect, it } from 'vitest';

import { paletteColorStyles } from '../styles/palette';
import {
  getStageTypeColor,
  isStageType,
  STAGE_TYPE_COLORS,
  stageTypeColorStyle,
  UNKNOWN_STAGE_COLOR,
} from './stageTypes';

describe('STAGE_TYPE_COLORS', () => {
  it('gives every stage type a distinct palette colour', () => {
    const colors = Object.values(STAGE_TYPE_COLORS);

    expect(colors).toHaveLength(19);
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) {
      expect(paletteColorStyles).toHaveProperty(color);
    }
    expect(colors).not.toContain(UNKNOWN_STAGE_COLOR);
  });

  it('recognises schema stage types and nothing else', () => {
    expect(isStageType('Sociogram')).toBe(true);
    expect(isStageType('FutureInterface')).toBe(false);
    expect(isStageType('toString')).toBe(false);
  });

  it('falls back to the unknown colour for a stage type it does not know', () => {
    expect(getStageTypeColor('Sociogram')).toBe(STAGE_TYPE_COLORS.Sociogram);
    expect(getStageTypeColor('FutureInterface')).toBe(UNKNOWN_STAGE_COLOR);
    expect(stageTypeColorStyle('FutureInterface')).toBe(
      paletteColorStyles[UNKNOWN_STAGE_COLOR],
    );
  });
});

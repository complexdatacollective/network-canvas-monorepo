import { describe, expect, it } from 'vitest';

import { paletteColorStyles } from '../styles/palette';
import {
  isStageType,
  STAGE_TYPE_COLORS,
  STAGE_TYPE_ICONS,
  stageTypeColorStyle,
  stageTypeIcon,
} from './stageTypes';

describe('STAGE_TYPE_COLORS', () => {
  it('gives every stage type a distinct palette colour', () => {
    const colors = Object.values(STAGE_TYPE_COLORS);

    expect(colors).toHaveLength(19);
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) {
      expect(paletteColorStyles).toHaveProperty(color);
    }
  });

  it('recognises schema stage types and nothing else', () => {
    expect(isStageType('Sociogram')).toBe(true);
    expect(isStageType('FutureInterface')).toBe(false);
    expect(isStageType('toString')).toBe(false);
  });

  it('resolves a stage type to its palette colour style', () => {
    expect(stageTypeColorStyle('Sociogram')).toBe(
      paletteColorStyles[STAGE_TYPE_COLORS.Sociogram],
    );
  });
});

describe('STAGE_TYPE_ICONS', () => {
  it('gives every stage type a distinct icon', () => {
    const icons = Object.values(STAGE_TYPE_ICONS);

    expect(Object.keys(STAGE_TYPE_ICONS)).toEqual(
      Object.keys(STAGE_TYPE_COLORS),
    );
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('resolves a stage type to its icon component', () => {
    expect(stageTypeIcon('Sociogram')).toBe(STAGE_TYPE_ICONS.Sociogram);
  });
});

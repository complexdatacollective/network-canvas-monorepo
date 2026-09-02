import { describe, expect, it } from 'vitest';

import {
  isStageType,
  STAGE_TYPE_COLORS,
  stageColorClass,
  summarizeStages,
  UNKNOWN_STAGE_COLOR,
} from '~/lib/stageTypes';

describe('stageColorClass', () => {
  it('assigns every stage type a distinct background utility', () => {
    const classes = Object.values(STAGE_TYPE_COLORS);

    expect(classes).toHaveLength(19);
    expect(new Set(classes).size).toBe(classes.length);
    for (const className of classes) {
      expect(className).toMatch(/^bg-[a-z-]+(?:\/\d+)?$/);
    }
  });

  it('falls back to the neutral colour for unknown stage types', () => {
    expect(isStageType('Sociogram')).toBe(true);
    expect(isStageType('FutureInterface')).toBe(false);
    expect(stageColorClass('Sociogram')).toBe(STAGE_TYPE_COLORS.Sociogram);
    expect(stageColorClass('FutureInterface')).toBe(UNKNOWN_STAGE_COLOR);
  });
});

describe('summarizeStages', () => {
  it('counts edge-generating stages in a stable order and omits zeros', () => {
    const summary = summarizeStages([
      { type: 'Information', label: 'Intro' },
      { type: 'DyadCensus', label: 'Census' },
      { type: 'Sociogram', label: 'Map' },
      { type: 'Sociogram', label: 'Map again' },
      { type: 'EgoForm', label: 'About you' },
    ]);

    expect(summary).toEqual({
      total: 5,
      edgeCounts: [
        { type: 'Sociogram', count: 2 },
        { type: 'DyadCensus', count: 1 },
      ],
    });
  });

  it('reports no edge stages for a protocol without them', () => {
    expect(summarizeStages([{ type: 'Information', label: 'Intro' }])).toEqual({
      total: 1,
      edgeCounts: [],
    });
  });
});

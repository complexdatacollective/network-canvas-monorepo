import { describe, expect, it } from 'vitest';

import { summarizeStages } from '~/lib/stageTypes';

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

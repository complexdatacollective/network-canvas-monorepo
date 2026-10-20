import { describe, expect, it } from 'vitest';

import { estimateBurden } from '../burden';

describe('estimateBurden', () => {
  it('counts per-person, per-pair and filtered work', () => {
    const burden = estimateBurden(
      {
        stages: [
          { type: 'EgoForm', form: { fields: [{}, {}] } },
          { type: 'NameGeneratorQuickAdd', prompts: [{}] },
          { type: 'AlterForm', form: { fields: [{}, {}, {}] } },
          { type: 'AlterForm', filter: {}, form: { fields: [{}] } },
          { type: 'DyadCensus', prompts: [{}] },
        ],
      },
      10,
    );
    expect(burden).toEqual({
      people: 10,
      stages: 5,
      screens: 1 + 1 + 10 + 5 + 45,
      itemsPerPerson: 4,
      answers: 2 + 10 + 30 + 5 + 45,
    });
  });

  it('puts a one-to-many census on n-1 screens', () => {
    const burden = estimateBurden(
      { stages: [{ type: 'OneToManyDyadCensus', prompts: [{}] }] },
      8,
    );
    expect(burden.screens).toBe(7);
    expect(burden.answers).toBe(28);
  });

  it('counts a filtered census over the filtered people', () => {
    const burden = estimateBurden(
      { stages: [{ type: 'DyadCensus', filter: {}, prompts: [{}] }] },
      12,
    );
    expect(burden.screens).toBe(15);
  });

  it('counts the questions on each tie a composer draws', () => {
    const burden = estimateBurden(
      {
        stages: [
          {
            type: 'NetworkComposer',
            edges: [{ form: { fields: [{}, {}] } }],
          },
        ],
      },
      12,
    );
    expect(burden.answers).toBe(12 + 18 * 3);
  });
});

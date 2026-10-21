import { describe, expect, it } from 'vitest';

import { buildReviewMessage } from '../../prompts/design';
import { estimateBurden, stageCosts } from '../burden';

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

  it('counts putting each person in a group on a composer', () => {
    const burden = estimateBurden(
      { stages: [{ type: 'NetworkComposer', convexHullVariable: 'group' }] },
      12,
    );
    expect(burden.answers).toBe(12 * 2 + 18);
    expect(burden.itemsPerPerson).toBe(1);
  });

  it('counts the name on a naming form once', () => {
    const burden = estimateBurden(
      {
        stages: [
          {
            type: 'NameGenerator',
            prompts: [{}],
            form: { fields: [{}, {}, {}] },
          },
        ],
      },
      12,
    );
    expect(burden.answers).toBe(36);
    expect(burden.itemsPerPerson).toBe(2);
  });

  it('lists the heaviest stages for the review, marking unfiltered ones', () => {
    const protocol = {
      stages: [
        { type: 'NameGeneratorQuickAdd', label: 'Names', prompts: [{}] },
        {
          type: 'AlterForm',
          label: 'About them',
          filter: {},
          form: { fields: [{}] },
        },
        { type: 'DyadCensus', label: 'Who knows whom', prompts: [{}] },
      ],
    };
    const costs = stageCosts(protocol, 12);
    expect(costs[2]).toMatchObject({
      label: 'Who knows whom',
      filtered: false,
      answers: 66,
    });
    const message = buildReviewMessage(
      estimateBurden(protocol, 12),
      { screens: 0, itemsPerPerson: 0 },
      costs,
    );
    expect(message).toContain(
      '- Who knows whom (DyadCensus): about 66 screens and 66 answers, asked about everyone',
    );
    expect(message.indexOf('Who knows whom')).toBeLessThan(
      message.indexOf('About them'),
    );
    expect(message).toMatch(/1\. Who each question is about/);
  });
});

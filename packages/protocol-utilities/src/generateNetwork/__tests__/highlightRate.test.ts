import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A Sociogram highlight is a mark a participant puts on a minority of the
 * people in front of them, not an ordinary boolean answer, and the previous
 * generator gave it its own rate. Resolved to the generic 0.5, metadata-free
 * protocols highlighted substantially more nodes than they used to.
 */
const codebook = (highlightSynthetic?: unknown): StructuralCodebook =>
  ({
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          name: { name: 'Name', type: 'text' },
          close: {
            name: 'Close',
            type: 'boolean',
            ...(highlightSynthetic ? { synthetic: highlightSynthetic } : {}),
          },
          personLayout: { name: 'Layout', type: 'layout' },
        },
      },
    },
    edge: {},
    ego: { variables: {} },
  }) as unknown as StructuralCodebook;

const stages = (): Stage[] =>
  [
    {
      id: 'ng',
      type: 'NameGeneratorQuickAdd',
      label: 'Names',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      synthetic: { count: { distribution: 'constant', value: 40 } },
      prompts: [{ id: 'ng-p1', text: 'Who?' }],
    },
    {
      id: 'sociogram',
      type: 'Sociogram',
      label: 'Map',
      subject: { entity: 'node', type: 'person' },
      behaviours: { freeDraw: true },
      background: { concentricCircles: 3, skewedTowardCenter: true },
      prompts: [
        {
          id: 'sg-p1',
          text: 'Mark the close ones',
          layout: { layoutVariable: 'personLayout' },
          highlight: { allowHighlighting: true, variable: 'close' },
        },
      ],
    },
  ] as unknown as Stage[];

const highlightedShare = (highlightSynthetic?: unknown): number => {
  let highlighted = 0;
  let total = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { network } = generateNetwork({
      seed,
      codebook: codebook(highlightSynthetic),
      stages: stages(),
    });
    for (const node of network.nodes) {
      total += 1;
      if (node[entityAttributesProperty].close === true) highlighted += 1;
    }
  }
  return highlighted / total;
};

describe('an undeclared Sociogram highlight', () => {
  it('lands at its own rate rather than the generic boolean one', () => {
    // 800 draws, so the sampling error is small against the gap between 0.35
    // and 0.5 the fix is about.
    const share = highlightedShare();
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.41);
  });

  it('still honours a probability the author declared', () => {
    expect(highlightedShare({ probabilityTrue: 1 })).toBe(1);
    expect(highlightedShare({ probabilityTrue: 0 })).toBe(0);
  });
});

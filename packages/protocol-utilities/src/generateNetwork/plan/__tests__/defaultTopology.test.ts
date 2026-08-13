import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EDGE_TOPOLOGY,
  defaultTopologyForStage,
} from '../resolveSynthetic';

/**
 * A protocol declaring no synthetic metadata is documented as generating what
 * it generated before the redesign, and the previous generator linked each
 * interface at its own density: a census walks every pair and asks about each,
 * while a sociogram asks someone to draw the lines and a composer to build the
 * network from nothing. Collapsing all three into one figure made metadata-free
 * sociograms and composers substantially denser and censuses sparser.
 */
describe('the density an undeclared stage links at', () => {
  const windowOf = (stageType: string) => {
    const topology = defaultTopologyForStage(stageType);
    expect(topology.metric).toBe('density');
    const { distribution } = topology;
    expect(distribution.distribution).toBe('uniform');
    return distribution as { min?: number; max?: number };
  };

  it.each([
    ['Sociogram', 0.08, 0.15],
    ['DyadCensus', 0.4, 0.6],
    ['OneToManyDyadCensus', 0.4, 0.6],
    ['TieStrengthCensus', 0.4, 0.6],
    ['NetworkComposer', 0.05, 0.1],
  ])('keeps %s at the figure the old generator used', (stage, min, max) => {
    expect(windowOf(stage)).toMatchObject({ min, max });
  });

  it('falls back to the shared default for an interface with no figure', () => {
    // A new edge-creating stage type, or a caller resolving a topology outside
    // any stage at all.
    expect(defaultTopologyForStage('SomeFutureCensus')).toEqual(
      DEFAULT_EDGE_TOPOLOGY,
    );
  });
});

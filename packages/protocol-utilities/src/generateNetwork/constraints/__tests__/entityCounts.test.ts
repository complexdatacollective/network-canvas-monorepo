import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { resolveGenerationConfig } from '../../config';
import { worstCaseEntityCounts } from '../entityCounts';

const config = resolveGenerationConfig({ today: '2026-07-27' });

function nameGenerator(overrides: Record<string, unknown> = {}): Stage {
  return {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Name people' }],
    ...overrides,
  } as Stage;
}

describe('worstCaseEntityCounts', () => {
  it('uses the config node maximum when a stage declares no behaviours', () => {
    const counts = worstCaseEntityCounts([nameGenerator()], config);
    expect(counts.node.get('person')).toBe(config.nodeCount.max);
  });

  it('uses the stage maxNodes when declared', () => {
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { maxNodes: 20 } })],
      config,
    );
    expect(counts.node.get('person')).toBe(20);
  });

  it('counts a minNodes floor above the config maximum, as the generator does', () => {
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { minNodes: 20 } })],
      config,
    );
    expect(counts.node.get('person')).toBe(20);
  });

  it('sums across every stage producing the same node type', () => {
    const counts = worstCaseEntityCounts(
      [
        nameGenerator({ id: 'a', behaviours: { maxNodes: 5 } }),
        nameGenerator({ id: 'b', behaviours: { maxNodes: 7 } }),
      ],
      config,
    );
    expect(counts.node.get('person')).toBe(12);
  });

  function familyPedigree(): Stage {
    return {
      id: 'stage-fp',
      type: 'FamilyPedigree',
      label: 'Pedigree',
      nodeConfig: { type: 'relative' },
      edgeConfig: { type: 'kin' },
      prompts: [],
    } as unknown as Stage;
  }

  it('counts FamilyPedigree nodes against its configured node type', () => {
    const counts = worstCaseEntityCounts([familyPedigree()], config);
    expect(counts.node.get('relative')).toBe(
      config.familyPedigreeNodeCount.max,
    );
    expect(counts.edge.get('kin')).toBe(config.familyPedigreeNodeCount.max - 1);
  });

  it('counts an inverted FamilyPedigree range as the generator draws it', () => {
    // `randomInt` collapses an inverted range to its `min`, so the stage builds
    // 20 nodes and 19 edges; reading `max` alone would report 10 and 9.
    const inverted = resolveGenerationConfig({
      today: '2026-07-27',
      familyPedigreeNodeCount: { min: 20, max: 10 },
    });

    const counts = worstCaseEntityCounts([familyPedigree()], inverted);
    expect(counts.node.get('relative')).toBe(20);
    expect(counts.edge.get('kin')).toBe(19);
  });

  it('bounds an edge type by the pair count over its node type', () => {
    const stages = [
      nameGenerator({ behaviours: { maxNodes: 4 } }),
      {
        id: 'stage-2',
        type: 'DyadCensus',
        label: 'Census',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
        ],
      } as unknown as Stage,
    ];

    // C(4, 2) = 6
    const counts = worstCaseEntityCounts(stages, config);
    expect(counts.edge.get('knows')).toBe(6);
  });

  it('returns empty maps for a protocol with no entity-producing stages', () => {
    const stage = {
      id: 'stage-info',
      type: 'Information',
      label: 'Info',
      items: [],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts([stage], config);
    expect(counts.node.size).toBe(0);
    expect(counts.edge.size).toBe(0);
  });
});

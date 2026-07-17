import { describe, expect, it } from 'vitest';

import { collectEntityTypeReferences } from '../collectEntityAttributeReferences.ts';

// Walks the REAL protocol schema, so this covers both the walker and the
// entityTypeReference tagging of each schema spot. Stage fixtures are minimal:
// the stage union discriminates on `type`, and the walker only descends into
// reference-bearing fields, so unrelated required fields can be omitted.
const protocol = {
  schemaVersion: 8,
  stages: [
    {
      id: 'nc',
      type: 'NetworkComposer',
      subject: { entity: 'node', type: 'person' },
      edges: [{ id: 'nc-e1', subject: { entity: 'edge', type: 'friendship' } }],
    },
    {
      id: 'soc',
      type: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Who knows whom?',
          layout: { layoutVariable: 'layout-var' },
          edges: { create: 'friendship', display: ['friendship', 'conflict'] },
        },
      ],
    },
    {
      id: 'dyad',
      type: 'DyadCensus',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p2', text: 'Do they know each other?', createEdge: 'conflict' },
      ],
    },
    {
      id: 'nar',
      type: 'Narrative',
      subject: { entity: 'node', type: 'person' },
      presets: [
        {
          id: 'preset-1',
          label: 'Preset',
          layoutVariable: 'layout-var',
          edges: { display: ['friendship'] },
        },
      ],
      filter: {
        join: 'AND',
        rules: [
          {
            type: 'node',
            id: 'r1',
            options: { type: 'clinic', operator: 'EXISTS' },
          },
          {
            type: 'edge',
            id: 'r2',
            options: { type: 'referral', operator: 'NOT_EXISTS' },
          },
          // An ego rule references no codebook type, even with options.type set.
          {
            type: 'ego',
            id: 'r3',
            options: { type: 'ignored', operator: 'EXISTS' },
          },
        ],
      },
    },
    {
      id: 'ped',
      type: 'FamilyPedigree',
      nodeConfig: { type: 'family-member' },
      edgeConfig: { type: 'partnership' },
    },
  ],
};

describe('collectEntityTypeReferences', () => {
  const hits = collectEntityTypeReferences(protocol);
  const pairs = hits.map(({ entity, typeId }) => `${entity}:${typeId}`);

  it('collects node types from stage subjects', () => {
    expect(pairs).toContain('node:person');
  });

  it('collects edge types from NetworkComposer edges[].subject with a full path', () => {
    const hit = hits.find(
      (candidate) =>
        candidate.entity === 'edge' &&
        candidate.typeId === 'friendship' &&
        candidate.path.join('.') === 'stages.0.edges.0.subject.type',
    );
    expect(hit).toBeDefined();
  });

  it('collects edge types from sociogram edge create/display settings', () => {
    expect(pairs).toContain('edge:conflict'); // display + DyadCensus createEdge
    expect(
      hits.filter(
        (candidate) =>
          candidate.entity === 'edge' &&
          candidate.typeId === 'friendship' &&
          candidate.path[2] === 'prompts',
      ).length,
    ).toBe(2); // edges.create + edges.display[0]
  });

  it('collects edge types from Narrative preset display settings', () => {
    const hit = hits.find(
      (candidate) =>
        candidate.typeId === 'friendship' && candidate.path[2] === 'presets',
    );
    expect(hit?.entity).toBe('edge');
  });

  it('collects the FamilyPedigree node and edge config types', () => {
    expect(pairs).toContain('node:family-member');
    expect(pairs).toContain('edge:partnership');
  });

  it('resolves filter-rule types from the owning rule entity, skipping ego rules', () => {
    expect(pairs).toContain('node:clinic');
    expect(pairs).toContain('edge:referral');
    expect(pairs.some((pair) => pair.endsWith(':ignored'))).toBe(false);
  });
});

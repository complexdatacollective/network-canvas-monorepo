import { describe, expect, it } from 'vitest';

import { familyPedigreeWordingIn } from '../../__tests__/suppliedWording.ts';
import { testId } from '../../__tests__/testIds.ts';
import { collectEntityTypeReferences } from '../collectEntityAttributeReferences.ts';
import { localized } from '../test-utils.ts';

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
      edges: [
        {
          id: 'nc-e1',
          subject: { entity: 'edge', type: 'friendship' },
          label: localized('Connection'),
        },
      ],
    },
    {
      id: 'soc',
      type: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: localized('Who knows whom?'),
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
        {
          id: 'p2',
          text: localized('Do they know each other?'),
          createEdge: 'conflict',
        },
      ],
    },
    {
      id: 'nar',
      type: 'Narrative',
      subject: { entity: 'node', type: 'person' },
      presets: [
        {
          id: 'preset-1',
          label: localized('Preset'),
          layoutVariable: 'layout-var',
          edges: {
            display: [{ type: 'friendship', label: localized('Friendship') }],
          },
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
      ],
    },
    {
      id: 'ped',
      type: 'FamilyPedigree',
      wording: familyPedigreeWordingIn(),
      subject: { entity: 'node', type: 'family-member' },
      edgeConfiguration: { type: 'partnership' },
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

  it('collects the FamilyPedigree person and relationship types', () => {
    expect(pairs).toContain('node:family-member');
    expect(pairs).toContain('edge:partnership');
  });

  it('resolves filter-rule types from the owning rule entity, skipping ego rules', () => {
    expect(pairs).toContain('node:clinic');
    expect(pairs).toContain('edge:referral');
    expect(pairs.some((pair) => pair.endsWith(':ignored'))).toBe(false);
  });
});

describe('a node type’s own label', () => {
  const labelled = {
    schemaVersion: 9,
    stages: [],
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: { name: { name: 'name', type: 'text' } },
          dynamicLabel: {
            text: localized(
              `{condition_${testId('known').replaceAll('-', '_')}, select, true {Named} other {Unnamed}}`,
            ),
            conditions: {
              [testId('known')]: {
                rules: [
                  {
                    id: testId('own'),
                    type: 'node',
                    options: {
                      type: 'person',
                      attribute: 'name',
                      operator: 'EXISTS',
                    },
                  },
                  {
                    id: testId('tie'),
                    type: 'edge',
                    options: { type: 'friendship', operator: 'EXISTS' },
                  },
                ],
              },
            },
          },
        },
      },
      edge: { friendship: { name: 'Friendship', color: 'edge-color-seq-1' } },
    },
  };

  // A rule in a type's label names the type it belongs to. That is not a use
  // of the type by anything else, and counting it would keep a type that no
  // stage uses from ever being deleted.
  it('is not a use of that type, though the edge types its rules name are', () => {
    const hits = collectEntityTypeReferences(labelled);
    expect(hits.filter((hit) => hit.typeId === 'person')).toEqual([]);
    expect(hits.map((hit) => [hit.entity, hit.typeId])).toEqual([
      ['edge', 'friendship'],
    ]);
  });
});

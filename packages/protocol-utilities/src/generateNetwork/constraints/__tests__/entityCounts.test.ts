import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../../generateNetwork';
import { resolveGenerationConfig } from '../../config';
import { edgeCountFor, worstCaseEntityCounts } from '../entityCounts';
import { SyntheticDataConstraintError } from '../error';

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

function alterEdgeForm(...variables: string[]): Stage {
  return {
    id: 'stage-edge-form',
    type: 'AlterEdgeForm',
    label: 'About this relationship',
    subject: { entity: 'edge', type: 'kin' },
    form: {
      fields: variables.map((variable) => ({
        variable,
        prompt: 'Tell us about it',
      })),
    },
  } as unknown as Stage;
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

  it('counts FamilyPedigree nodes against its configured node type', () => {
    const counts = worstCaseEntityCounts([familyPedigree()], config);
    expect(counts.node.get('relative')).toBe(
      config.familyPedigreeNodeCount.max,
    );
  });

  it('leaves pedigree edges uncounted when no stage names an attribute of their type', () => {
    // `handleFamilyPedigree` builds its edges with empty attributes, so nothing
    // in this protocol ever holds a value on one.
    const counts = worstCaseEntityCounts([familyPedigree()], config);
    expect(edgeCountFor(counts.edge, 'kin', 'verified')).toBe(0);
  });

  it('counts pedigree edges once a stage names an attribute of their type', () => {
    const counts = worstCaseEntityCounts(
      [familyPedigree(), alterEdgeForm('verified')],
      config,
    );
    expect(edgeCountFor(counts.edge, 'kin', 'verified')).toBe(
      config.familyPedigreeNodeCount.max - 1,
    );
  });

  it('counts pedigree edges per variable, not per type', () => {
    // `handleAlterEdgeForm` passes its field list to `generateEntityAttributes`
    // as `only`, so a variable the form does not render is `undefined` on every
    // pedigree edge even though a sibling variable of the same type is filled.
    const counts = worstCaseEntityCounts(
      [familyPedigree(), alterEdgeForm('note')],
      config,
    );
    expect(edgeCountFor(counts.edge, 'kin', 'note')).toBe(
      config.familyPedigreeNodeCount.max - 1,
    );
    expect(edgeCountFor(counts.edge, 'kin', 'verified')).toBe(0);
  });

  it('counts an unnamed variable on edges another stage creates', () => {
    // Only pedigree edges are exempted. A Sociogram generates the whole
    // attribute set of every edge it creates, so `verified` is on all six of
    // them whether or not a form ever mentions it.
    const sociogram = {
      id: 'stage-sociogram',
      type: 'Sociogram',
      label: 'Link them',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Who knows who?', edges: { create: 'kin' } }],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { maxNodes: 4 } }), sociogram],
      config,
    );
    // C(4, 2) = 6
    expect(edgeCountFor(counts.edge, 'kin', 'verified')).toBe(6);
  });

  it('adds pedigree edges to the edges another stage creates of the same type', () => {
    const sociogram = {
      id: 'stage-sociogram',
      type: 'Sociogram',
      label: 'Link them',
      subject: { entity: 'node', type: 'relative' },
      prompts: [{ id: 'p1', text: 'Who knows who?', edges: { create: 'kin' } }],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [familyPedigree(), sociogram, alterEdgeForm('note')],
      config,
    );
    // C(10, 2) = 45 pedigree-built people paired by the sociogram, plus the
    // pedigree's own nine edges for the variable the form fills.
    expect(edgeCountFor(counts.edge, 'kin', 'note')).toBe(54);
    expect(edgeCountFor(counts.edge, 'kin', 'verified')).toBe(45);
  });

  it('reads only edge-subject references, not a node type of the same name', () => {
    // Node and edge codebooks are separate namespaces, so an attribute named on
    // a node type says nothing about what fills an edge of the same name.
    const alterForm = {
      id: 'stage-node-form',
      type: 'AlterForm',
      label: 'About them',
      subject: { entity: 'node', type: 'kin' },
      form: { fields: [{ variable: 'verified', prompt: 'Verified?' }] },
    } as unknown as Stage;

    const counts = worstCaseEntityCounts([familyPedigree(), alterForm], config);
    expect(edgeCountFor(counts.edge, 'kin', 'verified')).toBe(0);
  });

  it('counts an inverted FamilyPedigree range as the generator draws it', () => {
    // `randomInt` collapses an inverted range to its `min`, so the stage builds
    // 20 nodes and 19 edges; reading `max` alone would report 10 and 9.
    const inverted = resolveGenerationConfig({
      today: '2026-07-27',
      familyPedigreeNodeCount: { min: 20, max: 10 },
    });

    const counts = worstCaseEntityCounts(
      [familyPedigree(), alterEdgeForm('verified')],
      inverted,
    );
    expect(counts.node.get('relative')).toBe(20);
    expect(edgeCountFor(counts.edge, 'kin', 'verified')).toBe(19);
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
    expect(edgeCountFor(counts.edge, 'knows', 'strength')).toBe(6);
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
    expect(counts.edge.base.size).toBe(0);
    expect(counts.edge.pedigree.size).toBe(0);
  });
});

function rosterStage(overrides: Record<string, unknown> = {}): Stage {
  return {
    id: 'stage-roster',
    type: 'NameGeneratorRoster',
    label: 'Roster',
    subject: { entity: 'node', type: 'person' },
    dataSource: 'roster-asset',
    prompts: [{ id: 'p1', text: 'Pick people' }],
    behaviours: { maxNodes: 3 },
    ...overrides,
  } as unknown as Stage;
}

function rosterRow(uid: string): NcNode {
  return {
    [entityPrimaryKeyProperty]: uid,
    type: 'person',
    [entityAttributesProperty]: {},
  };
}

describe('worstCaseEntityCounts with roster rows', () => {
  it('counts nothing for a roster stage whose roster is known to be empty', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [],
    });
    expect(counts.node.get('person')).toBe(0);
  });

  it('caps a roster stage at the rows its roster holds', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [rosterRow('a'), rosterRow('b')],
    });
    expect(counts.node.get('person')).toBe(2);
  });

  it('keeps the configured maximum when the roster holds more rows than that', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': ['a', 'b', 'c', 'd', 'e'].map(rosterRow),
    });
    expect(counts.node.get('person')).toBe(3);
  });

  it('counts the configured maximum when the stage has no roster entry', () => {
    // The roster could not be resolved, so `createNodesForStage` fabricates to
    // the stage's node counts. Counting the rows that did resolve for another
    // stage would under-count this one.
    const counts = worstCaseEntityCounts(
      [rosterStage(), rosterStage({ id: 'other' })],
      config,
      { other: [] },
    );
    expect(counts.node.get('person')).toBe(3);
  });

  it('counts the configured maximum when no roster rows are supplied at all', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config);
    expect(counts.node.get('person')).toBe(3);
  });

  it('counts a roster panel on a fabricating name generator at the full maximum', () => {
    // A NameGenerator draws from its panel but is not bounded by it: it
    // fabricates the rest of its nodes.
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { maxNodes: 4 } })],
      config,
      { 'stage-1': [] },
    );
    expect(counts.node.get('person')).toBe(4);
  });

  it('counts rows once when two roster stages draw the same roster', () => {
    // Rows are drawn without replacement across stages, so between them the two
    // stages can produce at most one node per row — four, not the six their
    // configured maxima sum to.
    const rows = ['a', 'b', 'c', 'd'].map(rosterRow);
    const counts = worstCaseEntityCounts(
      [rosterStage(), rosterStage({ id: 'second' })],
      config,
      { 'stage-roster': rows, 'second': rows },
    );
    expect(counts.node.get('person')).toBe(4);
  });

  it('holds each roster stage to its own bound when their rosters share no rows', () => {
    // One stage is bounded by its single row, the other by its own maximum,
    // and neither can spend the rows the other was given.
    const counts = worstCaseEntityCounts(
      [
        rosterStage({ behaviours: { maxNodes: 5 } }),
        rosterStage({ id: 'second', behaviours: { maxNodes: 1 } }),
      ],
      config,
      {
        'stage-roster': [rosterRow('a')],
        'second': ['b', 'c', 'd'].map(rosterRow),
      },
    );
    expect(counts.node.get('person')).toBe(2);
  });

  it('adds a fabricating stage to a roster stage capped by its rows', () => {
    const counts = worstCaseEntityCounts(
      [rosterStage(), nameGenerator({ id: 'ng', behaviours: { maxNodes: 4 } })],
      config,
      { 'stage-roster': [rosterRow('a')] },
    );
    expect(counts.node.get('person')).toBe(5);
  });

  it('bounds an edge type by the pairs a roster-capped node count reaches', () => {
    const stages = [
      rosterStage(),
      {
        id: 'stage-census',
        type: 'DyadCensus',
        label: 'Census',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
        ],
      } as unknown as Stage,
    ];

    // C(2, 2) = 1, where the uncapped stage maximum would claim C(3, 2) = 3.
    const counts = worstCaseEntityCounts(stages, config, {
      'stage-roster': [rosterRow('a'), rosterRow('b')],
    });
    expect(edgeCountFor(counts.edge, 'knows', 'strength')).toBe(1);
  });
});

describe('generateNetwork with a roster-capped unique variable', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          consented: {
            name: 'Consented',
            type: 'boolean',
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  it('generates nothing, rather than refusing, for a known-empty roster', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [rosterStage()],
      externalData: { 'stage-roster': [] },
    });

    expect(network.nodes).toHaveLength(0);
  });

  it('still refuses when the roster cannot be resolved', () => {
    // Nothing is known about the roster, so the stage fabricates three people
    // and two boolean values cannot tell them apart. Refusing up front is the
    // only alternative to throwing partway through the draw.
    expect(() =>
      generateNetwork({ seed: 1, codebook, stages: [rosterStage()] }),
    ).toThrow(SyntheticDataConstraintError);
  });
});

describe('generateNetwork with a unique variable on a pedigree edge type', () => {
  const codebook = {
    node: {
      relative: {
        name: 'Relative',
        color: 'node-color-seq-1',
        variables: {},
      },
    },
    edge: {
      kin: {
        name: 'Kin',
        color: 'edge-color-seq-1',
        variables: {
          verified: {
            name: 'Verified',
            type: 'boolean',
            validation: { unique: true },
          },
          note: { name: 'Note', type: 'text' },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  it('generates, rather than refusing, when nothing fills the pedigree edges', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [familyPedigree()],
    });

    expect(network.edges.length).toBeGreaterThan(2);
    // The premise the count now rests on: these edges hold no value at all, so
    // no two of them can hold the same one.
    expect(
      network.edges.every(
        (edge) => edge[entityAttributesProperty].verified === undefined,
      ),
    ).toBe(true);
  });

  it('still refuses up front when a form on the same edge type fills that variable', () => {
    // The form writes every existing edge of the type, pedigree-built ones
    // included, and renders a field that validates what it wrote — so nine
    // edges really do have to hold nine distinct booleans.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [familyPedigree(), alterEdgeForm('verified')],
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    // Named specifically, because an exemption that let these edges out of the
    // count would not make this protocol generate — it would only move the
    // refusal to the draw, where the form runs out of booleans partway through
    // and the message says nothing about how many edges there were.
    expect(generate).toThrow(/up to 9 edges of this type can be generated/);
  });

  it('generates when the form on that edge type fills a different variable', () => {
    // `handleAlterEdgeForm` writes only the variables its form renders, so
    // `verified` stays undefined on all nine edges however many of them the
    // form touches.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [familyPedigree(), alterEdgeForm('note')],
    });

    expect(network.edges.length).toBeGreaterThan(2);
    expect(
      network.edges.every(
        (edge) => edge[entityAttributesProperty].verified === undefined,
      ),
    ).toBe(true);
    expect(
      network.edges.every(
        (edge) => edge[entityAttributesProperty].note !== undefined,
      ),
    ).toBe(true);
  });

  it('still refuses when the form fills a variable held equal to the unique one', () => {
    // The group holds one value, so what any member of it spends the whole
    // group spends: nine edges carry `mirror`, so nine distinct values are
    // needed however few of them carry `verified` itself.
    const heldEqual = {
      node: { relative: { name: 'Relative', color: 'nc-1', variables: {} } },
      edge: {
        kin: {
          name: 'Kin',
          color: 'edge-color-seq-1',
          variables: {
            verified: {
              name: 'Verified',
              type: 'boolean',
              validation: { unique: true },
            },
            mirror: {
              name: 'Mirror',
              type: 'boolean',
              validation: { sameAs: 'verified' },
            },
          },
        },
      },
    } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: heldEqual,
        stages: [familyPedigree(), alterEdgeForm('mirror')],
      }),
    ).toThrow(/up to 9 edges of this type can be generated/);
  });

  it('still refuses when another stage creates edges of the same type', () => {
    // A Sociogram generates the whole attribute set of every edge it creates,
    // so those edges hold `verified` whatever the form renders. Only the
    // pedigree's own edges are ever exempted.
    const sociogram = {
      id: 'stage-sociogram',
      type: 'Sociogram',
      label: 'Link them',
      subject: { entity: 'node', type: 'relative' },
      prompts: [{ id: 'p1', text: 'Who knows who?', edges: { create: 'kin' } }],
    } as unknown as Stage;

    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [familyPedigree(), sociogram, alterEdgeForm('note')],
      }),
    ).toThrow(SyntheticDataConstraintError);
  });
});

import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../../generateNetwork';
import { resolveGenerationConfig } from '../../config';
import {
  edgeCountFor,
  nodeCountFor,
  worstCaseEntityCounts,
} from '../entityCounts';
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

function networkComposer(overrides: Record<string, unknown> = {}): Stage {
  return {
    id: 'stage-composer',
    type: 'NetworkComposer',
    label: 'Compose',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    layoutVariable: 'layout',
    background: { circles: true },
    edges: [{ id: 'e1', subject: { entity: 'edge', type: 'knows' } }],
    ...overrides,
  } as unknown as Stage;
}

describe('worstCaseEntityCounts', () => {
  it('uses the config node maximum when a stage declares no behaviours', () => {
    const counts = worstCaseEntityCounts([nameGenerator()], config);
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(
      config.nodeCount.max,
    );
  });

  it('uses the stage maxNodes when declared', () => {
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { maxNodes: 20 } })],
      config,
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(20);
  });

  it('counts a minNodes floor above the config maximum, as the generator does', () => {
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { minNodes: 20 } })],
      config,
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(20);
  });

  it('sums across every stage producing the same node type', () => {
    const counts = worstCaseEntityCounts(
      [
        nameGenerator({ id: 'a', behaviours: { maxNodes: 5 } }),
        nameGenerator({ id: 'b', behaviours: { maxNodes: 7 } }),
      ],
      config,
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(12);
  });

  it('counts FamilyPedigree nodes against its configured node type', () => {
    const counts = worstCaseEntityCounts([familyPedigree()], config);
    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(
      config.familyPedigreeNodeCount.max,
    );
  });

  it('leaves pedigree edges uncounted when no stage names an attribute of their type', () => {
    // `handleFamilyPedigree` builds its edges with empty attributes, so nothing
    // in this protocol ever holds a value on one.
    const counts = worstCaseEntityCounts([familyPedigree()], config);
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(0);
  });

  it('counts pedigree edges once a stage names an attribute of their type', () => {
    const counts = worstCaseEntityCounts(
      [familyPedigree(), alterEdgeForm('verified')],
      config,
    );
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(
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
    expect(edgeCountFor(counts.edge, 'kin', ['note'])).toBe(
      config.familyPedigreeNodeCount.max - 1,
    );
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(0);
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
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(6);
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
    expect(edgeCountFor(counts.edge, 'kin', ['note'])).toBe(54);
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(45);
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
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(0);
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
    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(20);
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(19);
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
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(6);
  });

  it('bounds a NetworkComposer edge by the composer own node ceiling', () => {
    // `handleNetworkComposer` pairs the `newNodes` it just built, so the five
    // people the name generator added are never among them: C(2, 2) = 1, where
    // the protocol-wide total would claim C(7, 2) = 21.
    const twoNodes = resolveGenerationConfig({
      today: '2026-07-27',
      nodeCount: { min: 2, max: 2 },
    });

    const counts = worstCaseEntityCounts(
      [
        nameGenerator({ behaviours: { minNodes: 5, maxNodes: 5 } }),
        networkComposer(),
      ],
      twoNodes,
    );
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(1);
  });

  it('counts an inverted composer node range as the generator draws it', () => {
    // `randomInt` collapses an inverted range to its `min`, so the composer
    // builds six people and pairs C(6, 2) = 15 of them. Reading the configured
    // `max` alone would report a single pair and let a `unique` edge variable
    // through that the draw then runs out of values for.
    const inverted = resolveGenerationConfig({
      today: '2026-07-27',
      nodeCount: { min: 6, max: 2 },
    });

    const counts = worstCaseEntityCounts([networkComposer()], inverted);
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(6);
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(15);
  });

  it('sums the pairs of every composer creating one edge type', () => {
    // Each composer pairs only its own people, but a `unique` value is claimed
    // once for the whole run, so the two stages' pairs add up.
    const threeNodes = resolveGenerationConfig({
      today: '2026-07-27',
      nodeCount: { min: 3, max: 3 },
    });

    const counts = worstCaseEntityCounts(
      [networkComposer(), networkComposer({ id: 'second' })],
      threeNodes,
    );
    // C(3, 2) = 3 apiece.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(6);
  });

  it('leaves a census reading the whole node total, composer people included', () => {
    // Only the composer is stage-local. A DyadCensus pairs whatever the draft
    // holds when it runs, so the people a composer added are among its
    // candidates and narrowing it the same way would under-count it.
    const twoNodes = resolveGenerationConfig({
      today: '2026-07-27',
      nodeCount: { min: 2, max: 2 },
    });

    const census = {
      id: 'stage-census',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
      ],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [
        nameGenerator({ behaviours: { minNodes: 5, maxNodes: 5 } }),
        networkComposer(),
        census,
      ],
      twoNodes,
    );
    // C(7, 2) = 21 for the census over all seven people, plus the composer's
    // own C(2, 2) = 1.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(22);
  });

  it('counts nothing for a composer whose subject names no node type', () => {
    // `handleNetworkComposer` returns before building anything, so neither its
    // people nor its edges exist.
    const counts = worstCaseEntityCounts(
      [networkComposer({ subject: { entity: 'edge', type: 'knows' } })],
      config,
    );
    expect(counts.edge.base.size).toBe(0);
  });

  it('still counts a filtered census at its unfiltered pair count', () => {
    // Whether a node passes a stage's filter depends on values no analysis has
    // drawn yet, so the only sound ceiling is the one where every node passes.
    // Narrowing this by reading the filter would be an under-count wherever the
    // reading is wrong, and an under-count lets a `unique` variable through and
    // runs the draw out of values partway. Deliberately the same number the
    // same census without a filter reaches.
    const filtered = {
      id: 'stage-census',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      filter: {
        rules: [
          {
            id: 'r1',
            type: 'node',
            options: {
              type: 'person',
              attribute: 'band',
              operator: 'EXACTLY',
              value: 1,
            },
          },
        ],
      },
      prompts: [
        { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
      ],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { minNodes: 3, maxNodes: 3 } }), filtered],
      config,
    );
    // C(3, 2) = 3.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(3);
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

function valuedRow(
  uid: string,
  attributes: Record<string, VariableValue>,
): NcNode {
  return {
    [entityPrimaryKeyProperty]: uid,
    type: 'person',
    [entityAttributesProperty]: attributes,
  };
}

describe('worstCaseEntityCounts with roster rows', () => {
  it('counts nothing for a roster stage whose roster is known to be empty', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [],
    });
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(0);
  });

  it('caps a roster stage at the rows its roster holds', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [rosterRow('a'), rosterRow('b')],
    });
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(2);
  });

  it('keeps the configured maximum when the roster holds more rows than that', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': ['a', 'b', 'c', 'd', 'e'].map(rosterRow),
    });
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(3);
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
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(3);
  });

  it('counts the configured maximum when no roster rows are supplied at all', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config);
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(3);
  });

  it('counts a roster panel on a fabricating name generator at the full maximum', () => {
    // A NameGenerator draws from its panel but is not bounded by it: it
    // fabricates the rest of its nodes.
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { maxNodes: 4 } })],
      config,
      { 'stage-1': [] },
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(4);
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
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(4);
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
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(2);
  });

  it('adds a fabricating stage to a roster stage capped by its rows', () => {
    const counts = worstCaseEntityCounts(
      [rosterStage(), nameGenerator({ id: 'ng', behaviours: { maxNodes: 4 } })],
      config,
      { 'stage-roster': [rosterRow('a')] },
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(5);
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
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(1);
  });
});

describe('worstCaseEntityCounts with roster rows carrying values', () => {
  it('counts rows repeating one value as the single value they spend', () => {
    // The third row's `true` is already in the network by the time it comes up,
    // so `rosterRowIsDrawable` passes it over: two of the three rows are all
    // this roster can put into the network for `consented`.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: false }),
        valuedRow('c', { consented: true }),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(2);
  });

  it('leaves a variable those rows say nothing about at the full row count', () => {
    // Nothing passes a row over for a variable it does not carry: all three
    // rows are drawn and the draw supplies `nickname` on each of them.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: false }),
        valuedRow('c', { consented: true }),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['nickname'])).toBe(3);
  });

  it('counts a row leaving the variable unset as a value the draw still spends', () => {
    // `createNodesForStage` generates the node around only what the row
    // supplies, so a row with no `consented` is asked for one exactly as a
    // fabricated node is — and spends a value of the space just the same.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: false }),
        rosterRow('c'),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(3);
  });

  it('judges sameness as the unique registry does, not as raw JSON would', () => {
    // Two orderings of one categorical selection are one value to
    // `isMatchingValue`, so the second row repeats the first and is passed
    // over. Keying on raw JSON would call them two values and count two rows.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { tags: ['x', 'y'] }),
        valuedRow('b', { tags: ['y', 'x'] }),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['tags'])).toBe(1);
  });

  it('adds a fabricating stage to what the roster can spend', () => {
    const counts = worstCaseEntityCounts(
      [rosterStage(), nameGenerator({ id: 'ng', behaviours: { maxNodes: 2 } })],
      config,
      {
        'stage-roster': [
          valuedRow('a', { consented: true }),
          valuedRow('b', { consented: true }),
        ],
      },
    );
    expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(3);
  });

  it('counts one row per primary key when two stages offer the same value', () => {
    // Rows are drawn without replacement across stages, so the second stage
    // never sees a key the first took — and the value it carries is spent once.
    const rows = [
      valuedRow('a', { consented: true }),
      valuedRow('b', { consented: true }),
    ];
    const counts = worstCaseEntityCounts(
      [rosterStage(), rosterStage({ id: 'second' })],
      config,
      { 'stage-roster': rows, 'second': rows },
    );
    expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(1);
  });

  it('holds a repeated value against the pairs its rows can still reach', () => {
    // An edge is created for a pair of people whatever they hold, so the pair
    // count reads the whole roster: `consented` sending two rows to the same
    // value takes nothing away from a stage pairing all three of them.
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

    const counts = worstCaseEntityCounts(stages, config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: false }),
        valuedRow('c', { consented: true }),
      ],
    });
    // C(3, 2) = 3, over every row rather than the two `consented` can tell
    // apart.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(3);
  });
});

describe('worstCaseEntityCounts across a unique equality group', () => {
  it('counts rows a group member repeats as the one node they build', () => {
    // Every row carries `consented` and none carries the variable held equal
    // to it. Read one member at a time, `mirror` is three people the draw must
    // tell apart; read across the group, the rows share one `unique` slot, so
    // the first claims `true` and `rosterRowIsDrawable` passes the rest over.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: true }),
        valuedRow('c', { consented: true }),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['consented', 'mirror'])).toBe(
      1,
    );
  });

  it('counts one value two rows carry on different members once', () => {
    // One row supplies `consented` and the other the variable held equal to
    // it, both saying `true`. That is one value of the group's slot between
    // them, so only one of the two rows is ever drawable.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { mirror: true }),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['consented', 'mirror'])).toBe(
      1,
    );
  });

  it('still counts every row when the group values they carry differ', () => {
    // Two rows spending a boolean each, and a third carrying neither member —
    // which the draw is asked to supply a group value for, exactly as it would
    // for a fabricated person. Nothing here is passed over.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: false }),
        rosterRow('c'),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['consented', 'mirror'])).toBe(
      3,
    );
  });

  it('adds a fabricating stage to what the group can spend', () => {
    // The roster's three rows build one person between them; the name
    // generator's two are drawn against the same slot and spend one apiece.
    const counts = worstCaseEntityCounts(
      [rosterStage(), nameGenerator({ id: 'ng', behaviours: { maxNodes: 2 } })],
      config,
      {
        'stage-roster': [
          valuedRow('a', { consented: true }),
          valuedRow('b', { consented: true }),
          valuedRow('c', { consented: true }),
        ],
      },
    );
    expect(nodeCountFor(counts.node, 'person', ['consented', 'mirror'])).toBe(
      3,
    );
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

  it('generates the drawable rows when a roster repeats a unique value', () => {
    // Three rows, two values between them: the draw passes the repeat over and
    // adds the two people it can. Counting the pool's length instead refused
    // this protocol for needing three distinct booleans it never asks for.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [rosterStage()],
      externalData: {
        'stage-roster': [
          valuedRow('a', { consented: true }),
          valuedRow('b', { consented: false }),
          valuedRow('c', { consented: true }),
        ],
      },
    });

    expect(network.nodes).toHaveLength(2);
  });

  it('still refuses when the rows really do exhaust the value space', () => {
    // The third row carries no `consented`, so the draw is asked for one — and
    // both booleans are already on the other two rows. Nothing is passed over
    // here, so an analysis that let this through would only move the refusal to
    // the draw, on whichever seeds reached the third person.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [rosterStage()],
        externalData: {
          'stage-roster': [
            valuedRow('a', { consented: true }),
            valuedRow('b', { consented: false }),
            rosterRow('c'),
          ],
        },
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 3 nodes of this type can be generated/);
  });

  it('still refuses when a fabricating stage needs what the roster left', () => {
    // The roster spends both booleans between its two distinct values, and the
    // name generator's person then has none left to be told apart by.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [
          rosterStage(),
          nameGenerator({ id: 'ng', behaviours: { minNodes: 1, maxNodes: 1 } }),
        ],
        externalData: {
          'stage-roster': [
            valuedRow('a', { consented: true }),
            valuedRow('b', { consented: false }),
            valuedRow('c', { consented: true }),
          ],
        },
      }),
    ).toThrow(/up to 3 nodes of this type can be generated/);
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

describe('generateNetwork with a unique group a roster populates unevenly', () => {
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
          mirror: {
            name: 'Mirror',
            type: 'boolean',
            validation: { sameAs: 'consented' },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  it('generates the one person three rows repeating a value can build', () => {
    // Reading `mirror` on its own counted three people against a two-value
    // space and refused this protocol. The rows share the group's `unique`
    // slot, so the draw takes the first and passes the other two over.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [rosterStage()],
      externalData: {
        'stage-roster': [
          valuedRow('a', { consented: true }),
          valuedRow('b', { consented: true }),
          valuedRow('c', { consented: true }),
        ],
      },
    });

    expect(network.nodes).toHaveLength(1);
    expect(network.nodes[0]?.[entityAttributesProperty]).toEqual({
      consented: true,
      mirror: true,
    });
  });

  it('still refuses when the rows really do exhaust the group', () => {
    // Two rows spend both booleans between them, and the third carries neither
    // member — so the draw is asked for a group value it has nothing left to
    // issue. Under-counting here would move this refusal into the draw.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [rosterStage()],
        externalData: {
          'stage-roster': [
            valuedRow('a', { consented: true }),
            valuedRow('b', { consented: false }),
            rosterRow('c'),
          ],
        },
      }),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('still refuses when a fabricating stage needs what the rows left', () => {
    // The roster's rows spend `true`, and the two people the name generator
    // fabricates have one boolean left to be told apart by.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [
          rosterStage(),
          nameGenerator({ id: 'ng', behaviours: { minNodes: 2, maxNodes: 2 } }),
        ],
        externalData: {
          'stage-roster': [
            valuedRow('a', { consented: true }),
            valuedRow('b', { consented: true }),
            valuedRow('c', { consented: true }),
          ],
        },
      }),
    ).toThrow(SyntheticDataConstraintError);
  });
});

describe('generateNetwork with a unique variable on a composer edge type', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: { name: { name: 'Name', type: 'text' } },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          strength: {
            name: 'Strength',
            type: 'boolean',
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  it('generates when the composer own people cannot exhaust the value space', () => {
    // Two people the composer builds itself reach one pair, whatever the five
    // the name generator added before it hold. Reading the protocol-wide total
    // refused this for needing 21 distinct booleans it never asks for.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [
        nameGenerator({ behaviours: { minNodes: 5, maxNodes: 5 } }),
        networkComposer(),
      ],
      config: { nodeCount: { min: 2, max: 2 } },
    });

    expect(network.nodes).toHaveLength(7);
    expect(network.edges.length).toBeLessThanOrEqual(1);
  });

  it('still refuses when the composer own people do exhaust it', () => {
    // Four people pair six ways and two booleans cannot tell six edges apart,
    // so this has to refuse up front rather than run out partway through the
    // composer's own pass.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [networkComposer()],
        config: { nodeCount: { min: 4, max: 4 } },
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 6 edges of this type can be generated/);
  });

  it('still refuses when a later census pairs everyone the composer added', () => {
    // The census reads the whole draft, composer people included, so the count
    // that matters there is the protocol-wide one.
    const census = {
      id: 'stage-census',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
      ],
    } as unknown as Stage;

    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [networkComposer(), census],
        config: { nodeCount: { min: 3, max: 3 } },
      }),
    ).toThrow(/up to 6 edges of this type can be generated/);
  });
});

describe('generateNetwork with a filtered pair-edge stage', () => {
  const person = {
    name: 'Person',
    color: 'node-color-seq-1',
    variables: {
      band: {
        name: 'Band',
        type: 'ordinal',
        options: [
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
          { label: 'C', value: 3 },
        ],
        validation: { unique: true },
      },
    },
  };

  const filteredCensus = {
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    filter: {
      rules: [
        {
          id: 'r1',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'band',
            operator: 'EXACTLY',
            value: 1,
          },
        },
      ],
    },
    prompts: [
      { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
    ],
  } as unknown as Stage;

  const stages = [
    nameGenerator({ behaviours: { minNodes: 3, maxNodes: 3 } }),
    filteredCensus,
  ];

  it('creates no edges at all when the filter admits one node', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook: {
        node: { person },
        edge: {
          knows: { name: 'Knows', color: 'edge-color-seq-1', variables: {} },
        },
      } as unknown as Parameters<typeof generateNetwork>[0]['codebook'],
      stages,
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(3);
    expect(network.edges).toHaveLength(0);
  });

  it('refuses it anyway, counting the pairs the filter is not read to exclude', () => {
    // A deliberate over-count, and the one the count above proves is wide: this
    // stage creates no edges at all, yet three pairs are counted against the
    // two booleans and the protocol is refused.
    //
    // Kept because no bound tighter than this is sound. Whether a node passes a
    // filter depends on values the analysis has not drawn, so the filtered set
    // is genuinely unknown here; the narrowing this case invites — "the
    // attribute is `unique`, so one node can hold the value the rule names" —
    // reads the conclusion of the very check being run, and would silently
    // become an under-count the moment the `unique` check gains an exemption
    // (as it has twice already, for roster rows and for bin-assigned
    // variables). Deferring the capacity check to the draw instead is the same
    // under-count by another route: the protocol would pass analysis and refuse
    // partway through, on whichever seeds reached it.
    //
    // An over-count costs a refusal that should not stand. An under-count costs
    // a run that throws mid-draw, which this whole pass exists to prevent.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook: {
          node: { person },
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
              variables: {
                strength: {
                  name: 'Strength',
                  type: 'boolean',
                  validation: { unique: true },
                },
              },
            },
          },
        } as unknown as Parameters<typeof generateNetwork>[0]['codebook'],
        stages,
        respectSkipLogicAndFiltering: true,
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 3 edges of this type can be generated/);
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

/**
 * The interview reuses the pair's edge when two prompts name one edge type —
 * `edgeExists({ from, to, type })` on the shared graph — but the generator
 * does not: `handleDyadCensus` runs `createEdgesForPairs` once per prompt and
 * appends everything it returns. These pin the behaviour the per-prompt sum in
 * `worstCaseEntityCounts` bounds, so deduplicating that count cannot land
 * without the handler being changed to match.
 */
describe('generateNetwork with two prompts sharing one edge type', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: { name: { name: 'Name', type: 'text' } },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          band: {
            name: 'Band',
            type: 'ordinal',
            options: [1, 2, 3, 4, 5, 6].map((value) => ({
              label: `Band ${value}`,
              value,
            })),
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  const census = {
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
      { id: 'p2', text: 'Are they close?', createEdge: 'knows' },
    ],
  } as unknown as Stage;

  const threePeople = nameGenerator({
    behaviours: { minNodes: 3, maxNodes: 3 },
  });

  it('creates an edge per pair per prompt, each spending its own value', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook,
      stages: [threePeople, census],
      config: { censusEdgeProbability: { min: 1, max: 1 } },
    });

    const knows = network.edges.filter((edge) => edge.type === 'knows');
    const bands = knows.map((edge) => edge[entityAttributesProperty].band);

    // C(3, 2) = 3 pairs for each of the two prompts.
    expect(knows).toHaveLength(6);
    expect(new Set(bands).size).toBe(6);
  });

  it('refuses a value space that only covers one prompt', () => {
    const threeBands = {
      ...codebook,
      edge: {
        knows: {
          name: 'Knows',
          color: 'edge-color-seq-1',
          variables: {
            band: {
              name: 'Band',
              type: 'ordinal',
              options: [1, 2, 3].map((value) => ({
                label: `Band ${value}`,
                value,
              })),
              validation: { unique: true },
            },
          },
        },
      },
    } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

    // Three values for the six edges the two prompts create between them.
    // Counting the shared type once would accept this and leave the draw to
    // run out of values on the fourth edge.
    expect(() =>
      generateNetwork({
        seed: 3,
        codebook: threeBands,
        stages: [threePeople, census],
        config: { censusEdgeProbability: { min: 1, max: 1 } },
      }),
    ).toThrow(/up to 6 edges of this type can be generated/);
  });
});

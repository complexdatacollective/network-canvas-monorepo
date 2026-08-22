import { describe, expect, it } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  GAMETE_ROLE_OPTIONS,
  isFamilyPedigreeStageMetadata,
  type NcEdge,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import {
  scopeKey,
  uniqueSlotMembers,
} from '../../constraints/generateEntityAttributes';
import { simulateFamilyPedigree } from '../FamilyPedigree';
import type { FamilyPedigreeOptions } from '../familyPedigree/options';
import type { SimulationContext } from '../types';
import { harnessFor, type Harness, parseProtocol } from './harness';

/**
 * C4 for FamilyPedigree: one commit puts a whole family into the session —
 * nodes added with `allowUnknownAttributes`, relationships added as plain
 * edges over the stage's single edge type, and the committed membership
 * recorded as the stage's own metadata, which is what the interface reads back
 * when the participant returns.
 */

const codebook = {
  node: {
    'family-member': {
      name: 'Family member',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: {
          name: 'name',
          type: 'text',
          component: 'Text',
          validation: { unique: true },
        },
        isEgo: { name: 'isEgo', type: 'boolean' },
        relationship: { name: 'relationship', type: 'text' },
        biologicalSex: {
          name: 'biologicalSex',
          type: 'categorical',
          options: BIOLOGICAL_SEX_OPTIONS,
        },
        condition: { name: 'condition', type: 'boolean' },
      },
    },
  },
  edge: {
    'family-edge': {
      name: 'Family edge',
      color: 'edge-color-seq-1',
      variables: {
        relationshipType: {
          name: 'relationshipType',
          type: 'categorical',
          options: RELATIONSHIP_TYPE_OPTIONS,
        },
        isActive: { name: 'isActive', type: 'boolean' },
        isGestationalCarrier: {
          name: 'isGestationalCarrier',
          type: 'boolean',
        },
        gameteRole: {
          name: 'gameteRole',
          type: 'categorical',
          options: GAMETE_ROLE_OPTIONS,
        },
      },
    },
  },
};

const familyStage = {
  id: 'family-stage',
  type: 'FamilyPedigree',
  label: 'Your family',
  nodeConfig: {
    type: 'family-member',
    nodeLabelVariable: 'name',
    egoVariable: 'isEgo',
    relationshipVariable: 'relationship',
    biologicalSexVariable: 'biologicalSex',
  },
  edgeConfig: {
    type: 'family-edge',
    relationshipTypeVariable: 'relationshipType',
    isActiveVariable: 'isActive',
    isGestationalCarrierVariable: 'isGestationalCarrier',
    gameteRoleVariable: 'gameteRole',
  },
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'required',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Build your family.',
  nominationPrompts: [
    { id: 'condition-prompt', text: 'Who has this?', variable: 'condition' },
  ],
};

const narrativeStage = {
  id: 'narrative-stage',
  type: 'NarrativePedigree',
  label: 'The condition',
  sourceStageId: 'family-stage',
  showAtRiskStatuses: true,
  diseases: [
    {
      id: 'condition',
      label: 'Condition',
      color: '#cc0000',
      variable: 'condition',
      inheritancePattern: 'autosomalDominant',
    },
  ],
};

const protocolFor = (stages: unknown[] = [familyStage, narrativeStage]) =>
  parseProtocol(codebook, stages);

const setUp = ({
  protocol = protocolFor(),
  seed,
  familyPedigree,
}: {
  protocol?: CurrentProtocol;
  seed?: number;
  familyPedigree?: FamilyPedigreeOptions;
} = {}): { harness: Harness; context: SimulationContext } => {
  const harness = harnessFor(protocol, seed === undefined ? {} : { seed });
  return {
    harness,
    context: {
      ...harness.context,
      ...(familyPedigree ? { familyPedigree } : {}),
    },
  };
};

const runStage = (
  { harness, context }: { harness: Harness; context: SimulationContext },
  promptBound?: number,
): void => {
  const stage = harness.context.protocol.stages[0];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateFamilyPedigree(
    stage as Extract<Stage, { type: 'FamilyPedigree' }>,
    context,
    promptBound,
  );
};

const committedMetadata = (harness: Harness) => {
  const entry = harness.engine.draft.stageMetadata['0'];
  if (!isFamilyPedigreeStageMetadata(entry)) {
    throw new Error('the stage committed no family-pedigree metadata');
  }
  return entry;
};

const edges = (harness: Harness): NcEdge[] =>
  harness.engine.draft.network.edges;

const relationshipOf = (edge: NcEdge): string => {
  const value = edge[entityAttributesProperty].relationshipType;
  return Array.isArray(value) ? String(value[0]) : String(value);
};

describe('simulateFamilyPedigree', () => {
  describe('the committed family', () => {
    it('adds a multi-generational family and its relationships', () => {
      const fixture = setUp();
      runStage(fixture);

      // Ego, two parents and four grandparents is the smallest complete
      // pedigree this generator emits.
      expect(fixture.harness.nodes().length).toBeGreaterThanOrEqual(7);
      expect(edges(fixture.harness).length).toBeGreaterThan(0);
      for (const node of fixture.harness.nodes()) {
        expect(node.type).toBe('family-member');
      }
      for (const edge of edges(fixture.harness)) {
        expect(edge.type).toBe('family-edge');
      }
    });

    it('marks exactly one family member as the participant', () => {
      const fixture = setUp();
      runStage(fixture);

      const egos = fixture.harness
        .nodes()
        .filter((node) => node[entityAttributesProperty].isEgo === true);

      expect(egos).toHaveLength(1);
    });

    it('gives every relationship a kind and an active flag', () => {
      const fixture = setUp();
      runStage(fixture);

      for (const edge of edges(fixture.harness)) {
        expect(RELATIONSHIP_TYPE_OPTIONS.map((o) => o.value)).toContain(
          relationshipOf(edge),
        );
        expect(typeof edge[entityAttributesProperty].isActive).toBe('boolean');
      }
    });

    it('gives edges only attributes the codebook defines, and no provenance', () => {
      // `allowUnknownAttributes` is a node-side allowance: the pedigree carries
      // a researcher-designed node form, but its edges are its own and every
      // key on them is a codebook variable. Edges also carry no `stageId` or
      // `promptIDs` — the reducer stamps neither.
      const fixture = setUp();
      runStage(fixture);

      const known = new Set(
        Object.keys(codebook.edge['family-edge'].variables),
      );
      for (const edge of edges(fixture.harness)) {
        expect(Object.keys(edge).toSorted()).toEqual([
          '_uid',
          'attributes',
          'from',
          'to',
          'type',
        ]);
        for (const key of Object.keys(edge[entityAttributesProperty])) {
          expect(known).toContain(key);
        }
      }
    });

    it('connects only people the commit actually created', () => {
      const fixture = setUp();
      runStage(fixture);

      const ids = new Set(
        fixture.harness.nodes().map((node) => node[entityPrimaryKeyProperty]),
      );
      for (const edge of edges(fixture.harness)) {
        expect(ids).toContain(edge.from);
        expect(ids).toContain(edge.to);
      }
    });
  });

  describe('the committed membership metadata', () => {
    it('records the commit against the stage the participant was on', () => {
      const fixture = setUp();
      runStage(fixture);

      expect(committedMetadata(fixture.harness).isNetworkCommitted).toBe(true);
      expect(Object.keys(fixture.harness.engine.draft.stageMetadata)).toEqual([
        '0',
      ]);
    });

    it('names every family member and every relationship in the session', () => {
      const fixture = setUp();
      runStage(fixture);

      const metadata = committedMetadata(fixture.harness);
      const nodeIds = new Set(
        fixture.harness.nodes().map((node) => node[entityPrimaryKeyProperty]),
      );
      const edgeIds = new Set(
        edges(fixture.harness).map((edge) => edge[entityPrimaryKeyProperty]),
      );

      expect(metadata.nodes?.length).toBe(nodeIds.size);
      for (const row of metadata.nodes ?? []) {
        expect(nodeIds).toContain(row.id);
      }
      expect(metadata.edges?.length).toBe(edgeIds.size);
      for (const row of metadata.edges ?? []) {
        expect(edgeIds).toContain(row.id);
        expect(nodeIds).toContain(row.from);
        expect(nodeIds).toContain(row.to);
      }
    });

    it('marks the participant’s own row as the ego', () => {
      const fixture = setUp();
      runStage(fixture);

      const metadata = committedMetadata(fixture.harness);
      const egoRows = (metadata.nodes ?? []).filter((row) => row.isEgo);

      expect(egoRows).toHaveLength(1);
      expect(egoRows[0]?.label).toBe('You');
    });
  });

  describe('people the participant named earlier', () => {
    it('takes them into the pedigree without touching their attributes', () => {
      // The live commit walks its `preexistingReduxNodeIds` and dispatches
      // NOTHING for them (`finalizeNetwork`): the store's normalised view of
      // an earlier node — ego flag cleared, structural slots filled — lives
      // only in the committed metadata snapshot, while the shared network
      // keeps exactly what earlier stages recorded. A variable the pedigree
      // would have defaulted stays ABSENT ("never asked"), not false.
      const fixture = setUp();
      fixture.harness.engine.addNode({
        nodeType: 'family-member',
        uid: 'earlier-person',
        attributeData: { name: 'Ada', isEgo: true },
        currentStep: 0,
      });
      runStage(fixture);

      const earlier = fixture.harness
        .nodes()
        .find((node) => node[entityPrimaryKeyProperty] === 'earlier-person');

      expect(earlier?.[entityAttributesProperty].isEgo).toBe(true);
      expect(earlier?.[entityAttributesProperty].name).toBe('Ada');
      expect('condition' in (earlier?.[entityAttributesProperty] ?? {})).toBe(
        false,
      );

      const metadata = committedMetadata(fixture.harness);
      expect((metadata.nodes ?? []).map((row) => row.id)).toContain(
        'earlier-person',
      );
    });
  });

  describe('the run’s family options', () => {
    it('forces the scenario the caller asked for', () => {
      const fixture = setUp({ familyPedigree: { scenario: 'adoption' } });
      runStage(fixture);

      const kinds = new Set(edges(fixture.harness).map(relationshipOf));
      expect(kinds).toContain('adoptive');
    });

    it('leaves every nomination variable unaffected when asked to', () => {
      const fixture = setUp({ familyPedigree: { diseaseMode: 'none' } });
      runStage(fixture);

      for (const node of fixture.harness.nodes()) {
        expect(node[entityAttributesProperty].condition).toBe(false);
      }
    });

    it('plants an affected lineage by default', () => {
      const fixture = setUp();
      runStage(fixture);

      const affected = fixture.harness
        .nodes()
        .filter((node) => node[entityAttributesProperty].condition === true);

      expect(affected.length).toBeGreaterThan(0);
    });
  });

  describe('determinism', () => {
    it('commits the same family on the same seed, ids included', () => {
      const first = setUp({ seed: 5 });
      runStage(first);
      const second = setUp({ seed: 5 });
      runStage(second);

      expect(first.harness.engine.draft.network).toEqual(
        second.harness.engine.draft.network,
      );
      expect(first.harness.engine.draft.stageMetadata).toEqual(
        second.harness.engine.draft.stageMetadata,
      );
    });

    it('commits a different family on a different seed', () => {
      const first = setUp({ seed: 5 });
      runStage(first);
      const second = setUp({ seed: 6 });
      runStage(second);

      expect(first.harness.engine.draft.network).not.toEqual(
        second.harness.engine.draft.network,
      );
    });

    it('gives every entity a uuid-shaped id from the session’s stream', () => {
      const fixture = setUp({ seed: 5 });
      runStage(fixture);

      const uuidShape =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      for (const node of fixture.harness.nodes()) {
        expect(node[entityPrimaryKeyProperty]).toMatch(uuidShape);
      }
      for (const edge of edges(fixture.harness)) {
        expect(edge[entityPrimaryKeyProperty]).toMatch(uuidShape);
      }
    });
  });

  it('records the family’s unique values against the whole session', () => {
    // The wrapped generator keeps its own books, so what it issued has to be
    // handed to the session's registry: a later stage drawing this variable
    // must not land on a name a family member is already holding.
    const fixture = setUp();
    runStage(fixture);

    const scope = { entity: 'node', type: 'family-member' } as const;
    const slots = uniqueSlotMembers(
      fixture.context.entityConstraints.forScope(scope),
    );
    const [slot] = [...slots.keys()];
    if (slot === undefined) throw new Error('the fixture declares no unique');

    const names = fixture.harness
      .nodes()
      .map((node) => node[entityAttributesProperty].name)
      .filter((value) => value !== undefined);

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(
        fixture.context.uniqueRegistry.isTaken(scopeKey(scope), slot, name),
      ).toBe(true);
    }
  });

  it('commits nothing at a stop-at bound of zero', () => {
    const fixture = setUp();
    runStage(fixture, 0);

    expect(fixture.harness.nodes()).toEqual([]);
    expect(edges(fixture.harness)).toEqual([]);
    expect(fixture.harness.engine.draft.stageMetadata).toEqual({});
  });
});

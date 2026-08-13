import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  RELATIONSHIP_TYPE_OPTIONS,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { ValueGenerator } from '../../ValueGenerator';
import { resolveGenerationConfig } from '../config';
import { buildEntityConstraints } from '../constraints/buildConstraints';
import { UniqueRegistry } from '../constraints/uniqueRegistry';
import type { GenerationContext, NetworkDraft, StageOfType } from '../context';
import { materializeFamilyPedigree } from '../familyPedigree/materializeFamilyPedigree';
import { resolveFamilyPedigreeGenerationOptions } from '../familyPedigree/referencePopulation';

const TODAY = '2026-08-13';

const codebook = {
  node: {
    'family-member': {
      name: 'Family member',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        isEgo: { name: 'Is ego', type: 'boolean' },
      },
    },
  },
  edge: {
    'family-edge': {
      name: 'Family edge',
      color: 'edge-color-seq-1',
      variables: {
        relationshipType: {
          name: 'Relationship type',
          type: 'categorical',
          options: RELATIONSHIP_TYPE_OPTIONS,
        },
      },
    },
  },
  ego: { variables: {} },
} as unknown as StructuralCodebook;

function makeCtx(): GenerationContext {
  return {
    codebook,
    valueGen: new ValueGenerator(42, TODAY),
    config: resolveGenerationConfig({ today: TODAY }),
    usedRosterUids: new Set<string>(),
    externalData: undefined,
    respectSkipLogicAndFiltering: false,
    uniqueRegistry: new UniqueRegistry(),
    entityConstraints: {
      ego: buildEntityConstraints(codebook.ego?.variables, TODAY),
      node: new Map(
        Object.entries(codebook.node ?? {}).map(([type, definition]) => [
          type,
          buildEntityConstraints(definition.variables, TODAY),
        ]),
      ),
      edge: new Map(
        Object.entries(codebook.edge ?? {}).map(([type, definition]) => [
          type,
          buildEntityConstraints(definition.variables, TODAY),
        ]),
      ),
    },
  };
}

const pedigreeStage = (
  id: string,
  requireChildrenContributors: 'off' | 'required',
): Stage =>
  ({
    id,
    type: 'FamilyPedigree',
    label: 'Family',
    nodeConfig: {
      type: 'family-member',
      nodeLabelVariable: 'name',
      egoVariable: 'isEgo',
    },
    edgeConfig: {
      type: 'family-edge',
      relationshipTypeVariable: 'relationshipType',
    },
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors,
    },
    censusPrompt: 'Build your family.',
  }) as unknown as Stage;

const familyNode = (uid: string, isEgo: boolean, stageId?: string): NcNode => ({
  [entityPrimaryKeyProperty]: uid,
  type: 'family-member',
  [entityAttributesProperty]: { name: `Person ${uid}`, isEgo },
  ...(stageId === undefined ? {} : { stageId }),
});

const familyEdge = (
  uid: string,
  from: string,
  to: string,
  relationshipType: 'biological' | 'partner',
): NcEdge => ({
  [entityPrimaryKeyProperty]: uid,
  type: 'family-edge',
  from,
  to,
  [entityAttributesProperty]: { relationshipType: [relationshipType] },
});

function runSecondPedigree(nodes: NcNode[], edges: NcEdge[]): NetworkDraft {
  const draft: NetworkDraft = {
    egoUid: 'session-ego',
    egoAttributes: {},
    nodes,
    edges,
    stageMetadata: {},
  };
  const stages = [
    pedigreeStage('fp-1', 'off'),
    pedigreeStage('fp-2', 'required'),
  ];
  materializeFamilyPedigree(
    makeCtx(),
    draft,
    stages[1] as StageOfType<'FamilyPedigree'>,
    1,
    stages,
    stages,
    7,
    resolveFamilyPedigreeGenerationOptions(undefined, 40),
  );
  return draft;
}

const readRelationshipType = (edge: NcEdge): string | undefined => {
  const value = edge[entityAttributesProperty].relationshipType;
  return Array.isArray(value) && value.length === 1
    ? (value[0] as string)
    : undefined;
};

describe('inherited contributor ancestry identity scoping', () => {
  it('keeps distinct co-parents\' minted ancestors distinct (uids "x" vs "x-parent-0")', () => {
    // Roster rows keep their caller-chosen `_uid` (networkPlan.ts mintUid
    // comment documents this), so co-parent uids 'x' and 'x-parent-0' are
    // legitimate. Both are genetic parents of the inherited ego's child.
    const draft = runSecondPedigree(
      [
        familyNode('ego-1', true, 'fp-1'),
        familyNode('child-1', false),
        familyNode('x', false),
        familyNode('x-parent-0', false),
      ],
      [
        familyEdge('e1', 'ego-1', 'child-1', 'biological'),
        familyEdge('e2', 'x', 'child-1', 'biological'),
        familyEdge('e3', 'x-parent-0', 'child-1', 'biological'),
      ],
    );

    const biological = draft.edges.filter(
      (edge) =>
        edge.type === 'family-edge' &&
        readRelationshipType(edge) === 'biological',
    );
    const parentsOf = (id: string) =>
      biological.filter((edge) => edge.to === id).map((edge) => edge.from);

    const parentsOfX = parentsOf('x');
    const parentsOfXParent0 = parentsOf('x-parent-0');
    // Both co-parents must have had two genetic parents completed.
    expect(parentsOfX).toHaveLength(2);
    expect(parentsOfXParent0).toHaveLength(2);

    const grandparentsOfX = parentsOfX.flatMap(parentsOf);
    // The relatives minted above co-parent 'x' and those minted above
    // co-parent 'x-parent-0' are different people: no node may be both a
    // grandparent of 'x' and a parent of 'x-parent-0'.
    const merged = parentsOfXParent0.filter((id) =>
      grandparentsOfX.includes(id),
    );
    expect(merged).toEqual([]);
  });

  it('control: non-colliding co-parent uids get distinct ancestors', () => {
    const draft = runSecondPedigree(
      [
        familyNode('ego-1', true, 'fp-1'),
        familyNode('child-1', false),
        familyNode('x', false),
        familyNode('y', false),
      ],
      [
        familyEdge('e1', 'ego-1', 'child-1', 'biological'),
        familyEdge('e2', 'x', 'child-1', 'biological'),
        familyEdge('e3', 'y', 'child-1', 'biological'),
      ],
    );
    const biological = draft.edges.filter(
      (edge) =>
        edge.type === 'family-edge' &&
        readRelationshipType(edge) === 'biological',
    );
    const parentsOf = (id: string) =>
      biological.filter((edge) => edge.to === id).map((edge) => edge.from);
    const parentsOfX = parentsOf('x');
    const parentsOfY = parentsOf('y');
    expect(parentsOfX).toHaveLength(2);
    expect(parentsOfY).toHaveLength(2);
    const grandparentsOfX = parentsOfX.flatMap(parentsOf);
    expect(grandparentsOfX).toHaveLength(4);
    expect(parentsOfY.filter((id) => grandparentsOfX.includes(id))).toEqual([]);
  });

  it('control: with no colliding partner edge the parents are partnered', () => {
    const draft = runSecondPedigree(
      [
        familyNode('ego-1', true, 'fp-1'),
        familyNode('child-1', false),
        familyNode('cp', false),
        familyNode('a', false),
        familyNode('b::c', false),
      ],
      [
        familyEdge('e1', 'ego-1', 'child-1', 'biological'),
        familyEdge('e2', 'cp', 'child-1', 'biological'),
        familyEdge('e3', 'a', 'cp', 'biological'),
        familyEdge('e4', 'b::c', 'cp', 'biological'),
      ],
    );
    const partnerEdges = draft.edges.filter(
      (edge) =>
        edge.type === 'family-edge' && readRelationshipType(edge) === 'partner',
    );
    const partnered = partnerEdges.some(
      (edge) =>
        (edge.from === 'a' && edge.to === 'b::c') ||
        (edge.from === 'b::c' && edge.to === 'a'),
    );
    expect(partnered).toBe(true);
  });

  it('partners a co-parent\'s two existing genetic parents even when an unrelated partner edge\'s uids collide under "::" joining', () => {
    // Existing partner edge ('a::b', 'c') keys as partner:a::b::c — the same
    // key the new partner relationship between existing parents 'a' and
    // 'b::c' produces. The live interface would still link 'a' and 'b::c'.
    const draft = runSecondPedigree(
      [
        familyNode('ego-1', true, 'fp-1'),
        familyNode('child-1', false),
        familyNode('cp', false),
        familyNode('a', false),
        familyNode('b::c', false),
        familyNode('a::b', false),
        familyNode('c', false),
      ],
      [
        familyEdge('e1', 'ego-1', 'child-1', 'biological'),
        familyEdge('e2', 'cp', 'child-1', 'biological'),
        familyEdge('e3', 'a', 'cp', 'biological'),
        familyEdge('e4', 'b::c', 'cp', 'biological'),
        familyEdge('e5', 'a::b', 'c', 'partner'),
      ],
    );

    const partnerEdges = draft.edges.filter(
      (edge) =>
        edge.type === 'family-edge' && readRelationshipType(edge) === 'partner',
    );
    const partnered = partnerEdges.some(
      (edge) =>
        (edge.from === 'a' && edge.to === 'b::c') ||
        (edge.from === 'b::c' && edge.to === 'a'),
    );
    // Co-parent 'cp' has two known genetic parents; contributor completion
    // partners them (materializeFamilyPedigree ensureParents -> addPartner).
    expect(partnered).toBe(true);
  });
});

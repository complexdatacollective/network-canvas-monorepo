import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { createInitialNetwork } from '../../../contract/network';
import sessionReducer from '../../../store/modules/session';
import type { useAppDispatch } from '../../../store/store';
import { createFamilyPedigreeStore, type VariableConfig } from '../store';
import {
  pedigreeMemberEdgeIds,
  pedigreeMemberIds,
} from '../utils/pedigreeMembership';

const testConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'label',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'relationshipType',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGestationalCarrier',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

describe('store creation', () => {
  it('creates an empty store', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const state = store.getState();

    expect(state.step).toBe('scaffolding');
    expect(state.network.nodes.size).toBe(0);
    expect(state.network.edges.size).toBe(0);
  });

  it('creates a store with initial data', () => {
    const nodes = new Map<string, NcNode>([
      [
        'n1',
        {
          _uid: 'n1',
          type: 'person',
          [entityAttributesProperty]: {
            [testConfig.nodeLabelVariable]: 'ego',
            [testConfig.egoVariable]: true,
          },
        },
      ],
      [
        'n2',
        {
          _uid: 'n2',
          type: 'person',
          [entityAttributesProperty]: {
            [testConfig.nodeLabelVariable]: 'mother',
            [testConfig.egoVariable]: false,
          },
        },
      ],
    ]);
    const edges = new Map<string, NcEdge>([
      [
        'e1',
        {
          _uid: 'e1',
          type: 'family',
          from: 'n2',
          to: 'n1',
          [entityAttributesProperty]: {
            [testConfig.relationshipTypeVariable]: ['biological'],
            [testConfig.isActiveVariable]: true,
          },
        },
      ],
    ]);

    const store = createFamilyPedigreeStore(
      nodes,
      edges,
      new Map(),
      testConfig,
    );
    const state = store.getState();

    expect(state.network.nodes.size).toBe(2);
    expect(state.network.edges.size).toBe(1);
    expect(
      state.network.nodes.get('n1')?.[entityAttributesProperty][
        testConfig.nodeLabelVariable
      ],
    ).toBe('ego');
  });
});

describe('addNode', () => {
  it('creates a node with a generated id', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const id = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'test',
      },
    });

    expect(id).toBeDefined();
    expect(store.getState().network.nodes.has(id)).toBe(true);
  });

  it('stores data correctly without the id field', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const id = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: true,
        [testConfig.nodeLabelVariable]: 'ego',
      },
    });

    const node = store.getState().network.nodes.get(id);
    expect(node?.[entityAttributesProperty][testConfig.nodeLabelVariable]).toBe(
      'ego',
    );
    expect(node?.[entityAttributesProperty][testConfig.egoVariable]).toBe(true);
    expect(node?.type).toBe('person');
    expect(node?._uid).toBe(id);
  });

  it('uses a provided id', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const id = store.getState().addNode({
      id: 'custom-id',
      attributes: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'test',
      },
    });

    expect(id).toBe('custom-id');
    expect(store.getState().network.nodes.has('custom-id')).toBe(true);
  });
});

describe('updateNode', () => {
  it('merges partial updates', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const id = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'test',
      },
    });

    store.getState().updateNode(id, {
      [testConfig.nodeLabelVariable]: 'updated',
    });

    const node = store.getState().network.nodes.get(id);
    expect(node?.[entityAttributesProperty][testConfig.nodeLabelVariable]).toBe(
      'updated',
    );
    expect(node?.[entityAttributesProperty][testConfig.egoVariable]).toBe(
      false,
    );
  });

  it('writes __proto__ updates as inert own attributes', () => {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      '__proto__',
    );
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const id = store.getState().addNode({
      attributes: { [testConfig.egoVariable]: false },
    });
    const updates: Record<string, string[]> = {};
    Object.defineProperty(updates, '__proto__', {
      enumerable: true,
      value: ['preserved'],
    });

    store.getState().updateNode(id, updates);

    const attributes = store.getState().network.nodes.get(id)?.[
      entityAttributesProperty
    ];
    expect(Object.hasOwn(attributes ?? {}, '__proto__')).toBe(true);
    expect(attributes?.['__proto__']).toEqual(['preserved']);
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    expect(
      Object.getOwnPropertyDescriptor(Object.prototype, '__proto__'),
    ).toEqual(prototypeDescriptor);
  });
});

describe('removeNode', () => {
  it('deletes the node and cascading edges', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const parentId = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'parent',
      },
    });
    const childId = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'child',
      },
    });
    const unrelatedId = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'other',
      },
    });

    store.getState().addEdge({
      from: parentId,
      to: childId,
      attributes: {
        [testConfig.relationshipTypeVariable]: ['biological'],
        [testConfig.isActiveVariable]: true,
      },
    });
    const keptEdgeId = store.getState().addEdge({
      from: unrelatedId,
      to: parentId,
      attributes: {
        [testConfig.relationshipTypeVariable]: ['partner'],
        [testConfig.isActiveVariable]: true,
      },
    });

    store.getState().removeNode(childId);

    expect(store.getState().network.nodes.has(childId)).toBe(false);
    const remainingEdges = Array.from(
      store.getState().network.edges.values(),
    ).filter((e) => e.from === childId || e.to === childId);
    expect(remainingEdges).toHaveLength(0);
    expect(store.getState().network.edges.has(keptEdgeId)).toBe(true);
  });
});

describe('addEdge', () => {
  it('creates a parent edge with edgeType', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const id = store.getState().addEdge({
      from: 'n1',
      to: 'n2',
      attributes: {
        [testConfig.relationshipTypeVariable]: ['biological'],
        [testConfig.isActiveVariable]: true,
      },
    });

    const edge = store.getState().network.edges.get(id);
    expect(edge).toBeDefined();
    expect(
      edge?.[entityAttributesProperty][testConfig.relationshipTypeVariable],
    ).toEqual(['biological']);
  });

  it('creates a partner edge with current flag', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const id = store.getState().addEdge({
      from: 'n1',
      to: 'n2',
      attributes: {
        [testConfig.relationshipTypeVariable]: ['partner'],
        [testConfig.isActiveVariable]: true,
      },
    });

    const edge = store.getState().network.edges.get(id);
    expect(edge).toBeDefined();
    expect(
      edge?.[entityAttributesProperty][testConfig.relationshipTypeVariable],
    ).toEqual(['partner']);
    expect(edge?.[entityAttributesProperty][testConfig.isActiveVariable]).toBe(
      true,
    );
  });

  it('strips the id field from stored data', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const id = store.getState().addEdge({
      id: 'custom-edge',
      from: 'n1',
      to: 'n2',
      attributes: {
        [testConfig.relationshipTypeVariable]: ['donor'],
        [testConfig.isActiveVariable]: true,
      },
    });

    expect(id).toBe('custom-edge');
    const edge = store.getState().network.edges.get(id);
    expect(edge?._uid).toBe('custom-edge');
  });

  it('writes __proto__ updates as inert own attributes', async () => {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      '__proto__',
    );
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const id = store.getState().addEdge({
      from: 'n1',
      to: 'n2',
      attributes: {
        [testConfig.relationshipTypeVariable]: ['biological'],
      },
    });
    const updates: Record<string, string[]> = {};
    Object.defineProperty(updates, '__proto__', {
      enumerable: true,
      value: ['preserved'],
    });

    await store.getState().updateEdge(id, updates);

    const attributes = store.getState().network.edges.get(id)?.[
      entityAttributesProperty
    ];
    expect(Object.hasOwn(attributes ?? {}, '__proto__')).toBe(true);
    expect(attributes?.['__proto__']).toEqual(['preserved']);
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    expect(
      Object.getOwnPropertyDescriptor(Object.prototype, '__proto__'),
    ).toEqual(prototypeDescriptor);
  });
});

describe('duplicate edge guard', () => {
  function newStore() {
    return createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
  }
  function bio(from: string, to: string) {
    return {
      from,
      to,
      attributes: {
        [testConfig.relationshipTypeVariable]: ['biological'],
        [testConfig.isActiveVariable]: true,
      },
    };
  }

  it('throws when a second edge of the same type connects the same pair', () => {
    const store = newStore();
    store.getState().addEdge(bio('parent', 'child'));
    expect(() => store.getState().addEdge(bio('parent', 'child'))).toThrow(
      /Duplicate/,
    );
  });

  it('throws regardless of edge direction', () => {
    const store = newStore();
    store.getState().addEdge(bio('a', 'b'));
    expect(() => store.getState().addEdge(bio('b', 'a'))).toThrow(/Duplicate/);
  });

  it('allows the same relationship type between different pairs', () => {
    const store = newStore();
    store.getState().addEdge(bio('mum', 'child'));
    expect(() => store.getState().addEdge(bio('dad', 'child'))).not.toThrow();
  });

  it('throws when a commit batch would create a duplicate', () => {
    const store = newStore();
    store.getState().addEdge(bio('parent', 'child'));
    expect(() =>
      store.getState().commitBatch({
        nodes: [],
        edges: [
          {
            source: 'parent',
            target: 'child',
            data: {
              attributes: {
                [testConfig.relationshipTypeVariable]: ['biological'],
                [testConfig.isActiveVariable]: true,
              },
            },
          },
        ],
      }),
    ).toThrow(/Duplicate/);
  });
});

describe('removeEdge', () => {
  it('deletes the edge', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    const id = store.getState().addEdge({
      from: 'n1',
      to: 'n2',
      attributes: {
        [testConfig.relationshipTypeVariable]: ['partner'],
        [testConfig.isActiveVariable]: false,
      },
    });

    expect(store.getState().network.edges.has(id)).toBe(true);
    store.getState().removeEdge(id);
    expect(store.getState().network.edges.has(id)).toBe(false);
  });
});

describe('clearNetwork', () => {
  it('removes all nodes and edges', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: true,
        [testConfig.nodeLabelVariable]: 'a',
      },
    });
    store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'b',
      },
    });
    store.getState().addEdge({
      from: 'x',
      to: 'y',
      attributes: {
        [testConfig.relationshipTypeVariable]: ['partner'],
        [testConfig.isActiveVariable]: true,
      },
    });

    store.getState().clearNetwork();

    expect(store.getState().network.nodes.size).toBe(0);
    expect(store.getState().network.edges.size).toBe(0);
  });
});

describe('setStep', () => {
  it('changes step', () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
    );
    expect(store.getState().step).toBe('scaffolding');

    store.getState().setStep('diseaseNomination');
    expect(store.getState().step).toBe('diseaseNomination');
  });
});

// generateQuickStartNetwork tests removed — function replaced by cell-based wizards

describe('syncMetadata', () => {
  it('dispatches updateStageMetadata with serialized nodes and edges', () => {
    const dispatched: unknown[] = [];
    const mockDispatch = ((action: unknown) => {
      dispatched.push(action);
      return action;
    }) as ReturnType<typeof useAppDispatch>;

    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
      mockDispatch,
    );
    store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: true,
        [testConfig.nodeLabelVariable]: 'Ego',
      },
    });
    store.getState().syncMetadata();
    expect(dispatched.length).toBe(1);
  });
});

describe('finalizeNetwork', () => {
  const STAGE_ID = 'pedigree-stage';

  function createReduxStore(
    preloadedNodes: NcNode[],
    preloadedEdges: NcEdge[] = [],
  ) {
    const protocolState = {
      codebook: {
        node: { [testConfig.nodeType]: { name: 'Person' } },
        edge: {
          [testConfig.edgeType]: {
            name: 'Family',
            variables: {
              [testConfig.relationshipTypeVariable]: { name: 'relationship' },
              [testConfig.isActiveVariable]: { name: 'isActive' },
            },
          },
        },
      },
      stages: [{ id: STAGE_ID, type: 'FamilyPedigree' }],
    };
    const sessionState = {
      id: 'test-session',
      startTime: new Date().toISOString(),
      finishTime: null,
      exportTime: null,
      lastUpdated: new Date().toISOString(),
      network: {
        ...createInitialNetwork(),
        nodes: preloadedNodes,
        edges: preloadedEdges,
      },
      currentStep: 0,
      promptIndex: 0,
    };

    type ProtocolState = typeof protocolState;
    type UIState = { passphrase: null };

    const reduxStore = configureStore({
      reducer: {
        session: sessionReducer,
        protocol: (state: ProtocolState = protocolState): ProtocolState =>
          state,
        ui: (state: UIState = { passphrase: null }): UIState => state,
      },
      preloadedState: {
        session: sessionState,
        protocol: protocolState,
        ui: { passphrase: null },
      },
    });

    // The thunk-capable dispatch of this test store is structurally compatible
    // with the app dispatch finalizeNetwork expects; bridge the nominal type at
    // this single boundary, matching the syncMetadata test above.
    const dispatch = ((action: Parameters<typeof reduxStore.dispatch>[0]) =>
      reduxStore.dispatch(action)) as ReturnType<typeof useAppDispatch>;

    return { reduxStore, dispatch };
  }

  it('injects the computed relationship-to-ego into node attributes on finalize', async () => {
    const { reduxStore, dispatch } = createReduxStore([]);

    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
      dispatch,
      0,
    );

    const egoId = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: true,
        [testConfig.nodeLabelVariable]: 'Ego',
      },
    });
    const parentId = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'Mum',
      },
    });
    store.getState().addEdge({
      from: parentId,
      to: egoId,
      attributes: {
        [testConfig.relationshipTypeVariable]: ['biological'],
        [testConfig.isActiveVariable]: true,
      },
    });

    await store.getState().finalizeNetwork();

    const committed = reduxStore.getState().session.network.nodes;
    expect(committed).toHaveLength(2);

    const committedParent = committed.find(
      (n) =>
        n[entityAttributesProperty][testConfig.nodeLabelVariable] === 'Mum',
    );
    expect(
      committedParent?.[entityAttributesProperty][
        testConfig.relationshipVariable
      ],
    ).toBe('Parent');

    const committedEgo = committed.find(
      (n) => n[entityAttributesProperty][testConfig.egoVariable] === true,
    );
    // Ego has no relationship to itself, so the variable is not written.
    expect(
      committedEgo?.[entityAttributesProperty][testConfig.relationshipVariable],
    ).toBeUndefined();
  });

  it('records committed Redux node and edge ids in membership metadata', async () => {
    const { reduxStore, dispatch } = createReduxStore([]);

    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      testConfig,
      dispatch,
      0,
    );

    const egoStoreId = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: true,
        [testConfig.nodeLabelVariable]: 'Ego',
      },
    });
    const parentStoreId = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'Mum',
      },
    });
    const edgeStoreId = store.getState().addEdge({
      from: parentStoreId,
      to: egoStoreId,
      attributes: {
        [testConfig.relationshipTypeVariable]: ['biological'],
        [testConfig.isActiveVariable]: true,
      },
    });

    await store.getState().finalizeNetwork();

    const committedIds = new Set(
      reduxStore
        .getState()
        .session.network.nodes.map((n) => n[entityPrimaryKeyProperty]),
    );
    const committedEdgeIds = new Set(
      reduxStore
        .getState()
        .session.network.edges.map((edge) => edge[entityPrimaryKeyProperty]),
    );
    const membershipMetadata = reduxStore.getState().session.stageMetadata?.[0];
    expect(membershipMetadata).toEqual(
      expect.objectContaining({ edgeIdVersion: 1 }),
    );

    // pedigreeMemberIds is the real consumer (NarrativePedigree + revisit view);
    // it must return the committed Redux ids so membership matches node._uid.
    const memberIds = pedigreeMemberIds(membershipMetadata);
    if (memberIds === null) {
      throw new Error('expected committed membership metadata');
    }

    expect(memberIds.size).toBe(2);
    for (const id of committedIds) {
      expect(memberIds.has(id)).toBe(true);
    }
    // The pre-finalize store ids must NOT leak into the persisted membership.
    expect(memberIds.has(egoStoreId)).toBe(false);
    expect(memberIds.has(parentStoreId)).toBe(false);

    const memberEdgeIds = pedigreeMemberEdgeIds(membershipMetadata);
    if (memberEdgeIds === null) {
      throw new Error('expected committed edge membership metadata');
    }

    expect(memberEdgeIds).toEqual(committedEdgeIds);
    expect(memberEdgeIds.has(edgeStoreId)).toBe(false);

    await store.getState().updateEdge(edgeStoreId, {
      [testConfig.isActiveVariable]: false,
    });
    store.getState().syncMetadata();

    const [committedEdge] = reduxStore.getState().session.network.edges;
    expect(
      committedEdge?.[entityAttributesProperty][testConfig.isActiveVariable],
    ).toBe(false);
    const refreshedMetadata = reduxStore.getState().session.stageMetadata?.[0];
    expect(refreshedMetadata).toEqual(
      expect.objectContaining({
        edges: [
          expect.objectContaining({
            attributes: expect.objectContaining({
              [testConfig.isActiveVariable]: false,
            }),
          }),
        ],
      }),
    );
  });

  it('persists updates to an edge seeded from Redux', async () => {
    const first = {
      _uid: 'first',
      type: testConfig.nodeType,
      [entityAttributesProperty]: {
        [testConfig.egoVariable]: true,
        [testConfig.nodeLabelVariable]: 'First',
      },
    } as NcNode;
    const second = {
      _uid: 'second',
      type: testConfig.nodeType,
      [entityAttributesProperty]: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'Second',
      },
    } as NcNode;
    const partnership = {
      _uid: 'partnership',
      type: testConfig.edgeType,
      from: first._uid,
      to: second._uid,
      [entityAttributesProperty]: {
        [testConfig.relationshipTypeVariable]: ['partner'],
        [testConfig.isActiveVariable]: true,
      },
    } as NcEdge;
    const { reduxStore, dispatch } = createReduxStore(
      [first, second],
      [partnership],
    );
    const store = createFamilyPedigreeStore(
      new Map([
        [first._uid, first],
        [second._uid, second],
      ]),
      new Map([[partnership._uid, partnership]]),
      new Map(),
      testConfig,
      dispatch,
      0,
      new Set([first._uid, second._uid]),
      new Set([partnership._uid]),
    );

    await store.getState().updateEdge(partnership._uid, {
      [testConfig.isActiveVariable]: false,
    });

    expect(
      reduxStore.getState().session.network.edges[0]?.[
        entityAttributesProperty
      ][testConfig.isActiveVariable],
    ).toBe(false);
  });

  it('does not duplicate pre-existing same-type nodes already in Redux', async () => {
    const preexistingId = 'preexisting-node';
    const preexistingNode: NcNode = {
      [entityPrimaryKeyProperty]: preexistingId,
      type: testConfig.nodeType,
      [entityAttributesProperty]: {
        [testConfig.egoVariable]: true,
        [testConfig.nodeLabelVariable]: 'Existing Ego',
      },
    };

    const { reduxStore, dispatch } = createReduxStore([preexistingNode]);

    // Seed the pre-existing node into the pedigree store, keyed by its Redux id,
    // and a brand-new pedigree node.
    const initialNodes = new Map<string, NcNode>([
      [preexistingId, preexistingNode],
    ]);

    const store = createFamilyPedigreeStore(
      initialNodes,
      new Map(),
      new Map([[preexistingId, { readOnly: true }]]),
      testConfig,
      dispatch,
      0,
      new Set([preexistingId]),
      new Set(),
    );

    const newChildId = store.getState().addNode({
      attributes: {
        [testConfig.egoVariable]: false,
        [testConfig.nodeLabelVariable]: 'New Child',
      },
    });
    store.getState().addEdge({
      from: preexistingId,
      to: newChildId,
      attributes: {
        [testConfig.relationshipTypeVariable]: ['biological'],
        [testConfig.isActiveVariable]: true,
      },
    });

    await store.getState().finalizeNetwork();

    const committed = reduxStore.getState().session.network.nodes;
    // Only the new child is committed; the pre-existing ego is not re-added.
    expect(committed).toHaveLength(2);
    expect(
      committed.filter(
        (n) =>
          n[entityAttributesProperty][testConfig.nodeLabelVariable] ===
          'Existing Ego',
      ),
    ).toHaveLength(1);

    // The new child's parent edge resolves to the pre-existing node, so the
    // edge is committed connecting the existing and new nodes.
    const committedEdges = reduxStore.getState().session.network.edges;
    expect(committedEdges).toHaveLength(1);
    expect(committedEdges[0]?.from).toBe(preexistingId);
  });

  it('removes committed edges between seeded nodes when resetting', async () => {
    const seededNodes: NcNode[] = [
      {
        [entityPrimaryKeyProperty]: 'seeded-ego',
        type: testConfig.nodeType,
        [entityAttributesProperty]: {
          [testConfig.egoVariable]: true,
          [testConfig.nodeLabelVariable]: 'Existing Ego',
        },
      },
      {
        [entityPrimaryKeyProperty]: 'seeded-parent',
        type: testConfig.nodeType,
        [entityAttributesProperty]: {
          [testConfig.egoVariable]: false,
          [testConfig.nodeLabelVariable]: 'Existing Parent',
        },
      },
    ];
    const { reduxStore, dispatch } = createReduxStore(seededNodes);
    const initialNodes = new Map(
      seededNodes.map((node) => [node[entityPrimaryKeyProperty], node]),
    );
    const seededIds = new Set(initialNodes.keys());
    const store = createFamilyPedigreeStore(
      initialNodes,
      new Map(),
      new Map(
        seededNodes.map((node) => [
          node[entityPrimaryKeyProperty],
          { readOnly: true },
        ]),
      ),
      testConfig,
      dispatch,
      0,
      seededIds,
      new Set(),
    );

    store.getState().addEdge({
      from: 'seeded-parent',
      to: 'seeded-ego',
      attributes: {
        [testConfig.relationshipTypeVariable]: ['biological'],
        [testConfig.isActiveVariable]: true,
      },
    });
    await store.getState().finalizeNetwork();
    expect(reduxStore.getState().session.network.edges).toHaveLength(1);

    store.getState().resetNetwork();

    expect(reduxStore.getState().session.network.nodes).toHaveLength(2);
    expect(reduxStore.getState().session.network.edges).toHaveLength(0);
  });
});

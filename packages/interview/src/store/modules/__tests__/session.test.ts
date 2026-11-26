import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import {
  type DyadCensusMetadataItem,
  entityAttributesProperty,
  entitySecureAttributesMeta,
  type NcEdge,
  type NcNode,
  type StageMetadata,
  type VariableValue,
} from '@codaco/shared-consts';

import { testTypeId, testVariableId } from '../../../__tests__/testIds';
import { createInitialNetwork } from '../../../contract/network';
import {
  encryptionFor,
  unlockWith,
} from '../../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { isNumberArray } from '../../../interfaces/Anonymisation/decryptionScope';
import { decryptValue } from '../../../interfaces/Anonymisation/encryptionFormat';
import type { AppDispatch } from '../../store';
import sessionReducer, {
  addEdge,
  addNode,
  addNodeToPrompt,
  deleteEdge,
  deleteNode,
  removeNodeFromPrompt,
  toggleEdge,
  toggleNodeAttributes,
  updateEdge,
  updateEgo,
  updateNode,
} from '../session';
import ui from '../ui';

const NODE_TYPE = testTypeId('test-node-type');
const EDGE_TYPE = testTypeId('test-edge-type');
const PERSON = testTypeId('person');
const FRIENDSHIP = testTypeId('friendship');
const VAR_1 = testVariableId('var-1');
const VAR_2 = testVariableId('var-2');
const VAR_3 = testVariableId('var-3');
const EDGE_VAR_1 = testVariableId('edge-var-1');
const EDGE_VAR_2 = testVariableId('edge-var-2');
const EDGE_VAR_3 = testVariableId('edge-var-3');
const EDGE_VAR_CLOSENESS = testVariableId('edge-var-closeness');
const EGO_VAR_1 = testVariableId('ego-var-1');
const EGO_VAR_2 = testVariableId('ego-var-2');
const EGO_VAR_3 = testVariableId('ego-var-3');
const DEFINED = testVariableId('defined');
const LEGACY_NULL = testVariableId('legacyNull');
const LEGACY_UNDEFINED = testVariableId('legacyUndefined');
const NODE_KEEP = testVariableId('nodeKeep');
const NODE_REMOVE = testVariableId('nodeRemove');
const NODE_ADDED = testVariableId('nodeAdded');
const EDGE_KEEP = testVariableId('edgeKeep');
const EDGE_REMOVE = testVariableId('edgeRemove');
const EDGE_ADDED = testVariableId('edgeAdded');
const EGO_KEEP = testVariableId('egoKeep');
const EGO_REMOVE = testVariableId('egoRemove');
const EGO_ADDED = testVariableId('egoAdded');
const IS_CLOSE_TIE = testVariableId('isCloseTie');
const IS_FAMILY = testVariableId('isFamily');

/**
 * Minimal store setup for testing session thunks.
 * Only includes state required by addNode.
 */
function createTestStore(options: {
  codebookVariables?: Record<string, { name: string }>;
  nodeTypeName?: string;
}) {
  const nodeTypeId = NODE_TYPE;
  const { codebookVariables = {}, nodeTypeName = 'Person' } = options;

  const sessionState = createTestSessionState();
  const protocolState = createTestProtocolState(
    nodeTypeId,
    nodeTypeName,
    codebookVariables,
  );
  const uiState = { encryptionKeyId: null };

  type SessionState = ReturnType<typeof createTestSessionState>;
  type ProtocolState = ReturnType<typeof createTestProtocolState>;
  type UIState = typeof uiState;

  const store = configureStore({
    reducer: {
      session: (state: SessionState = sessionState): SessionState => state,
      protocol: (state: ProtocolState = protocolState): ProtocolState => state,
      ui: (state: UIState = uiState): UIState => state,
    },
    preloadedState: {
      session: sessionState,
      protocol: protocolState,
      ui: uiState,
    },
  });

  // This mock store models only the slices these thunks read, so its inferred
  // dispatch type doesn't match the app thunks (pinned to the real RootState).
  // Bridge its dispatch to the real AppDispatch so the tests can dispatch them.
  return store as unknown as typeof store & { dispatch: AppDispatch };

  function createTestSessionState() {
    return {
      id: 'test-session',
      startTime: new Date().toISOString(),
      finishTime: null,
      exportTime: null,
      lastUpdated: new Date().toISOString(),
      network: createInitialNetwork(),
      currentStep: 0,
      promptIndex: 0,
    };
  }

  function createTestProtocolState(
    typeId = nodeTypeId,
    typeName = nodeTypeName,
    variables: Record<string, { name: string }> = {},
  ) {
    return {
      codebook: {
        node: {
          [typeId]: {
            name: typeName,
            variables,
          },
        },
      },
      stages: [{ id: 'stage-1' }],
    };
  }
}

describe('addNode', () => {
  describe('attribute validation', () => {
    it('succeeds with valid codebook attributes', async () => {
      // Setup
      const store = createTestStore({
        codebookVariables: {
          [VAR_1]: { name: 'firstName' },
          [VAR_2]: { name: 'lastName' },
        },
      });

      // Execute
      const result = await store.dispatch(
        addNode({
          type: NODE_TYPE,
          attributeData: {
            [VAR_1]: 'John',
            [VAR_2]: 'Doe',
          },
          currentStep: 0,
        }),
      );

      // Verify
      expect(result.type).toBe('NETWORK/ADD_NODE/fulfilled');
      const payload = result.payload as {
        type: string;
        attributeData: Record<string, unknown>;
      };
      expect(payload.type).toBe(NODE_TYPE);
      expect(payload.attributeData[VAR_1]).toBe('John');
      expect(payload.attributeData[VAR_2]).toBe('Doe');
    });

    it('succeeds with empty attributeData', async () => {
      // Setup
      const store = createTestStore({
        codebookVariables: {
          [VAR_1]: { name: 'firstName' },
        },
      });

      // Execute
      const result = await store.dispatch(
        addNode({
          type: NODE_TYPE,
          attributeData: {},
          currentStep: 0,
        }),
      );

      // Verify
      expect(result.type).toBe('NETWORK/ADD_NODE/fulfilled');
    });

    it('succeeds with undefined attributeData', async () => {
      // Setup
      const store = createTestStore({
        codebookVariables: {},
      });

      // Execute
      const result = await store.dispatch(
        addNode({
          type: NODE_TYPE,
          currentStep: 0,
        }),
      );

      // Verify
      expect(result.type).toBe('NETWORK/ADD_NODE/fulfilled');
    });

    describe('unknown attributes (external data scenario)', () => {
      /**
       * This is the core scenario: external roster data contains attributes
       * that don't have corresponding codebook variables.
       * These pass through makeVariableUUIDReplacer with their original keys.
       */

      it('rejects unknown attributes by default', async () => {
        // Setup
        const store = createTestStore({
          codebookVariables: {
            [VAR_1]: { name: 'firstName' },
          },
        });

        // Execute
        const result = await store.dispatch(
          addNode({
            type: NODE_TYPE,
            attributeData: {
              [VAR_1]: 'John',
              unknownKey: 'value',
            },
            currentStep: 0,
          }),
        );

        // Verify
        expect(result.type).toBe('NETWORK/ADD_NODE/rejected');
        expect(
          (result as { error: { message: string } }).error.message,
        ).toContain('unknownKey');
        expect(
          (result as { error: { message: string } }).error.message,
        ).toContain('do not exist in protocol codebook');
      });

      it('allows unknown attributes when allowUnknownAttributes: true', async () => {
        // Setup
        const store = createTestStore({
          codebookVariables: {
            [VAR_1]: { name: 'firstName' },
          },
        });

        // Execute - simulates external data with attributes not in codebook
        const result = await store.dispatch(
          addNode({
            type: NODE_TYPE,
            attributeData: {
              [VAR_1]: 'John', // Known attribute
              name: 'John Doe', // Unknown - from CSV column
              first_language: 'English', // Unknown - from CSV column
            },
            allowUnknownAttributes: true,
            currentStep: 0,
          }),
        );

        // Verify
        expect(result.type).toBe('NETWORK/ADD_NODE/fulfilled');
        expect(
          (result.payload as { attributeData: Record<string, unknown> })
            .attributeData,
        ).toMatchObject({
          [VAR_1]: 'John',
          name: 'John Doe',
          first_language: 'English',
        });
      });

      it('preserves all attributes when allowUnknownAttributes is true', async () => {
        // Setup
        const store = createTestStore({
          codebookVariables: {
            [VAR_1]: { name: 'firstName' },
          },
        });

        // Execute
        const result = await store.dispatch(
          addNode({
            type: NODE_TYPE,
            attributeData: {
              [VAR_1]: 'John',
              externalField: 'external value',
              anotherField: 123,
            },
            allowUnknownAttributes: true,
            currentStep: 0,
          }),
        );

        // Verify
        expect(result.type).toBe('NETWORK/ADD_NODE/fulfilled');
        const payload = result.payload as {
          attributeData: Record<string, unknown>;
        };
        expect(payload.attributeData[VAR_1]).toBe('John');
        expect(payload.attributeData.externalField).toBe('external value');
        expect(payload.attributeData.anotherField).toBe(123);
      });
    });
  });

  describe('sparse attributes', () => {
    it('includes only supplied defined values', async () => {
      // Setup: codebook has 3 node variables
      const store = createTestStore({
        codebookVariables: {
          [VAR_1]: { name: 'firstName' },
          [VAR_2]: { name: 'lastName' },
          [VAR_3]: { name: 'age' },
        },
      });

      // Execute: only provide value for one variable
      const result = await store.dispatch(
        addNode({
          type: NODE_TYPE,
          attributeData: {
            [VAR_1]: 'John',
          },
          currentStep: 0,
        }),
      );

      expect(result.type).toBe('NETWORK/ADD_NODE/fulfilled');
      const payload = result.payload as {
        attributeData: Record<string, unknown>;
      };
      expect(payload.attributeData).toEqual({
        [VAR_1]: 'John',
      });
    });

    it('omits legacy null and own undefined values', async () => {
      const store = createTestStore({
        codebookVariables: {
          [DEFINED]: { name: 'defined' },
          [LEGACY_NULL]: { name: 'legacyNull' },
          [LEGACY_UNDEFINED]: { name: 'legacyUndefined' },
        },
      });
      const attributeData: Record<string, VariableValue | undefined> = {
        [DEFINED]: false,
        [LEGACY_UNDEFINED]: undefined,
      };
      Reflect.set(attributeData, LEGACY_NULL, null);

      const result = await store.dispatch(
        addNode({
          type: NODE_TYPE,
          attributeData,
          currentStep: 0,
        }),
      );

      expect(result.type).toBe('NETWORK/ADD_NODE/fulfilled');
      if (!addNode.fulfilled.match(result)) {
        throw new Error('expected addNode to be fulfilled');
      }
      expect(result.payload.attributeData).toStrictEqual({ [DEFINED]: false });
      expect(
        Object.hasOwn(result.payload.attributeData, LEGACY_UNDEFINED),
      ).toBe(false);
    });
  });
});

/**
 * Creates a test store with ego variables configured in the codebook.
 */
function createTestStoreWithEgo(options: {
  egoVariables?: Record<string, { name: string }>;
}) {
  const { egoVariables = {} } = options;

  const sessionState = createTestSessionState();
  const protocolState = createTestProtocolState(egoVariables);
  const uiState = { encryptionKeyId: null };

  type SessionState = ReturnType<typeof createTestSessionState>;
  type ProtocolState = ReturnType<typeof createTestProtocolState>;
  type UIState = typeof uiState;

  const store = configureStore({
    reducer: {
      session: (state: SessionState = sessionState): SessionState => state,
      protocol: (state: ProtocolState = protocolState): ProtocolState => state,
      ui: (state: UIState = uiState): UIState => state,
    },
    preloadedState: {
      session: sessionState,
      protocol: protocolState,
      ui: uiState,
    },
  });

  return store as unknown as typeof store & { dispatch: AppDispatch };

  function createTestSessionState() {
    return {
      id: 'test-session',
      startTime: new Date().toISOString(),
      finishTime: null,
      exportTime: null,
      lastUpdated: new Date().toISOString(),
      network: createInitialNetwork(),
      currentStep: 0,
      promptIndex: 0,
    };
  }

  function createTestProtocolState(
    egoVars: Record<string, { name: string }> = {},
  ) {
    return {
      codebook: {
        ego: {
          variables: egoVars,
        },
        node: {},
      },
      stages: [{ id: 'stage-1' }],
    };
  }
}

/**
 * Creates a test store with edge types configured in the codebook.
 */
function createTestStoreWithEdge(options: {
  edgeVariables?: Record<string, { name: string }>;
  edges?: NcEdge[];
  directed?: true;
}) {
  const edgeTypeId = EDGE_TYPE;
  const { edgeVariables = {}, edges = [], directed } = options;

  const network = createInitialNetwork();
  // Add two nodes so we can create edges between them
  network.nodes = [
    { _uid: 'node-1', type: PERSON, [entityAttributesProperty]: {} },
    { _uid: 'node-2', type: PERSON, [entityAttributesProperty]: {} },
  ];
  network.edges = edges;

  const sessionState = createTestSessionState();
  const protocolState = createTestProtocolState(edgeTypeId, edgeVariables);
  const uiState = { encryptionKeyId: null };

  type SessionState = ReturnType<typeof createTestSessionState>;
  type ProtocolState = ReturnType<typeof createTestProtocolState>;
  type UIState = typeof uiState;

  const store = configureStore({
    reducer: {
      session: (state: SessionState = sessionState): SessionState => state,
      protocol: (state: ProtocolState = protocolState): ProtocolState => state,
      ui: (state: UIState = uiState): UIState => state,
    },
    preloadedState: {
      session: sessionState,
      protocol: protocolState,
      ui: uiState,
    },
  });

  return store as unknown as typeof store & { dispatch: AppDispatch };

  function createTestSessionState() {
    return {
      id: 'test-session',
      startTime: new Date().toISOString(),
      finishTime: null,
      exportTime: null,
      lastUpdated: new Date().toISOString(),
      network,
      currentStep: 0,
      promptIndex: 0,
    };
  }

  function createTestProtocolState(
    typeId: string,
    variables: Record<string, { name: string }> = {},
  ) {
    return {
      codebook: {
        edge: {
          [typeId]: {
            name: 'friendship',
            variables,
            ...(directed && { directed }),
          },
        },
        node: {},
      },
      stages: [{ id: 'stage-1' }],
    };
  }
}

function createMutationStore() {
  const network = createInitialNetwork();
  network.nodes = [
    {
      _uid: 'node-1',
      type: PERSON,
      [entityAttributesProperty]: {
        [NODE_KEEP]: 'kept',
        [NODE_REMOVE]: [1, 2, 3],
      },
      [entitySecureAttributesMeta]: {
        [NODE_REMOVE]: { iv: [1] },
      },
    },
  ];
  network.edges = [
    {
      _uid: 'edge-1',
      type: FRIENDSHIP,
      from: 'node-1',
      to: 'node-2',
      [entityAttributesProperty]: {
        [EDGE_KEEP]: 1,
        [EDGE_REMOVE]: false,
      },
    },
  ];
  network.ego[entityAttributesProperty] = {
    [EGO_KEEP]: 'kept',
    [EGO_REMOVE]: true,
  };

  const sessionState = {
    id: 'test-session',
    startTime: new Date().toISOString(),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network,
    promptIndex: 0,
  };
  const protocolState = {
    codebook: {
      node: {
        [PERSON]: {
          name: 'Person',
          variables: {
            [NODE_KEEP]: { name: 'nodeKeep', type: 'text' },
            [NODE_REMOVE]: {
              name: 'nodeRemove',
              type: 'text',
              encrypted: true,
            },
            [NODE_ADDED]: { name: 'nodeAdded', type: 'boolean' },
          },
        },
      },
      edge: {
        [FRIENDSHIP]: {
          name: 'Friendship',
          variables: {
            [EDGE_KEEP]: { name: 'edgeKeep', type: 'number' },
            [EDGE_REMOVE]: { name: 'edgeRemove', type: 'boolean' },
            [EDGE_ADDED]: { name: 'edgeAdded', type: 'text' },
          },
        },
      },
      ego: {
        variables: {
          [EGO_KEEP]: { name: 'egoKeep', type: 'text' },
          [EGO_REMOVE]: { name: 'egoRemove', type: 'boolean' },
          [EGO_ADDED]: { name: 'egoAdded', type: 'number' },
        },
      },
    },
    stages: [
      {
        id: 'stage-1',
        type: 'NameGenerator',
        subject: { entity: 'node', type: PERSON },
        prompts: [{ id: 'prompt-1' }],
      },
    ],
  };
  const store = configureStore({
    reducer: {
      session: sessionReducer,
      protocol: (
        state: typeof protocolState = protocolState,
      ): typeof protocolState => state,
      ui,
    },
    preloadedState: {
      session: sessionState,
      protocol: protocolState,
    },
  });

  return store as unknown as typeof store & { dispatch: AppDispatch };
}

describe('attribute patch reducers', () => {
  it('toggles node attributes and clears secure metadata for unset keys', async () => {
    const store = createMutationStore();

    const result = await store.dispatch(
      toggleNodeAttributes({
        nodeId: 'node-1',
        attributePatch: {
          set: { [NODE_ADDED]: false },
          unset: [NODE_REMOVE],
        },
      }),
    );

    expect(result.type).toBe('NETWORK/TOGGLE_NODE_ATTRIBUTES/fulfilled');
    const node = store.getState().session.network.nodes[0];
    expect(node?.[entityAttributesProperty]).toStrictEqual({
      [NODE_KEEP]: 'kept',
      [NODE_ADDED]: false,
    });
    expect(node?.[entitySecureAttributesMeta]).toBeUndefined();
  });

  it('rejects unknown toggle keys without mutation', async () => {
    const store = createMutationStore();
    const before = structuredClone(store.getState().session);

    const result = await store.dispatch(
      toggleNodeAttributes({
        nodeId: 'node-1',
        attributePatch: { set: { [EDGE_KEEP]: true }, unset: [] },
      }),
    );

    expect(result.type).toBe('NETWORK/TOGGLE_NODE_ATTRIBUTES/rejected');
    if (!toggleNodeAttributes.rejected.match(result)) {
      throw new Error('expected toggleNodeAttributes to be rejected');
    }
    expect(result.error.message).toContain(
      `${EDGE_KEEP} do not exist in protocol codebook`,
    );
    expect(store.getState().session).toStrictEqual(before);
  });

  it('rejects overlapping toggle keys without mutation', async () => {
    const store = createMutationStore();
    const before = structuredClone(store.getState().session);

    const result = await store.dispatch(
      toggleNodeAttributes({
        nodeId: 'node-1',
        attributePatch: {
          set: { [NODE_KEEP]: 'changed' },
          unset: [NODE_KEEP],
        },
      }),
    );

    expect(result.type).toBe('NETWORK/TOGGLE_NODE_ATTRIBUTES/rejected');
    if (!toggleNodeAttributes.rejected.match(result)) {
      throw new Error('expected toggleNodeAttributes to be rejected');
    }
    expect(result.error.message).toContain(
      `${NODE_KEEP} cannot be both set and unset`,
    );
    expect(store.getState().session).toStrictEqual(before);
  });

  it('sets and unsets node attributes while removing secure metadata', async () => {
    const store = createMutationStore();

    const result = await store.dispatch(
      updateNode({
        nodeId: 'node-1',
        attributePatch: {
          set: { [NODE_ADDED]: false },
          unset: [NODE_REMOVE],
        },
        currentStep: 0,
      }),
    );

    expect(result.type).toBe('NETWORK/UPDATE_NODE/fulfilled');
    const node = store.getState().session.network.nodes[0];
    expect(node?.[entityAttributesProperty]).toStrictEqual({
      [NODE_KEEP]: 'kept',
      [NODE_ADDED]: false,
    });
    expect(node?.[entitySecureAttributesMeta]).toBeUndefined();
  });

  it('encrypts node values without mutating the patch', async () => {
    const store = createMutationStore();
    await unlockWith(store, 'pw');
    const patch = { set: { [NODE_REMOVE]: 'secret' }, unset: [] };

    const result = await store.dispatch(
      updateNode({
        nodeId: 'node-1',
        attributePatch: patch,
        currentStep: 0,
      }),
    );

    expect(result.type).toBe('NETWORK/UPDATE_NODE/fulfilled');
    const node = store.getState().session.network.nodes[0];
    const data = node?.[entityAttributesProperty][NODE_REMOVE];
    const secure = node?.[entitySecureAttributesMeta]?.[NODE_REMOVE];
    expect(secure).toEqual({ iv: expect.any(Array) });
    if (!secure || !isNumberArray(data)) {
      throw new Error('Expected the value to be stored encrypted');
    }
    const { key } = await encryptionFor('pw');
    await expect(
      decryptValue(
        key,
        { iv: secure.iv, data },
        { nodeId: 'node-1', variableId: NODE_REMOVE },
      ),
    ).resolves.toBe('secret');
    expect(patch).toStrictEqual({
      set: { [NODE_REMOVE]: 'secret' },
      unset: [],
    });
  });

  it('rejects unknown and overlapping node patch keys without mutation', async () => {
    const store = createMutationStore();
    const before = structuredClone(store.getState().session.network.nodes);

    const unknown = await store.dispatch(
      updateNode({
        nodeId: 'node-1',
        attributePatch: { set: { unknown: true }, unset: [] },
        currentStep: 0,
      }),
    );
    const overlap = await store.dispatch(
      updateNode({
        nodeId: 'node-1',
        attributePatch: {
          set: { [NODE_KEEP]: 'changed' },
          unset: [NODE_KEEP],
        },
        currentStep: 0,
      }),
    );

    expect(unknown.type).toBe('NETWORK/UPDATE_NODE/rejected');
    expect(overlap.type).toBe('NETWORK/UPDATE_NODE/rejected');
    expect(store.getState().session.network.nodes).toStrictEqual(before);
  });

  it('sets and unsets edge attributes', async () => {
    const store = createMutationStore();

    const result = await store.dispatch(
      updateEdge({
        edgeId: 'edge-1',
        attributePatch: {
          set: { [EDGE_ADDED]: '' },
          unset: [EDGE_REMOVE],
        },
      }),
    );

    expect(result.type).toBe('NETWORK/UPDATE_EDGE/fulfilled');
    expect(
      store.getState().session.network.edges[0]?.[entityAttributesProperty],
    ).toStrictEqual({ [EDGE_KEEP]: 1, [EDGE_ADDED]: '' });
  });

  it('rejects overlapping edge patch keys without mutation', async () => {
    const store = createMutationStore();
    const before = structuredClone(store.getState().session.network.edges);

    const result = await store.dispatch(
      updateEdge({
        edgeId: 'edge-1',
        attributePatch: {
          set: { [EDGE_KEEP]: 2 },
          unset: [EDGE_KEEP],
        },
      }),
    );

    expect(result.type).toBe('NETWORK/UPDATE_EDGE/rejected');
    expect(store.getState().session.network.edges).toStrictEqual(before);
  });

  it('sets and unsets ego attributes', async () => {
    const store = createMutationStore();

    const result = await store.dispatch(
      updateEgo({
        set: { [EGO_ADDED]: 0 },
        unset: [EGO_REMOVE],
      }),
    );

    expect(result.type).toBe('NETWORK/UPDATE_EGO/fulfilled');
    expect(
      store.getState().session.network.ego[entityAttributesProperty],
    ).toStrictEqual({ [EGO_KEEP]: 'kept', [EGO_ADDED]: 0 });
  });

  it('rejects unknown and overlapping ego patch keys without mutation', async () => {
    const store = createMutationStore();
    const before = structuredClone(
      store.getState().session.network.ego[entityAttributesProperty],
    );

    const unknown = await store.dispatch(
      updateEgo({ set: { unknown: true }, unset: [] }),
    );
    const overlap = await store.dispatch(
      updateEgo({
        set: { [EGO_KEEP]: 'changed' },
        unset: [EGO_KEEP],
      }),
    );

    expect(unknown.type).toBe('NETWORK/UPDATE_EGO/rejected');
    expect(overlap.type).toBe('NETWORK/UPDATE_EGO/rejected');
    expect(
      store.getState().session.network.ego[entityAttributesProperty],
    ).toStrictEqual(before);
  });
});

describe('addEdge', () => {
  describe('sparse attributes', () => {
    it('includes only supplied defined values', async () => {
      // Setup: codebook has 3 edge variables
      const store = createTestStoreWithEdge({
        edgeVariables: {
          [EDGE_VAR_1]: { name: 'strength' },
          [EDGE_VAR_2]: { name: 'duration' },
          [EDGE_VAR_3]: { name: 'frequency' },
        },
      });

      // Execute: only provide value for one variable
      const result = await store.dispatch(
        addEdge({
          type: EDGE_TYPE,
          from: 'node-1',
          to: 'node-2',
          attributeData: {
            [EDGE_VAR_1]: 5,
          },
          currentStep: 0,
        }),
      );

      expect(result.type).toBe('NETWORK/ADD_EDGE/fulfilled');
      const payload = result.payload as {
        attributeData: Record<string, unknown>;
      };
      expect(payload.attributeData).toEqual({
        [EDGE_VAR_1]: 5,
      });
    });
  });
});

describe('addEdge self-loops', () => {
  it('addEdge refuses a self-loop', async () => {
    const store = createTestStoreWithEdge({});
    const result = await store.dispatch(
      addEdge({
        type: EDGE_TYPE,
        from: 'node-1',
        to: 'node-1',
        currentStep: 0,
      }),
    );
    expect(result.type).toBe('NETWORK/ADD_EDGE/rejected');
  });
});

describe('toggleEdge', () => {
  const existing: NcEdge = {
    _uid: 'edge-1',
    type: EDGE_TYPE,
    from: 'node-1',
    to: 'node-2',
    [entityAttributesProperty]: {},
  };

  it('toggleEdge removes the reverse edge of an undirected type', async () => {
    const store = createTestStoreWithEdge({ edges: [existing] });
    const result = await store.dispatch(
      toggleEdge({
        type: EDGE_TYPE,
        from: 'node-2',
        to: 'node-1',
        currentStep: 0,
      }),
    );
    expect(result.payload).toEqual(deleteEdge('edge-1'));
  });

  it('toggleEdge adds the reverse edge of a directed type', async () => {
    const store = createTestStoreWithEdge({
      edges: [existing],
      directed: true,
    });
    const result = await store.dispatch(
      toggleEdge({
        type: EDGE_TYPE,
        from: 'node-2',
        to: 'node-1',
        currentStep: 0,
      }),
    );
    expect(result.payload).toMatchObject({
      type: 'NETWORK/ADD_EDGE/fulfilled',
      payload: { from: 'node-2', to: 'node-1', type: EDGE_TYPE },
    });
  });

  it('toggleEdge removes the same-order edge of a directed type', async () => {
    const store = createTestStoreWithEdge({
      edges: [existing],
      directed: true,
    });
    const result = await store.dispatch(
      toggleEdge({
        type: EDGE_TYPE,
        from: 'node-1',
        to: 'node-2',
        currentStep: 0,
      }),
    );
    expect(result.payload).toEqual(deleteEdge('edge-1'));
  });

  it('toggleEdge refuses a self-loop', async () => {
    const store = createTestStoreWithEdge({});
    const result = await store.dispatch(
      toggleEdge({
        type: EDGE_TYPE,
        from: 'node-1',
        to: 'node-1',
        currentStep: 0,
      }),
    );
    expect(result.type).toBe('NETWORK/TOGGLE_EDGE/rejected');
  });
});

describe('updateEdge', () => {
  describe('attribute validation', () => {
    it('accepts edge attributes defined under the edge codebook', async () => {
      // Setup: an edge of the given type already exists, and the edge variable
      // is defined only under codebook.edge.<type>.variables
      const store = createTestStoreWithEdge({
        edgeVariables: {
          [EDGE_VAR_CLOSENESS]: { name: 'closeness' },
        },
        edges: [
          {
            _uid: 'edge-1',
            from: 'node-1',
            to: 'node-2',
            type: EDGE_TYPE,
            [entityAttributesProperty]: {},
          },
        ],
      });

      // Execute: update the edge with a value for the edge-defined variable
      const result = await store.dispatch(
        updateEdge({
          edgeId: 'edge-1',
          attributePatch: {
            set: { [EDGE_VAR_CLOSENESS]: 2 },
            unset: [],
          },
        }),
      );

      // Verify: the thunk is fulfilled (not rejected). Previously the thunk
      // validated against the NODE codebook, so every edge variable was
      // considered invalid and the thunk was rejected.
      expect(result.type).toBe('NETWORK/UPDATE_EDGE/fulfilled');
      if (!updateEdge.fulfilled.match(result)) {
        throw new Error('expected updateEdge to be fulfilled');
      }
      expect(result.payload.attributePatch.set).toEqual({
        [EDGE_VAR_CLOSENESS]: 2,
      });
    });

    it('rejects edge attributes that are not in the edge codebook', async () => {
      const store = createTestStoreWithEdge({
        edgeVariables: {
          [EDGE_VAR_CLOSENESS]: { name: 'closeness' },
        },
        edges: [
          {
            _uid: 'edge-1',
            from: 'node-1',
            to: 'node-2',
            type: EDGE_TYPE,
            [entityAttributesProperty]: {},
          },
        ],
      });

      const result = await store.dispatch(
        updateEdge({
          edgeId: 'edge-1',
          attributePatch: {
            set: { unknownEdgeVar: 5 },
            unset: [],
          },
        }),
      );

      expect(result.type).toBe('NETWORK/UPDATE_EDGE/rejected');
      expect(
        (result as { error: { message: string } }).error.message,
      ).toContain('unknownEdgeVar');
    });
  });
});

/**
 * Creates a test store for a NameGenerator stage whose prompts declare
 * additionalAttributes. Used to exercise addNodeToPrompt/removeNodeFromPrompt.
 */
function createTestStoreWithPrompts(options: {
  prompts: {
    id: string;
    additionalAttributes?: { variable: string; value: boolean }[];
  }[];
  promptIndex: number;
  nodes: NcNode[];
}) {
  const { prompts, promptIndex, nodes } = options;

  const network = createInitialNetwork();
  network.nodes = nodes;

  const sessionState = {
    id: 'test-session',
    startTime: new Date().toISOString(),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network,
    promptIndex,
  };

  const protocolState = {
    codebook: {
      node: {
        [PERSON]: {
          name: 'Person',
          variables: {
            [IS_CLOSE_TIE]: { name: 'isCloseTie', type: 'boolean' },
            [IS_FAMILY]: { name: 'isFamily', type: 'boolean' },
          },
        },
      },
    },
    stages: [
      {
        id: 'stage-1',
        type: 'NameGenerator',
        subject: { entity: 'node', type: PERSON },
        prompts,
      },
    ],
  };

  type ProtocolState = typeof protocolState;

  const store = configureStore({
    reducer: {
      // Use the real session reducer so .fulfilled handlers run and we can
      // assert the resulting node state.
      session: sessionReducer,
      protocol: (state: ProtocolState = protocolState): ProtocolState => state,
    },
    preloadedState: {
      session: sessionState,
      protocol: protocolState,
    },
  });

  return store as unknown as typeof store & { dispatch: AppDispatch };
}

describe('addNodeToPrompt', () => {
  it('applies the prompt additionalAttribute, overwriting a value the node already carries', async () => {
    // The network is the single source of truth: adding a node to a prompt
    // asserts the prompt's additionalAttributes. A value a form previously
    // collected or merely displayed is not owned by the form, so re-nomination
    // overwrites it (false -> true here).
    const store = createTestStoreWithPrompts({
      prompts: [
        {
          id: 'prompt-1',
          additionalAttributes: [{ variable: IS_CLOSE_TIE, value: true }],
        },
      ],
      promptIndex: 0,
      nodes: [
        {
          _uid: 'node-1',
          type: PERSON,
          [entityAttributesProperty]: { [IS_CLOSE_TIE]: false },
          promptIDs: [],
        },
      ],
    });

    await store.dispatch(
      addNodeToPrompt({
        nodeId: 'node-1',
        promptAttributes: { [IS_CLOSE_TIE]: true },
        currentStep: 0,
      }),
    );

    const node = store.getState().session.network.nodes[0];
    // The prompt's value wins over the value the node already carried.
    expect(node?.[entityAttributesProperty][IS_CLOSE_TIE]).toBe(true);
    // The node is still recorded as belonging to the prompt.
    expect(node?.promptIDs).toEqual(['prompt-1']);
  });

  it('applies a prompt additionalAttribute the node does not yet carry', async () => {
    const legacyNode: NcNode = {
      _uid: 'node-1',
      type: PERSON,
      [entityAttributesProperty]: {},
      promptIDs: [],
    };
    Reflect.set(legacyNode[entityAttributesProperty], IS_CLOSE_TIE, null);
    const store = createTestStoreWithPrompts({
      prompts: [
        {
          id: 'prompt-1',
          additionalAttributes: [{ variable: IS_CLOSE_TIE, value: true }],
        },
      ],
      promptIndex: 0,
      nodes: [legacyNode],
    });

    await store.dispatch(
      addNodeToPrompt({
        nodeId: 'node-1',
        promptAttributes: { [IS_CLOSE_TIE]: true },
        currentStep: 0,
      }),
    );

    const node = store.getState().session.network.nodes[0];
    expect(node?.[entityAttributesProperty][IS_CLOSE_TIE]).toBe(true);
    expect(node?.promptIDs).toEqual(['prompt-1']);
  });
});

describe('removeNodeFromPrompt', () => {
  it('clears a prompt-introduced attribute on removal, even one a form displayed', async () => {
    // Scenario (issue #672, corrected): a NameGenerator prompt asserts
    // isCloseTie:true; the node was added on that prompt and an AlterForm later
    // displayed the value. Even if the node now carries a value that differs
    // from what the removed prompt asserted, there is no form "ownership" to
    // preserve — the network is the single source of truth, and removing the
    // node from the prompt undoes the prompt's contribution.
    const store = createTestStoreWithPrompts({
      prompts: [
        {
          id: 'prompt-1',
          additionalAttributes: [{ variable: IS_CLOSE_TIE, value: true }],
        },
      ],
      promptIndex: 0,
      nodes: [
        {
          _uid: 'node-1',
          type: PERSON,
          [entityAttributesProperty]: { [IS_CLOSE_TIE]: false },
          promptIDs: ['prompt-1'],
        },
      ],
    });

    await store.dispatch(
      removeNodeFromPrompt({ nodeId: 'node-1', currentStep: 0 }),
    );

    const node = store.getState().session.network.nodes[0];
    expect(
      Object.hasOwn(node?.[entityAttributesProperty] ?? {}, IS_CLOSE_TIE),
    ).toBe(false);
    expect(node?.promptIDs).toEqual([]);
  });

  it('clears a value:false attribute on removal rather than flipping it to true', async () => {
    // Scenario: a NameGenerator prompt offers additionalAttributes value:false.
    // A node was added on this prompt (isCloseTie stored false), then removed.
    // Negating the authored value would corrupt false -> true.
    const store = createTestStoreWithPrompts({
      prompts: [
        {
          id: 'prompt-1',
          additionalAttributes: [{ variable: IS_CLOSE_TIE, value: false }],
        },
      ],
      promptIndex: 0,
      nodes: [
        {
          _uid: 'node-1',
          type: PERSON,
          [entityAttributesProperty]: { [IS_CLOSE_TIE]: false },
          promptIDs: ['prompt-1'],
        },
      ],
    });

    await store.dispatch(
      removeNodeFromPrompt({ nodeId: 'node-1', currentStep: 0 }),
    );

    const node = store.getState().session.network.nodes[0];
    expect(
      Object.hasOwn(node?.[entityAttributesProperty] ?? {}, IS_CLOSE_TIE),
    ).toBe(false);
    expect(node?.promptIDs).toEqual([]);
  });

  it('preserves a value:true attribute still asserted by another attached prompt', async () => {
    // Scenario: two prompts both assert isCloseTie:true. The node is on both.
    // Removing it from one prompt must NOT clear the flag, because the other
    // prompt still asserts it.
    const store = createTestStoreWithPrompts({
      prompts: [
        {
          id: 'prompt-1',
          additionalAttributes: [{ variable: IS_CLOSE_TIE, value: true }],
        },
        {
          id: 'prompt-2',
          additionalAttributes: [{ variable: IS_CLOSE_TIE, value: true }],
        },
      ],
      promptIndex: 0, // remove from prompt-1
      nodes: [
        {
          _uid: 'node-1',
          type: PERSON,
          [entityAttributesProperty]: { [IS_CLOSE_TIE]: true },
          promptIDs: ['prompt-1', 'prompt-2'],
        },
      ],
    });

    await store.dispatch(
      removeNodeFromPrompt({ nodeId: 'node-1', currentStep: 0 }),
    );

    const node = store.getState().session.network.nodes[0];
    expect(node?.[entityAttributesProperty][IS_CLOSE_TIE]).toBe(true);
    expect(node?.promptIDs).toEqual(['prompt-2']);
  });
});

function createTestStoreWithMetadata(stageMetadata: StageMetadata) {
  const network = createInitialNetwork();
  network.nodes = [
    { _uid: 'node-1', type: PERSON, [entityAttributesProperty]: {} },
    { _uid: 'node-2', type: PERSON, [entityAttributesProperty]: {} },
  ];

  const sessionState = {
    id: 'test-session',
    startTime: new Date().toISOString(),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network,
    promptIndex: 0,
    stageMetadata,
  };

  const store = configureStore({
    reducer: { session: sessionReducer },
    preloadedState: { session: sessionState },
  });

  return store as unknown as typeof store & { dispatch: AppDispatch };
}

describe('deleteNode', () => {
  it('prunes census stageMetadata entries that reference the deleted node', () => {
    // A census 'No' answer for (node-1, node-2) was recorded in stageMetadata.
    // Deleting node-1 must remove that entry so a re-added node with the same
    // id cannot revive a stale 'No' pre-selection.
    const censusMetadata: DyadCensusMetadataItem[] = [
      [0, 'node-1', 'node-2', false],
      [0, 'node-2', 'node-3', false],
    ];

    const store = createTestStoreWithMetadata({ 0: censusMetadata });

    store.dispatch(deleteNode('node-1'));

    const result = store.getState().session.stageMetadata?.[0];
    expect(result).toEqual([[0, 'node-2', 'node-3', false]]);
  });

  it('leaves non-census (NetworkComposer) stage metadata untouched', () => {
    const composerMetadata = { automaticLayout: false };

    const store = createTestStoreWithMetadata({ 1: composerMetadata });

    store.dispatch(deleteNode('node-1'));

    const result = store.getState().session.stageMetadata?.[1];
    expect(result).toEqual(composerMetadata);
  });
});

describe('updateEgo', () => {
  describe('default attributes', () => {
    it('returns only the submitted attributes without adding defaults', async () => {
      // Setup: codebook has 3 ego variables
      const store = createTestStoreWithEgo({
        egoVariables: {
          [EGO_VAR_1]: { name: 'age' },
          [EGO_VAR_2]: { name: 'gender' },
          [EGO_VAR_3]: { name: 'occupation' },
        },
      });

      // Execute: only provide value for one variable
      const result = await store.dispatch(
        updateEgo({
          set: { [EGO_VAR_1]: 25 },
          unset: [],
        }),
      );

      // EgoForm sends defined responses in set and mounted unanswered fields
      // in unset, so variables owned by other stages remain untouched.
      expect(result.type).toBe('NETWORK/UPDATE_EGO/fulfilled');
      expect(result.payload).toEqual({
        set: { [EGO_VAR_1]: 25 },
        unset: [],
      });
    });
  });
});

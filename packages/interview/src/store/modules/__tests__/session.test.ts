import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type {
  DyadCensusMetadataItem,
  NcEdge,
  NcNode,
  StageMetadata,
} from '@codaco/shared-consts';

import sessionReducer, {
  addEdge,
  addNode,
  createInitialNetwork,
  deleteNode,
  removeNodeFromPrompt,
  updateEdge,
  updateEgo,
} from '../session';

/**
 * Minimal store setup for testing session thunks.
 * Only includes state required by addNode.
 */
function createTestStore(options: {
  codebookVariables?: Record<string, { name: string }>;
  nodeTypeName?: string;
}) {
  const nodeTypeId = 'test-node-type-uuid';
  const { codebookVariables = {}, nodeTypeName = 'Person' } = options;

  const sessionState = createTestSessionState();
  const protocolState = createTestProtocolState(
    nodeTypeId,
    nodeTypeName,
    codebookVariables,
  );
  const uiState = { passphrase: null };

  type SessionState = ReturnType<typeof createTestSessionState>;
  type ProtocolState = ReturnType<typeof createTestProtocolState>;
  type UIState = typeof uiState;

  return configureStore({
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
          'var-uuid-1': { name: 'firstName' },
          'var-uuid-2': { name: 'lastName' },
        },
      });

      // Execute
      const result = await store.dispatch(
        addNode({
          type: 'test-node-type-uuid',
          attributeData: {
            'var-uuid-1': 'John',
            'var-uuid-2': 'Doe',
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
      expect(payload.type).toBe('test-node-type-uuid');
      expect(payload.attributeData['var-uuid-1']).toBe('John');
      expect(payload.attributeData['var-uuid-2']).toBe('Doe');
    });

    it('succeeds with empty attributeData', async () => {
      // Setup
      const store = createTestStore({
        codebookVariables: {
          'var-uuid-1': { name: 'firstName' },
        },
      });

      // Execute
      const result = await store.dispatch(
        addNode({
          type: 'test-node-type-uuid',
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
          type: 'test-node-type-uuid',
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
            'var-uuid-1': { name: 'firstName' },
          },
        });

        // Execute
        const result = await store.dispatch(
          addNode({
            type: 'test-node-type-uuid',
            attributeData: {
              'var-uuid-1': 'John',
              'unknownKey': 'value',
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
            'var-uuid-1': { name: 'firstName' },
          },
        });

        // Execute - simulates external data with attributes not in codebook
        const result = await store.dispatch(
          addNode({
            type: 'test-node-type-uuid',
            attributeData: {
              'var-uuid-1': 'John', // Known attribute
              'name': 'John Doe', // Unknown - from CSV column
              'first_language': 'English', // Unknown - from CSV column
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
          'var-uuid-1': 'John',
          'name': 'John Doe',
          'first_language': 'English',
        });
      });

      it('preserves all attributes when allowUnknownAttributes is true', async () => {
        // Setup
        const store = createTestStore({
          codebookVariables: {
            'var-uuid-1': { name: 'firstName' },
          },
        });

        // Execute
        const result = await store.dispatch(
          addNode({
            type: 'test-node-type-uuid',
            attributeData: {
              'var-uuid-1': 'John',
              'externalField': 'external value',
              'anotherField': 123,
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
        expect(payload.attributeData['var-uuid-1']).toBe('John');
        expect(payload.attributeData.externalField).toBe('external value');
        expect(payload.attributeData.anotherField).toBe(123);
      });
    });
  });

  describe('default attributes', () => {
    it('includes all codebook variables even when only some are provided', async () => {
      // Setup: codebook has 3 node variables
      const store = createTestStore({
        codebookVariables: {
          'var-uuid-1': { name: 'firstName' },
          'var-uuid-2': { name: 'lastName' },
          'var-uuid-3': { name: 'age' },
        },
      });

      // Execute: only provide value for one variable
      const result = await store.dispatch(
        addNode({
          type: 'test-node-type-uuid',
          attributeData: {
            'var-uuid-1': 'John',
          },
          currentStep: 0,
        }),
      );

      // Verify: all variables should be in the payload, missing ones as null
      expect(result.type).toBe('NETWORK/ADD_NODE/fulfilled');
      const payload = result.payload as {
        attributeData: Record<string, unknown>;
      };
      expect(payload.attributeData).toEqual({
        'var-uuid-1': 'John',
        'var-uuid-2': null,
        'var-uuid-3': null,
      });
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
  const uiState = { passphrase: null };

  type SessionState = ReturnType<typeof createTestSessionState>;
  type ProtocolState = ReturnType<typeof createTestProtocolState>;
  type UIState = typeof uiState;

  return configureStore({
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
}) {
  const edgeTypeId = 'test-edge-type-uuid';
  const { edgeVariables = {}, edges = [] } = options;

  const network = createInitialNetwork();
  // Add two nodes so we can create edges between them
  network.nodes = [
    { _uid: 'node-1', type: 'person', attributes: {} },
    { _uid: 'node-2', type: 'person', attributes: {} },
  ];
  network.edges = edges;

  const sessionState = createTestSessionState();
  const protocolState = createTestProtocolState(edgeTypeId, edgeVariables);
  const uiState = { passphrase: null };

  type SessionState = ReturnType<typeof createTestSessionState>;
  type ProtocolState = ReturnType<typeof createTestProtocolState>;
  type UIState = typeof uiState;

  return configureStore({
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
          },
        },
        node: {},
      },
      stages: [{ id: 'stage-1' }],
    };
  }
}

describe('addEdge', () => {
  describe('default attributes', () => {
    it('includes all codebook variables even when only some are provided', async () => {
      // Setup: codebook has 3 edge variables
      const store = createTestStoreWithEdge({
        edgeVariables: {
          'edge-var-1': { name: 'strength' },
          'edge-var-2': { name: 'duration' },
          'edge-var-3': { name: 'frequency' },
        },
      });

      // Execute: only provide value for one variable
      const result = await store.dispatch(
        addEdge({
          type: 'test-edge-type-uuid',
          from: 'node-1',
          to: 'node-2',
          attributeData: {
            'edge-var-1': 5,
          },
          currentStep: 0,
        }),
      );

      // Verify: all variables should be in the payload, missing ones as null
      expect(result.type).toBe('NETWORK/ADD_EDGE/fulfilled');
      const payload = result.payload as {
        attributeData: Record<string, unknown>;
      };
      expect(payload.attributeData).toEqual({
        'edge-var-1': 5,
        'edge-var-2': null,
        'edge-var-3': null,
      });
    });
  });
});

describe('updateEdge', () => {
  describe('attribute validation', () => {
    it('accepts edge attributes defined under the edge codebook', async () => {
      // Setup: an edge of the given type already exists, and the edge variable
      // is defined only under codebook.edge.<type>.variables
      const store = createTestStoreWithEdge({
        edgeVariables: {
          'edge-var-closeness': { name: 'closeness' },
        },
        edges: [
          {
            _uid: 'edge-1',
            from: 'node-1',
            to: 'node-2',
            type: 'test-edge-type-uuid',
            attributes: {},
          },
        ],
      });

      // Execute: update the edge with a value for the edge-defined variable
      const result = await store.dispatch(
        updateEdge({
          edgeId: 'edge-1',
          newAttributeData: {
            'edge-var-closeness': 2,
          },
        }),
      );

      // Verify: the thunk is fulfilled (not rejected). Previously the thunk
      // validated against the NODE codebook, so every edge variable was
      // considered invalid and the thunk was rejected.
      expect(result.type).toBe('NETWORK/UPDATE_EDGE/fulfilled');
      const payload = result.payload as {
        newAttributeData: Record<string, unknown>;
      };
      expect(payload.newAttributeData).toEqual({
        'edge-var-closeness': 2,
      });
    });

    it('rejects edge attributes that are not in the edge codebook', async () => {
      const store = createTestStoreWithEdge({
        edgeVariables: {
          'edge-var-closeness': { name: 'closeness' },
        },
        edges: [
          {
            _uid: 'edge-1',
            from: 'node-1',
            to: 'node-2',
            type: 'test-edge-type-uuid',
            attributes: {},
          },
        ],
      });

      const result = await store.dispatch(
        updateEdge({
          edgeId: 'edge-1',
          newAttributeData: {
            unknownEdgeVar: 5,
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
        person: {
          name: 'Person',
          variables: {
            isCloseTie: { name: 'isCloseTie', type: 'boolean' },
            isFamily: { name: 'isFamily', type: 'boolean' },
          },
        },
      },
    },
    stages: [
      {
        id: 'stage-1',
        type: 'NameGenerator',
        subject: { entity: 'node', type: 'person' },
        prompts,
      },
    ],
  };

  type ProtocolState = typeof protocolState;

  return configureStore({
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
}

describe('removeNodeFromPrompt', () => {
  it('clears a value:false attribute on removal rather than flipping it to true', async () => {
    // Scenario: a NameGenerator prompt offers additionalAttributes value:false.
    // A node was added on this prompt (isCloseTie stored false), then removed.
    // Negating the authored value would corrupt false -> true.
    const store = createTestStoreWithPrompts({
      prompts: [
        {
          id: 'prompt-1',
          additionalAttributes: [{ variable: 'isCloseTie', value: false }],
        },
      ],
      promptIndex: 0,
      nodes: [
        {
          _uid: 'node-1',
          type: 'person',
          attributes: { isCloseTie: false },
          promptIDs: ['prompt-1'],
        },
      ],
    });

    await store.dispatch(
      removeNodeFromPrompt({ nodeId: 'node-1', currentStep: 0 }),
    );

    const node = store.getState().session.network.nodes[0];
    // The node no longer belongs to any prompt asserting isCloseTie, so the
    // attribute must NOT be flipped to true.
    expect(node?.attributes.isCloseTie).not.toBe(true);
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
          additionalAttributes: [{ variable: 'isCloseTie', value: true }],
        },
        {
          id: 'prompt-2',
          additionalAttributes: [{ variable: 'isCloseTie', value: true }],
        },
      ],
      promptIndex: 0, // remove from prompt-1
      nodes: [
        {
          _uid: 'node-1',
          type: 'person',
          attributes: { isCloseTie: true },
          promptIDs: ['prompt-1', 'prompt-2'],
        },
      ],
    });

    await store.dispatch(
      removeNodeFromPrompt({ nodeId: 'node-1', currentStep: 0 }),
    );

    const node = store.getState().session.network.nodes[0];
    expect(node?.attributes.isCloseTie).toBe(true);
    expect(node?.promptIDs).toEqual(['prompt-2']);
  });
});

function createTestStoreWithMetadata(stageMetadata: StageMetadata) {
  const network = createInitialNetwork();
  network.nodes = [
    { _uid: 'node-1', type: 'person', attributes: {} },
    { _uid: 'node-2', type: 'person', attributes: {} },
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

  return configureStore({
    reducer: { session: sessionReducer },
    preloadedState: { session: sessionState },
  });
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

  it('leaves non-census (FamilyPedigree) stage metadata untouched', () => {
    const familyPedigreeMetadata = {
      isNetworkCommitted: true,
      nodes: [{ id: 'node-1', label: 'Ego', isEgo: true }],
    };

    const store = createTestStoreWithMetadata({ 1: familyPedigreeMetadata });

    store.dispatch(deleteNode('node-1'));

    const result = store.getState().session.stageMetadata?.[1];
    expect(result).toEqual(familyPedigreeMetadata);
  });
});

describe('updateEgo', () => {
  describe('default attributes', () => {
    it('returns only the submitted attributes without adding defaults', async () => {
      // Setup: codebook has 3 ego variables
      const store = createTestStoreWithEgo({
        egoVariables: {
          'ego-var-1': { name: 'age' },
          'ego-var-2': { name: 'gender' },
          'ego-var-3': { name: 'occupation' },
        },
      });

      // Execute: only provide value for one variable
      const result = await store.dispatch(
        updateEgo({
          'ego-var-1': 25,
        }),
      );

      // Verify: only submitted attributes are returned.
      // EgoForm is responsible for ensuring all stage fields are included
      // (with null if unanswered). The thunk doesn't add defaults for ALL
      // ego variables, as that would overwrite values from previous EgoForm stages.
      expect(result.type).toBe('NETWORK/UPDATE_EGO/fulfilled');
      expect(result.payload).toEqual({
        'ego-var-1': 25,
      });
    });
  });
});

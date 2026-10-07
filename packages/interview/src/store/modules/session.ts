import { createAction, createReducer, createSelector } from '@reduxjs/toolkit';
import { invariant } from 'es-toolkit';
import { find, get } from 'es-toolkit/compat';
import { v4 as uuid } from 'uuid';

import type { Codebook, LocaleTag } from '@codaco/protocol-validation';
import {
  type EntityPrimaryKey,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcEdge,
  type NcEncryptionHeader,
  type NcEntity,
  type NcNetwork,
  type NcNode,
  type StageMetadata,
  type VariableValue,
} from '@codaco/shared-consts';

import {
  type DecryptionScope,
  getDecryptionScope,
  rememberEncryptedWrite,
} from '../../interfaces/Anonymisation/decryptionScope';
import {
  generateSecureAttributes,
  PassphraseRequiredError,
} from '../../interfaces/Anonymisation/utils';
import {
  makeGetCodebookVariablesForEdgeType,
  makeGetCodebookVariablesForNodeType,
} from '../../selectors/protocol';
import {
  getCurrentStageId,
  getPromptId,
  getPrompts,
  makeGetNodeById,
} from '../../selectors/session';
import { createAppAsyncThunk } from '../createAppAsyncThunk';
import {
  applyEntityAttributePatch,
  type AttributePatch,
  validateAttributePatch,
} from '../entityAttributePatch';
import type { RootState } from '../store';

// reducer helpers:
function flipEdge(edge: Partial<NcEdge>) {
  return { from: edge.to, to: edge.from, type: edge.type };
}

function withLastUpdated<T>(state: T) {
  return {
    ...state,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Check if an edge exists in the network
 * @param {Array} edges - Array of edges
 * @param {string} from - UID of the source node
 * @param {string} to - UID of the target node
 * @param {string} type - Type of edge
 * @returns {string|boolean} - Returns the UID of the edge if it exists, otherwise false
 * @example
 * const edgeExists = edgeExists(edges, 'a', 'b', 'friend');
 *
 */
export function edgeExists(
  edges: NcEdge[],
  from: NcEdge['from'],
  to: NcEdge['to'],
  type: NcEdge['type'],
): NcEdge[EntityPrimaryKey] | false {
  const forwardsEdge = find(edges, { from, to, type });
  const reverseEdge = find(edges, flipEdge({ from, to, type }));

  if (forwardsEdge ?? reverseEdge) {
    const foundEdge = (forwardsEdge ?? reverseEdge)!;
    return get(foundEdge, entityPrimaryKeyProperty) ?? false;
  }

  return false;
}

type StageMetadataEntry = StageMetadata[string];

/**
 * Remove any DyadCensus/TieStrengthCensus metadata entries that reference the
 * given node. Census metadata is stored as `[promptIndex, nodeA, nodeB, value]`
 * tuples; non-census (e.g. FamilyPedigree) entries are objects and are left
 * untouched. Pruning prevents a stale 'No' pre-selection from being revived
 * when a node with the same id is re-added later.
 */
function pruneStageMetadataForNode(
  stageMetadata: StageMetadata | undefined,
  nodeId: NcNode[EntityPrimaryKey],
): StageMetadata | undefined {
  if (!stageMetadata) {
    return stageMetadata;
  }

  return Object.fromEntries(
    Object.entries(stageMetadata).map(([stageId, entry]) => {
      if (!Array.isArray(entry)) {
        return [stageId, entry];
      }

      return [
        stageId,
        entry.filter(
          ([, nodeA, nodeB]) => nodeA !== nodeId && nodeB !== nodeId,
        ),
      ];
    }),
  );
}

export type SessionState = {
  id: string;
  startTime: string;
  finishTime: string | null;
  exportTime: string | null;
  lastUpdated: string;
  network: NcNetwork;
  promptIndex?: number;
  stageMetadata?: StageMetadata; // Used as temporary storage by DyadCensus/TieStrengthCensus
  stageRequiresEncryption?: boolean; // Set to true by the stage if it detects that nodes it creates require encryption
  localePreference: LocaleTag | null;
  locale: LocaleTag | null;
};

const actionTypes = {
  updatePrompt: 'SESSION/UPDATE_PROMPT',
  transitionStage: 'SESSION/TRANSITION_STAGE',
  updateStageMetadata: 'SESSION/UPDATE_STAGE_METADATA',
  setLocalePreference: 'SESSION/SET_LOCALE_PREFERENCE',
  recordLocale: 'SESSION/RECORD_LOCALE',
  addNode: 'NETWORK/ADD_NODE' as const,
  addNodesAndEdges: 'NETWORK/ADD_NODES_AND_EDGES' as const,
  deleteNode: 'NETWORK/DELETE_NODE' as const,
  restoreNode: 'NETWORK/RESTORE_NODE' as const,
  updateNode: 'NETWORK/UPDATE_NODE' as const,
  restoreNodeAttributes: 'NETWORK/RESTORE_NODE_ATTRIBUTES' as const,
  toggleNodeAttributes: 'NETWORK/TOGGLE_NODE_ATTRIBUTES' as const,
  addNodeToPrompt: 'NETWORK/ADD_NODE_TO_PROMPT' as const,
  removeNodeFromPrompt: 'NETWORK/REMOVE_NODE_FROM_PROMPT' as const,
  addEdge: 'NETWORK/ADD_EDGE' as const,
  updateEdge: 'NETWORK/UPDATE_EDGE' as const,
  toggleEdge: 'NETWORK/TOGGLE_EDGE' as const,
  deleteEdge: 'NETWORK/DELETE_EDGE' as const,
  updateEgo: 'NETWORK/UPDATE_EGO' as const,
  setEncryptionHeader: 'NETWORK/SET_ENCRYPTION_HEADER' as const,
};

const initialState = {} as SessionState;

/**
 * The scope holding the key an encrypted write must use. Throwing rejects the
 * whole write, so a patch that mixes encrypted and plain values is never
 * applied in part.
 */
function requireDecryptionScope(
  getState: Parameters<typeof getDecryptionScope>[0],
): DecryptionScope {
  const scope = getDecryptionScope(getState);
  if (!scope) {
    throw new PassphraseRequiredError();
  }
  return scope;
}

type AddNodeArgs = {
  type: NcNode['type'];
  attributeData?: Readonly<Record<string, VariableValue | undefined>>;
  modelData?: {
    [entityPrimaryKeyProperty]: NcNode[EntityPrimaryKey];
  };
  useEncryption?: boolean;
  /** The host-controlled current stage step. Provide via `useCurrentStep()`. */
  currentStep: number;
  /**
   * When true, allows attributes that don't exist in the codebook.
   * Use this for external data (e.g., roster CSVs) where columns may not
   * have corresponding codebook variables.
   */
  allowUnknownAttributes?: boolean;
};

/**
 * The payload that adds a node: its attributes checked against the codebook,
 * and encrypted where `useEncryption` asks. Throws when the node cannot be
 * saved.
 */
async function prepareNode(args: AddNodeArgs, getState: () => RootState) {
  const {
    type,
    attributeData,
    modelData,
    useEncryption,
    allowUnknownAttributes,
    currentStep,
  } = args;
  const state = getState();

  const getCodebookVariablesForNodeType =
    makeGetCodebookVariablesForNodeType(state);

  const variablesForType = getCodebookVariablesForNodeType(type);

  const initialAttributes = applyEntityAttributePatch(
    attributeData ?? {},
    undefined,
    { set: {}, unset: [] },
  ).attributes;

  if (!allowUnknownAttributes) {
    const validation = validateAttributePatch(
      { set: initialAttributes, unset: [] },
      new Set(Object.keys(variablesForType)),
    );

    invariant(
      validation.success,
      `Invalid node attributes for type "${type}": ${validation.success ? '' : validation.error.keys.join(', ')} do not exist in protocol codebook`,
    );
  }

  const sessionMeta = getSessionMeta(state, currentStep);
  // Chosen here rather than in the reducer: an encrypted value is bound to
  // the node it is written for, so the id must be known before encrypting.
  const nodeId = modelData?.[entityPrimaryKeyProperty] ?? uuid();

  if (!useEncryption) {
    return {
      type,
      attributeData: initialAttributes,
      nodeId,
      sessionMeta,
    };
  }

  const scope = requireDecryptionScope(getState);

  const { secureAttributes, encryptedAttributes } =
    await generateSecureAttributes(
      initialAttributes,
      variablesForType,
      scope.key,
      nodeId,
    );
  rememberEncryptedWrite(
    scope,
    nodeId,
    initialAttributes,
    encryptedAttributes,
    secureAttributes ?? {},
  );

  return {
    type,
    attributeData: encryptedAttributes,
    nodeId,
    secureAttributes,
    sessionMeta,
  };
}

export const addNode = createAppAsyncThunk(
  actionTypes.addNode,
  (args: AddNodeArgs, { getState }) => prepareNode(args, getState),
);

type AddEdgeArgs = {
  from: NcNode[EntityPrimaryKey];
  to: NcNode[EntityPrimaryKey];
  type: NcNode['type'];
  attributeData?: Readonly<Record<string, VariableValue | undefined>>;
  currentStep: number;
};

/**
 * The payload that adds an edge, with its attributes checked against the
 * codebook. Throws when the edge cannot be saved.
 */
function prepareEdge(props: AddEdgeArgs, state: RootState) {
  const { from, to, type, attributeData, currentStep } = props;
  const sessionMeta = getSessionMeta(state, currentStep);

  const getCodebookVariablesForEdgeType =
    makeGetCodebookVariablesForEdgeType(state);

  const variablesForType = getCodebookVariablesForEdgeType(type);

  const initialAttributes = applyEntityAttributePatch(
    attributeData ?? {},
    undefined,
    { set: {}, unset: [] },
  ).attributes;
  const validation = validateAttributePatch(
    { set: initialAttributes, unset: [] },
    new Set(Object.keys(variablesForType)),
  );

  invariant(
    validation.success,
    `Invalid edge attributes for type "${type}": ${validation.success ? '' : validation.error.keys.join(', ')} do not exist in protocol codebook`,
  );

  const edgeId = uuid();

  return {
    sessionMeta,
    from,
    to,
    type,
    attributeData: initialAttributes,
    edgeId,
  };
}

export const addEdge = createAppAsyncThunk(
  actionTypes.addEdge,
  (props: AddEdgeArgs, { getState }) => prepareEdge(props, getState()),
);

/**
 * Adds several nodes, and edges between them or existing nodes, as one change
 * to the session: every one is prepared first, and if any cannot be saved,
 * none is. The edges come back with their ids in the order they were given.
 */
export const addNodesAndEdges = createAppAsyncThunk(
  actionTypes.addNodesAndEdges,
  async (
    {
      nodes,
      edges,
      currentStep,
    }: {
      nodes: readonly Omit<AddNodeArgs, 'currentStep'>[];
      edges: readonly Omit<AddEdgeArgs, 'currentStep'>[];
      currentStep: number;
    },
    { getState },
  ) => {
    const preparedNodes: Awaited<ReturnType<typeof prepareNode>>[] = [];
    for (const node of nodes) {
      preparedNodes.push(await prepareNode({ ...node, currentStep }, getState));
    }
    const preparedEdges = edges.map((edge) =>
      prepareEdge({ ...edge, currentStep }, getState()),
    );
    return { nodes: preparedNodes, edges: preparedEdges };
  },
);

export const updateNode = createAppAsyncThunk(
  actionTypes.updateNode,
  async (
    args: {
      nodeId: NcNode[EntityPrimaryKey];
      newModelData?: Record<string, unknown>;
      attributePatch: AttributePatch;
      currentStep: number;
    },
    thunkApi,
  ) => {
    const { attributePatch, newModelData, nodeId, currentStep } = args;
    const state = thunkApi.getState();
    const getNodeById = makeGetNodeById(state, currentStep);
    const node = getNodeById(nodeId);

    invariant(node, 'Node not found');

    const getCodebookVariablesForNodeType =
      makeGetCodebookVariablesForNodeType(state);

    const variablesForType = getCodebookVariablesForNodeType(node.type);

    const validation = validateAttributePatch(
      attributePatch,
      new Set(Object.keys(variablesForType)),
    );

    invariant(
      validation.success,
      validation.success
        ? ''
        : `Invalid node attribute patch for type "${node.type}": ${validation.error.keys.join(', ')} ${validation.error.code === 'unknown-keys' ? 'do not exist in protocol codebook' : 'cannot be both set and unset'}`,
    );

    const hasEncryptedAttributes = Object.keys(attributePatch.set).some(
      (key) => variablesForType[key]?.encrypted,
    );

    if (!hasEncryptedAttributes) {
      return {
        nodeId,
        attributePatch,
        newModelData,
        secureSet: undefined,
      };
    }

    const scope = requireDecryptionScope(thunkApi.getState);

    const { secureAttributes, encryptedAttributes } =
      await generateSecureAttributes(
        attributePatch.set,
        variablesForType,
        scope.key,
        nodeId,
      );
    rememberEncryptedWrite(
      scope,
      nodeId,
      attributePatch.set,
      encryptedAttributes,
      secureAttributes ?? {},
    );

    return {
      nodeId,
      attributePatch: {
        set: encryptedAttributes,
        unset: attributePatch.unset,
      },
      newModelData: newModelData,
      secureSet: secureAttributes,
    };
  },
);

export const deleteNode = createAction<NcNode[EntityPrimaryKey]>(
  actionTypes.deleteNode,
);

export const deleteEdge = createAction<NcEdge[EntityPrimaryKey]>(
  actionTypes.deleteEdge,
);

type SecureAttributeMetadata = NonNullable<
  NcNode[typeof entitySecureAttributesMeta]
>[string];

/**
 * Captured attribute values of one node, each with its secure-attribute
 * metadata as stored. `null` records a key the node did not have.
 */
export type NodeAttributeSnapshot = Readonly<
  Record<
    string,
    { value: VariableValue; secure?: SecureAttributeMetadata } | null
  >
>;

/**
 * Undo/redo support: puts back a node exactly as it was captured. Unlike
 * addNode it neither validates nor encrypts, because the snapshot is already
 * stored state — an encrypted value comes back together with its IV, under
 * the same node id it is bound to.
 */
export const restoreNode = createAction<NcNode>(actionTypes.restoreNode);

/**
 * Undo/redo support: writes a captured slice of a node's attributes back, each
 * value together with its own secure-attribute metadata (or the lack of it).
 */
export const restoreNodeAttributes = createAction<{
  nodeId: NcNode[EntityPrimaryKey];
  snapshot: NodeAttributeSnapshot;
}>(actionTypes.restoreNodeAttributes);

/**
 * Records how this interview's encryption key is derived and checked. Written
 * once, when the first passphrase is accepted; a header already in place is
 * never replaced, because every stored value depends on it.
 */
export const setEncryptionHeader = createAction<NcEncryptionHeader>(
  actionTypes.setEncryptionHeader,
);

export const updatePrompt = createAction<number>(actionTypes.updatePrompt);
/**
 * Signals that the host-controlled `currentStep` has changed and any
 * stage-local Redux state should be reset. The reducer resets
 * `promptIndex` to 0 and clears `stageRequiresEncryption`. The `currentStep`
 * itself is NOT stored in Redux — it lives in `CurrentStepContext`.
 */
export const transitionStage = createAction(actionTypes.transitionStage);

export const updateEgo = createAppAsyncThunk(
  actionTypes.updateEgo,
  (attributePatch: AttributePatch, { getState }) => {
    const state = getState();
    const codebook = state.protocol.codebook as Codebook; // Needed because schema 7 doesn't have strongly typed codebook
    const egoVariables = codebook.ego?.variables;

    invariant(egoVariables, 'Ego variables not defined in protocol codebook');

    const validation = validateAttributePatch(
      attributePatch,
      new Set(Object.keys(egoVariables)),
    );

    invariant(
      validation.success,
      validation.success
        ? ''
        : `Invalid ego attribute patch: ${validation.error.keys.join(', ')} ${validation.error.code === 'unknown-keys' ? 'do not exist in protocol codebook' : 'cannot be both set and unset'}`,
    );

    return attributePatch;
  },
);

export const toggleEdge = createAppAsyncThunk(
  actionTypes.toggleEdge,
  async (
    props: {
      from: NcNode[EntityPrimaryKey];
      to: NcNode[EntityPrimaryKey];
      type: NcNode['type'];
      attributeData?: Readonly<Record<string, VariableValue | undefined>>;
      currentStep: number;
    },
    { getState, dispatch },
  ) => {
    const { from, to, type, attributeData, currentStep } = props;
    const state = getState();

    const existingEdge = edgeExists(
      state.session.network.edges,
      from,
      to,
      type,
    );

    if (existingEdge) {
      return dispatch(deleteEdge(existingEdge));
    }

    return dispatch(addEdge({ from, to, type, attributeData, currentStep }));
  },
);

const getSessionMeta = createSelector(
  getPromptId,
  getCurrentStageId,
  (promptId, stageId) => ({ promptId, stageId }),
);

export const addNodeToPrompt = createAppAsyncThunk(
  actionTypes.addNodeToPrompt,
  (
    props: {
      nodeId: NcNode[EntityPrimaryKey];
      promptAttributes: Record<string, boolean>;
      currentStep: number;
    },
    { getState },
  ) => {
    const { nodeId, promptAttributes, currentStep } = props;
    const state = getState();
    const promptId = getPromptId(state, currentStep);

    return {
      nodeId,
      promptId,
      promptAttributes,
    };
  },
);

export const toggleNodeAttributes = createAppAsyncThunk(
  actionTypes.toggleNodeAttributes,
  (
    args: {
      nodeId: NcNode[EntityPrimaryKey];
      attributePatch: AttributePatch;
    },
    { getState },
  ) => {
    const { nodeId, attributePatch } = args;
    const state = getState();
    const node = state.session.network.nodes.find(
      (candidate) => candidate[entityPrimaryKeyProperty] === nodeId,
    );

    invariant(node, 'Node not found');

    const variablesForType = makeGetCodebookVariablesForNodeType(state)(
      node.type,
    );
    const validation = validateAttributePatch(
      attributePatch,
      new Set(Object.keys(variablesForType)),
    );

    invariant(
      validation.success,
      validation.success
        ? ''
        : `Invalid node attribute patch for type "${node.type}": ${validation.error.keys.join(', ')} ${validation.error.code === 'unknown-keys' ? 'do not exist in protocol codebook' : 'cannot be both set and unset'}`,
    );

    return args;
  },
);

type StagePrompt = NonNullable<ReturnType<typeof getPrompts>>[number];

function getPromptAdditionalAttributesMap(
  prompt: StagePrompt,
): Record<string, boolean> {
  if (!('additionalAttributes' in prompt)) {
    return {};
  }

  return (prompt.additionalAttributes ?? []).reduce<Record<string, boolean>>(
    (acc, { variable, value }) => {
      acc[variable] = value;
      return acc;
    },
    {},
  );
}

export const removeNodeFromPrompt = createAppAsyncThunk(
  actionTypes.removeNodeFromPrompt,
  (
    args: { nodeId: NcNode[EntityPrimaryKey]; currentStep: number },
    { getState },
  ) => {
    const { nodeId, currentStep } = args;
    const state = getState();
    const promptId = getPromptId(state, currentStep);
    invariant(promptId, 'Prompt ID is required to remove a node from a prompt');

    const prompts = getPrompts(state, currentStep) ?? [];
    const removedPrompt = prompts.find((prompt) => prompt.id === promptId);
    const removedAttributes = removedPrompt
      ? getPromptAdditionalAttributesMap(removedPrompt)
      : {};

    const getNodeById = makeGetNodeById(state, currentStep);
    const node = getNodeById(nodeId);
    const remainingPromptIds = (node?.promptIDs ?? []).filter(
      (id) => id !== promptId,
    );

    const set: Record<string, VariableValue> = {};
    const unset: string[] = [];

    Object.keys(removedAttributes).forEach((variable) => {
      let resolvedValue: boolean | undefined;

      prompts.forEach((prompt) => {
        if (!remainingPromptIds.includes(prompt.id)) {
          return;
        }
        const promptAttributes = getPromptAdditionalAttributesMap(prompt);
        if (variable in promptAttributes) {
          resolvedValue = promptAttributes[variable];
        }
      });

      if (resolvedValue === undefined) {
        unset.push(variable);
      } else {
        set[variable] = resolvedValue;
      }
    });

    return {
      nodeId,
      promptId,
      attributePatch: { set, unset },
    };
  },
);

export const updateEdge = createAppAsyncThunk(
  actionTypes.updateEdge,
  (
    args: {
      edgeId: NcEntity[EntityPrimaryKey]; // Must be uid as this is shared between nodes and edges on slidesform
      newModelData?: Record<string, unknown>;
      attributePatch: AttributePatch;
    },
    { getState },
  ) => {
    const { edgeId, newModelData, attributePatch } = args;
    const state = getState();
    const edge = state.session.network.edges.find(
      (e) => e[entityPrimaryKeyProperty] === edgeId,
    );

    invariant(edge, 'Edge not found');

    const getCodebookVariablesForEdgeType =
      makeGetCodebookVariablesForEdgeType(state);

    const variablesForType = getCodebookVariablesForEdgeType(edge.type);
    const validation = validateAttributePatch(
      attributePatch,
      new Set(Object.keys(variablesForType)),
    );

    invariant(
      validation.success,
      validation.success
        ? ''
        : `Invalid edge attribute patch for type "${edge.type}": ${validation.error.keys.join(', ')} ${validation.error.code === 'unknown-keys' ? 'do not exist in protocol codebook' : 'cannot be both set and unset'}`,
    );

    return {
      edgeId,
      newModelData,
      attributePatch,
    };
  },
);

export const updateStageMetadata = createAction<{
  currentStep: number;
  metadata: StageMetadataEntry;
}>(actionTypes.updateStageMetadata);

/**
 * The participant chose a language. The choice is also the language now shown,
 * so both fields change together and the host hears about it once.
 */
export const setLocalePreference = createAction<LocaleTag>(
  actionTypes.setLocalePreference,
);

/** Records the protocol translation shown, for exports. */
export const recordLocale = createAction<LocaleTag>(actionTypes.recordLocale);

function newNodeFrom(
  network: NcNetwork,
  {
    type,
    attributeData,
    secureAttributes,
    sessionMeta,
    nodeId,
  }: Awaited<ReturnType<typeof prepareNode>>,
): NcNode {
  const { promptId, stageId } = sessionMeta;
  invariant(stageId, 'Stage ID is required to add a node');

  const existingNode = find(network.nodes, {
    [entityPrimaryKeyProperty]: nodeId,
  });
  invariant(!existingNode, 'Node with this ID already exists in network');

  return {
    [entityPrimaryKeyProperty]: nodeId,
    type,
    [entityAttributesProperty]: attributeData,
    [entitySecureAttributesMeta]: secureAttributes,
    promptIDs: promptId ? [promptId] : [],
    stageId: stageId,
  };
}

function newEdgeFrom({
  from,
  to,
  type,
  attributeData,
  edgeId,
}: ReturnType<typeof prepareEdge>): NcEdge {
  return {
    [entityPrimaryKeyProperty]: edgeId,
    from,
    to,
    type,
    [entityAttributesProperty]: attributeData,
  };
}

const sessionReducer = createReducer(initialState, (builder) => {
  builder.addCase(addNode.fulfilled, (state, action) => {
    const newNode = newNodeFrom(state.network, action.payload);

    return withLastUpdated({
      ...state,
      network: {
        ...state.network,
        nodes: [...state.network.nodes, newNode],
      },
    });
  });

  builder.addCase(addNodesAndEdges.fulfilled, (state, action) => {
    const nodes = [...state.network.nodes];
    for (const payload of action.payload.nodes) {
      nodes.push(newNodeFrom({ ...state.network, nodes }, payload));
    }

    return withLastUpdated({
      ...state,
      network: {
        ...state.network,
        nodes,
        edges: [
          ...state.network.edges,
          ...action.payload.edges.map(newEdgeFrom),
        ],
      },
    });
  });

  builder.addCase(addNodeToPrompt.fulfilled, (state, action) => {
    const { nodeId, promptId, promptAttributes } = action.payload;
    const { network } = state;
    const { nodes } = network;

    invariant(promptId, 'Prompt ID is required to add a node to a prompt');

    // TODO: this should possibly encrypt prompt attributes. However, they are
    // boolean values and so are unlikely to be sensitive.

    return withLastUpdated({
      ...state,
      network: {
        ...network,
        nodes: nodes.map((node) => {
          if (node[entityPrimaryKeyProperty] !== nodeId) {
            return node;
          }

          // The prompt's additionalAttributes apply to the node, overwriting any
          // value it already carries for the same variable. The network is the
          // single source of truth: adding a node to this prompt asserts the
          // prompt's values, and a value a form merely displayed is not owned by
          // the form.
          const patched = applyEntityAttributePatch(
            node[entityAttributesProperty],
            node[entitySecureAttributesMeta],
            { set: promptAttributes, unset: [] },
          );

          return {
            ...node,
            promptIDs: [...(node.promptIDs ?? []), promptId],
            [entityAttributesProperty]: patched.attributes,
            [entitySecureAttributesMeta]: patched.secureAttributes,
          };
        }),
      },
    });
  });

  builder.addCase(removeNodeFromPrompt.fulfilled, (state, action) => {
    const { nodeId, promptId, attributePatch } = action.payload;
    const { network } = state;
    const { nodes } = network;

    return withLastUpdated({
      ...state,
      network: {
        ...network,
        nodes: nodes.map((node) => {
          if (node[entityPrimaryKeyProperty] !== nodeId) {
            return node;
          }

          const patched = applyEntityAttributePatch(
            node[entityAttributesProperty],
            node[entitySecureAttributesMeta],
            attributePatch,
          );

          return {
            ...node,
            promptIDs: node.promptIDs?.filter((id) => id !== promptId),
            [entityAttributesProperty]: patched.attributes,
            [entitySecureAttributesMeta]: patched.secureAttributes,
          };
        }),
      },
    });
  });

  builder.addCase(deleteNode, (state, action) => {
    const { network } = state;
    const { nodes } = network;

    return withLastUpdated({
      ...state,
      stageMetadata: pruneStageMetadataForNode(
        state.stageMetadata,
        action.payload,
      ),
      network: {
        ...network,
        nodes: nodes.filter(
          (node) => node[entityPrimaryKeyProperty] !== action.payload,
        ),
        edges: network.edges.filter(
          (edge) => edge.from !== action.payload && edge.to !== action.payload,
        ),
      },
    });
  });

  builder.addCase(restoreNode, (state, action) => {
    const node = action.payload;
    invariant(
      !find(state.network.nodes, {
        [entityPrimaryKeyProperty]: node[entityPrimaryKeyProperty],
      }),
      'Node with this ID already exists in network',
    );

    return withLastUpdated({
      ...state,
      network: {
        ...state.network,
        nodes: [...state.network.nodes, node],
      },
    });
  });

  builder.addCase(restoreNodeAttributes, (state, action) => {
    const { nodeId, snapshot } = action.payload;
    const { network } = state;

    return withLastUpdated({
      ...state,
      network: {
        ...network,
        nodes: network.nodes.map((node) => {
          if (node[entityPrimaryKeyProperty] !== nodeId) {
            return node;
          }

          const entries = Object.entries(snapshot);
          const captured = entries.flatMap(([key, entry]) =>
            entry === null ? [] : [{ key, ...entry }],
          );
          const set = Object.fromEntries(
            captured.map(({ key, value }): [string, VariableValue] => [
              key,
              value,
            ]),
          );
          const secureSet = Object.fromEntries(
            captured.flatMap(
              ({ key, secure }): [string, SecureAttributeMetadata][] =>
                secure ? [[key, secure]] : [],
            ),
          );

          // Setting a key drops the metadata its current value carries, so a
          // restored value only ever pairs with its own captured IV.
          const patched = applyEntityAttributePatch(
            node[entityAttributesProperty],
            node[entitySecureAttributesMeta],
            {
              set,
              unset: entries.flatMap(([key, entry]) =>
                entry === null ? [key] : [],
              ),
            },
            secureSet,
          );

          return {
            ...node,
            [entityAttributesProperty]: patched.attributes,
            [entitySecureAttributesMeta]: patched.secureAttributes,
          };
        }),
      },
    });
  });

  builder.addCase(toggleNodeAttributes.fulfilled, (state, action) => {
    const { nodeId, attributePatch } = action.payload;
    const { network } = state;

    return withLastUpdated({
      ...state,
      network: {
        ...network,
        nodes: network.nodes.map((node) => {
          if (node[entityPrimaryKeyProperty] !== nodeId) {
            return node;
          }

          const patched = applyEntityAttributePatch(
            node[entityAttributesProperty],
            node[entitySecureAttributesMeta],
            attributePatch,
          );

          return {
            ...node,
            [entityAttributesProperty]: patched.attributes,
            [entitySecureAttributesMeta]: patched.secureAttributes,
          };
        }),
      },
    });
  });

  builder.addCase(setEncryptionHeader, (state, action) => {
    invariant(
      !state.network.encryption,
      'This interview already has an encryption header',
    );
    return withLastUpdated({
      ...state,
      network: { ...state.network, encryption: action.payload },
    });
  });

  builder.addCase(updatePrompt, (state, action) => {
    return {
      ...state,
      promptIndex: action.payload,
    };
  });

  builder.addCase(transitionStage, (state) => {
    return withLastUpdated({
      ...state,
      promptIndex: 0,
      stageRequiresEncryption: false,
    });
  });

  builder.addCase(updateNode.fulfilled, (state, action) => {
    const { nodeId, attributePatch, newModelData, secureSet } = action.payload;
    const { network } = state;
    const { nodes } = network;

    return withLastUpdated({
      ...state,
      network: {
        ...network,
        nodes: nodes.map((node) => {
          if (node[entityPrimaryKeyProperty] !== nodeId) {
            return node;
          }

          const mergedPromptIDs = new Set<string>([]);

          if (node.promptIDs) {
            node.promptIDs.forEach((id) => {
              mergedPromptIDs.add(id);
            });
          }

          if (
            newModelData &&
            'promptId' in newModelData &&
            typeof newModelData.promptId === 'string'
          ) {
            const newId = newModelData.promptId;
            mergedPromptIDs.add(newId);
          }

          const patched = applyEntityAttributePatch(
            node[entityAttributesProperty],
            node[entitySecureAttributesMeta],
            attributePatch,
            secureSet,
          );

          return {
            ...node,
            ...newModelData,
            promptIDs: Array.from(mergedPromptIDs),
            [entityAttributesProperty]: patched.attributes,
            [entitySecureAttributesMeta]: patched.secureAttributes,
          };
        }),
      },
    });
  });

  builder.addCase(addEdge.fulfilled, (state, action) => {
    const newEdge = newEdgeFrom(action.payload);

    return withLastUpdated({
      ...state,
      network: {
        ...state.network,
        edges: [...state.network.edges, newEdge],
      },
    });
  });

  builder.addCase(deleteEdge, (state, action) => {
    const { network } = state;
    const { edges } = network;

    return withLastUpdated({
      ...state,
      network: {
        ...network,
        edges: edges.filter(
          (edge) => edge[entityPrimaryKeyProperty] !== action.payload,
        ),
      },
    });
  });

  builder.addCase(updateEdge.fulfilled, (state, action) => {
    const { edgeId, newModelData, attributePatch } = action.payload;
    const { network } = state;
    const { edges } = network;

    return withLastUpdated({
      ...state,
      network: {
        ...network,
        edges: edges.map((edge) => {
          if (edge[entityPrimaryKeyProperty] !== edgeId) {
            return edge;
          }

          const patched = applyEntityAttributePatch(
            edge[entityAttributesProperty],
            edge[entitySecureAttributesMeta],
            attributePatch,
          );

          return {
            ...edge,
            ...newModelData,
            [entityAttributesProperty]: patched.attributes,
            [entitySecureAttributesMeta]: patched.secureAttributes,
          };
        }),
      },
    });
  });

  builder.addCase(updateStageMetadata, (state, action) => {
    const { currentStep, metadata } = action.payload;
    return withLastUpdated({
      ...state,
      stageMetadata: {
        ...state.stageMetadata,
        [currentStep]: metadata,
      },
    });
  });

  // Neither locale action touches `lastUpdated`: they are not interview data,
  // and the general sync route does not write them.
  builder.addCase(setLocalePreference, (state, action) => {
    if (
      state.localePreference === action.payload &&
      state.locale === action.payload
    ) {
      return state;
    }
    return {
      ...state,
      localePreference: action.payload,
      locale: action.payload,
    };
  });

  builder.addCase(recordLocale, (state, action) => {
    if (state.locale === action.payload) return state;
    return { ...state, locale: action.payload };
  });

  builder.addCase(updateEgo.fulfilled, (state, action) => {
    const { network } = state;
    const patched = applyEntityAttributePatch(
      network.ego[entityAttributesProperty],
      network.ego[entitySecureAttributesMeta],
      action.payload,
    );

    return withLastUpdated({
      ...state,
      network: {
        ...network,
        ego: {
          ...network.ego,
          [entityAttributesProperty]: patched.attributes,
          [entitySecureAttributesMeta]: patched.secureAttributes,
        },
      },
    });
  });
});

export default sessionReducer;

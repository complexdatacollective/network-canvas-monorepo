import { createAction, createReducer, createSelector } from '@reduxjs/toolkit';
import { invariant } from 'es-toolkit';
import { find, get } from 'es-toolkit/compat';
import { v4 as uuid } from 'uuid';

import type { Codebook } from '@codaco/protocol-validation';
import {
  type EntityPrimaryKey,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcEdge,
  type NcEntity,
  type NcNetwork,
  type NcNode,
  type StageMetadata,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateSecureAttributes } from '../../interfaces/Anonymisation/utils';
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
import { getShouldEncryptNames } from './protocol';

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
};

const actionTypes = {
  updatePrompt: 'SESSION/UPDATE_PROMPT',
  transitionStage: 'SESSION/TRANSITION_STAGE',
  updateStageMetadata: 'SESSION/UPDATE_STAGE_METADATA',
  addNode: 'NETWORK/ADD_NODE' as const,
  deleteNode: 'NETWORK/DELETE_NODE' as const,
  updateNode: 'NETWORK/UPDATE_NODE' as const,
  toggleNodeAttributes: 'NETWORK/TOGGLE_NODE_ATTRIBUTES' as const,
  addNodeToPrompt: 'NETWORK/ADD_NODE_TO_PROMPT' as const,
  removeNodeFromPrompt: 'NETWORK/REMOVE_NODE_FROM_PROMPT' as const,
  addEdge: 'NETWORK/ADD_EDGE' as const,
  updateEdge: 'NETWORK/UPDATE_EDGE' as const,
  toggleEdge: 'NETWORK/TOGGLE_EDGE' as const,
  deleteEdge: 'NETWORK/DELETE_EDGE' as const,
  updateEgo: 'NETWORK/UPDATE_EGO' as const,
};

const initialState = {} as SessionState;

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

export const addNode = createAppAsyncThunk(
  actionTypes.addNode,
  async (args: AddNodeArgs, thunkApi) => {
    const {
      type,
      attributeData,
      modelData,
      useEncryption,
      allowUnknownAttributes,
      currentStep,
    } = args;
    const state = thunkApi.getState();

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

    if (!useEncryption) {
      return {
        type,
        attributeData: initialAttributes,
        modelData,
        sessionMeta,
      };
    }

    const { passphrase } = state.ui;

    invariant(
      passphrase,
      'Passphrase is required to add a node when encryption is enabled',
    );

    const { secureAttributes, encryptedAttributes } =
      await generateSecureAttributes(
        initialAttributes,
        variablesForType,
        passphrase,
      );

    return {
      type,
      attributeData: encryptedAttributes,
      modelData,
      secureAttributes,
      sessionMeta,
    };
  },
);

type AddEdgeArgs = {
  from: NcNode[EntityPrimaryKey];
  to: NcNode[EntityPrimaryKey];
  type: NcNode['type'];
  attributeData?: Readonly<Record<string, VariableValue | undefined>>;
  /**
   * Optional caller-supplied edge id, used in place of a freshly minted uuid.
   * Mirrors the channel `addNode` already offers for nodes, so a synthetic
   * interview trace can be replayed through the real store under the ids the
   * generation engine folded into its own session. That engine never imports
   * this package (design decision 13), so replay parity (criterion C1) has no
   * other way to line the two sets of ids up. An id already present in the
   * network is rejected by the reducer.
   */
  modelData?: {
    [entityPrimaryKeyProperty]: NcEdge[EntityPrimaryKey];
  };
  /** The host-controlled current stage step. Provide via `useCurrentStep()`. */
  currentStep: number;
};

export const addEdge = createAppAsyncThunk(
  actionTypes.addEdge,
  (props: AddEdgeArgs, { getState }) => {
    const { from, to, type, attributeData, modelData, currentStep } = props;
    const state = getState();
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

    const edgeId = modelData?.[entityPrimaryKeyProperty] ?? uuid();

    return {
      sessionMeta,
      from,
      to,
      type,
      attributeData: initialAttributes,
      modelData,
      edgeId,
    };
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

    const useEncryption = getShouldEncryptNames(state);
    // We know that encryption is enabled at the protocol level, but are the node attributes we are updating encrypted?
    const hasEncryptedAttributes = Object.keys(attributePatch.set).some(
      (key) => variablesForType[key]?.encrypted,
    );

    if (!useEncryption || !hasEncryptedAttributes) {
      return {
        nodeId,
        attributePatch,
        newModelData,
        secureSet: undefined,
      };
    }

    const { passphrase } = state.ui;

    invariant(passphrase, 'Passphrase is required to update this node');

    const { secureAttributes, encryptedAttributes } =
      await generateSecureAttributes(
        attributePatch.set,
        variablesForType,
        passphrase,
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

export const updatePrompt = createAction<number>(actionTypes.updatePrompt);
/**
 * Signals that the host-controlled `currentStep` has changed and any
 * stage-local Redux state should be reset. The reducer resets
 * `promptIndex` to 0. The `currentStep` itself is NOT stored in Redux — it
 * lives in `CurrentStepContext`.
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
      /**
       * Optional caller-supplied edge id, forwarded to `addEdge` when the
       * toggle creates. See `AddEdgeArgs`. The deleting branch ignores it: the
       * edge it removes is the one already in the network.
       */
      modelData?: {
        [entityPrimaryKeyProperty]: NcEdge[EntityPrimaryKey];
      };
      currentStep: number;
    },
    { getState, dispatch },
  ) => {
    const { from, to, type, attributeData, modelData, currentStep } = props;
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

    return dispatch(
      addEdge({ from, to, type, attributeData, modelData, currentStep }),
    );
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

const sessionReducer = createReducer(initialState, (builder) => {
  builder.addCase(addNode.fulfilled, (state, action) => {
    const { secureAttributes, sessionMeta, modelData } = action.payload;
    const { promptId, stageId } = sessionMeta;
    invariant(stageId, 'Stage ID is required to add a node');

    const {
      payload: { type, attributeData },
    } = action;

    // If node UUID is provided, check that it doesn't already exist in the network
    if (modelData?.[entityPrimaryKeyProperty]) {
      const existingNode = find(state.network.nodes, {
        [entityPrimaryKeyProperty]: modelData[entityPrimaryKeyProperty],
      });
      invariant(!existingNode, 'Node with this ID already exists in network');
    }

    const newNode: NcNode = {
      [entityPrimaryKeyProperty]:
        modelData?.[entityPrimaryKeyProperty] ?? uuid(),
      type,
      [entityAttributesProperty]: attributeData,
      [entitySecureAttributesMeta]: secureAttributes,
      promptIDs: promptId ? [promptId] : [],
      stageId: stageId,
    };

    return withLastUpdated({
      ...state,
      network: {
        ...state.network,
        nodes: [...state.network.nodes, newNode],
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
    });
  });

  builder.addCase(updateNode.fulfilled, (state, action) => {
    const { nodeId, attributePatch, newModelData, secureSet } = action.payload;
    const { network } = state;
    const { nodes } = network;

    // TODO: must be updated to support encrypted attributes.
    // Should have an additional parameter controlling this (see addNode)
    // Stage should control this parameter, using the usePassphrase hook

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
    const {
      payload: { from, to, type, attributeData, modelData, edgeId },
    } = action;

    // If an edge UUID is provided, check that it doesn't already exist in the network
    if (modelData?.[entityPrimaryKeyProperty]) {
      const existingEdge = find(state.network.edges, {
        [entityPrimaryKeyProperty]: modelData[entityPrimaryKeyProperty],
      });
      invariant(!existingEdge, 'Edge with this ID already exists in network');
    }

    const newEdge: NcEdge = {
      [entityPrimaryKeyProperty]: edgeId,
      from,
      to,
      type,
      [entityAttributesProperty]: attributeData,
    };

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

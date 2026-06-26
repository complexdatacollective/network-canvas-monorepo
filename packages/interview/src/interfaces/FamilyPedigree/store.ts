import { enableMapSet } from 'immer';
import { createStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type {
  FramingId,
  NcEdge,
  NcNode,
  RelationshipType,
  VariableValue,
} from '@codaco/shared-consts';
import {
  addEdge as addEdgeToNetwork,
  addNode as addNodeToNetwork,
  deleteNode,
  updateStageMetadata,
} from '~/store/modules/session';
import type { useAppDispatch } from '~/store/store';

import {
  computeAllDisplayLabels,
  computeRelationshipsToEgo,
} from './pedigree-layout/utils/getDisplayLabel';
import { getEdgeRelationshipType } from './utils/edgeUtils';

enableMapSet();

export type VariableConfig = {
  nodeType: string;
  edgeType: string;
  nodeLabelVariable: string;
  egoVariable: string;
  /** Text node variable storing the computed relationship to ego. */
  relationshipVariable: string;
  relationshipTypeVariable: string;
  isActiveVariable: string;
  isGestationalCarrierVariable: string;
  /** Edge variable storing the gamete role ('egg'|'sperm') of a biological/donor parent. */
  gameteRoleVariable: string;
  /** Node variable storing the biological sex of non-gamete-parent people. */
  biologicalSexVariable: string;
};

export type NodeMetadata = {
  readOnly: boolean;
};

/**
 * Which gamete a biological/donor parent contributed. Written to the network
 * as an edge attribute under `variableConfig.gameteRoleVariable`.
 */
export type GameteRole = 'egg' | 'sperm';

/** A pedigree edge. gameteRole is stored in `attributes[gameteRoleVariable]`. */
export type FamilyEdge = NcEdge;

export type CommitBatch = {
  nodes: {
    tempId: string;
    data: {
      attributes: Record<string, VariableValue>;
    };
  }[];
  edges: {
    source: string;
    target: string;
    data: {
      attributes: Record<string, VariableValue>;
    };
  }[];
};

type FamilyPedigreeState = {
  step: 'scaffolding' | 'diseaseNomination';
  activeNominationVariable: string | null;
  framing: FramingId | null;
  network: {
    nodes: Map<string, NcNode>;
    edges: Map<string, FamilyEdge>;
  };
  nodeMetadata: Map<string, NodeMetadata>;
  storeToReduxIdMap: Map<string, string>;
};

type NetworkActions = {
  addNode: (node: {
    attributes: Record<string, VariableValue>;
    id?: string;
  }) => string;
  updateNode: (id: string, attributes: Record<string, VariableValue>) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: {
    from: string;
    to: string;
    attributes: Record<string, VariableValue>;
    id?: string;
  }) => string;
  removeEdge: (id: string) => void;
  clearNetwork: () => void;
  setStep: (step: FamilyPedigreeState['step']) => void;
  setActiveNominationVariable: (variable: string | null) => void;
  setFraming: (framing: FramingId) => void;
  commitBatch: (batch: CommitBatch) => void;
  syncMetadata: () => void;
  finalizeNetwork: () => Promise<void>;
  resetNetwork: () => void;
};

export type FamilyPedigreeStore = FamilyPedigreeState & NetworkActions;

export const createFamilyPedigreeStore = (
  initialNodes: Map<string, NcNode>,
  initialEdges: Map<string, NcEdge>,
  initialNodeMetadata: Map<string, NodeMetadata>,
  variableConfig: VariableConfig,
  dispatch?: ReturnType<typeof useAppDispatch>,
  currentStep?: number,
  // Store ids of nodes/edges that were seeded from the existing interview
  // network and therefore already live in Redux. finalizeNetwork must not
  // re-commit these: the network is one shared graph, so writing them again
  // would duplicate pre-existing same-type nodes and edges.
  preexistingReduxNodeIds: ReadonlySet<string> = new Set(),
  preexistingReduxEdgeIds: ReadonlySet<string> = new Set(),
  initialFraming: FramingId | null = null,
) => {
  // Guard the network invariant that at most one edge of a given relationship
  // type connects any pair of nodes. Throwing surfaces edge-creation bugs (e.g.
  // a parent ending up with two biological edges to the same child) loudly
  // rather than letting silent duplicates accumulate.
  const assertUniqueEdge = (
    edges: Map<string, FamilyEdge>,
    from: string,
    to: string,
    attributes: Record<string, VariableValue>,
  ) => {
    const incomingValue = attributes[variableConfig.relationshipTypeVariable];
    const relationshipType: RelationshipType | undefined = Array.isArray(
      incomingValue,
    )
      ? (incomingValue[0] as RelationshipType | undefined)
      : undefined;
    for (const edge of edges.values()) {
      if (
        getEdgeRelationshipType(
          edge,
          variableConfig.relationshipTypeVariable,
        ) === relationshipType &&
        ((edge.from === from && edge.to === to) ||
          (edge.from === to && edge.to === from))
      ) {
        throw new Error(
          `Duplicate FamilyPedigree edge: a "${String(relationshipType)}" edge already connects "${from}" and "${to}".`,
        );
      }
    }
  };

  return createStore<FamilyPedigreeStore>()(
    immer((set, get) => {
      return {
        step: 'scaffolding',
        activeNominationVariable: null,
        framing: initialFraming,
        network: {
          nodes: initialNodes,
          edges: initialEdges,
        },
        nodeMetadata: initialNodeMetadata,
        storeToReduxIdMap: new Map<string, string>(),

        setStep: (step) =>
          set((state) => {
            state.step = step;
          }),

        setActiveNominationVariable: (variable) =>
          set((state) => {
            state.activeNominationVariable = variable;
          }),

        setFraming: (framing) =>
          set((state) => {
            state.framing = framing;
          }),

        addNode: (node) => {
          const { id, attributes } = node;
          const nodeId = id ?? crypto.randomUUID();
          const isEgo = attributes[variableConfig.egoVariable] === true;

          set((state) => {
            state.network.nodes.set(nodeId, {
              _uid: nodeId,
              type: variableConfig.nodeType,
              attributes,
            });
            state.nodeMetadata.set(nodeId, { readOnly: isEgo });
          });

          return nodeId;
        },

        updateNode: (id, attributes) => {
          set((state) => {
            const node = state.network.nodes.get(id);
            if (node) {
              Object.assign(node.attributes, attributes);
            }
          });
        },

        removeNode: (id) => {
          set((state) => {
            state.network.nodes.delete(id);
            state.nodeMetadata.delete(id);

            const edgesToRemove: string[] = [];
            state.network.edges.forEach((edge, edgeId) => {
              if (edge.from === id || edge.to === id) {
                edgesToRemove.push(edgeId);
              }
            });
            edgesToRemove.forEach((edgeId) => {
              state.network.edges.delete(edgeId);
            });
          });
        },

        addEdge: (edge) => {
          const { id, from, to, attributes } = edge;
          const edgeId = id ?? crypto.randomUUID();

          set((state) => {
            assertUniqueEdge(state.network.edges, from, to, attributes);
            state.network.edges.set(edgeId, {
              _uid: edgeId,
              type: variableConfig.edgeType,
              from,
              to,
              attributes,
            });
          });

          return edgeId;
        },

        removeEdge: (id) => {
          set((state) => {
            state.network.edges.delete(id);
          });
        },

        clearNetwork: () => {
          set((state) => {
            state.network.nodes.clear();
            state.network.edges.clear();
            state.nodeMetadata.clear();
          });
        },

        commitBatch: (batch) => {
          set((state) => {
            const tempIdToRealId = new Map<string, string>();

            for (const { tempId, data } of batch.nodes) {
              const realId = crypto.randomUUID();
              tempIdToRealId.set(tempId, realId);
              const isEgo =
                data.attributes[variableConfig.egoVariable] === true;
              state.network.nodes.set(realId, {
                _uid: realId,
                type: variableConfig.nodeType,
                attributes: data.attributes,
              });
              state.nodeMetadata.set(realId, { readOnly: isEgo });
            }

            for (const edge of batch.edges) {
              const resolvedSource =
                tempIdToRealId.get(edge.source) ?? edge.source;
              const resolvedTarget =
                tempIdToRealId.get(edge.target) ?? edge.target;
              assertUniqueEdge(
                state.network.edges,
                resolvedSource,
                resolvedTarget,
                edge.data.attributes,
              );
              const edgeId = crypto.randomUUID();
              state.network.edges.set(edgeId, {
                _uid: edgeId,
                type: variableConfig.edgeType,
                from: resolvedSource,
                to: resolvedTarget,
                attributes: edge.data.attributes,
              });
            }
          });
        },

        syncMetadata: () => {
          const { nodes, edges } = get().network;

          const egoEntry = [...nodes.entries()].find(
            ([, n]) => n.attributes[variableConfig.egoVariable] === true,
          );
          const egoId = egoEntry?.[0];

          // framing ?? 'gamete': safe fallback — per spec §4.1, when framing is
          // null only the intro/chooser steps render and no gamete-parent labels exist.
          const computedLabels = egoId
            ? computeAllDisplayLabels(
                egoId,
                nodes,
                edges,
                variableConfig,
                get().framing ?? 'gamete',
              )
            : new Map<string, string>();

          const serializedNodes = [...nodes.entries()].map(([id, node]) => {
            const isEgo = node.attributes[variableConfig.egoVariable] === true;
            let label =
              (node.attributes[variableConfig.nodeLabelVariable] as string) ??
              '';

            if (!label && !isEgo) {
              label = computedLabels.get(id) ?? 'Family Member';
            }

            return {
              id,
              label,
              isEgo,
            };
          });

          const serializedEdges = [...edges.entries()].map(([id, edge]) => ({
            id,
            from: edge.from,
            to: edge.to,
            attributes: edge.attributes,
          }));

          dispatch?.(
            updateStageMetadata({
              currentStep: currentStep ?? 0,
              metadata: {
                isNetworkCommitted: true,
                nodes: serializedNodes,
                edges: serializedEdges,
              },
            }),
          );
        },

        finalizeNetwork: async () => {
          if (!dispatch) return;

          const { network, syncMetadata: sync } = get();

          const egoEntry = [...network.nodes.entries()].find(
            ([, n]) => n.attributes[variableConfig.egoVariable] === true,
          );
          const relationships = egoEntry
            ? computeRelationshipsToEgo(
                egoEntry[0],
                network.nodes,
                network.edges,
                variableConfig,
              )
            : new Map<string, string>();

          // Maps every store node id to its Redux id, so edges resolve their
          // endpoints regardless of whether each node was newly committed here
          // or already present from seeding.
          const idMap = new Map<string, string>();
          for (const preexistingId of preexistingReduxNodeIds) {
            if (network.nodes.has(preexistingId)) {
              idMap.set(preexistingId, preexistingId);
            }
          }

          // Only the nodes this finalize created. resetNetwork deletes these;
          // pre-existing shared-graph nodes must survive a pedigree reset.
          const createdReduxIds = new Map<string, string>();

          for (const [storeId, node] of network.nodes) {
            // Pre-existing same-type nodes already live in Redux; re-committing
            // them would duplicate the shared graph.
            if (preexistingReduxNodeIds.has(storeId)) {
              continue;
            }

            const relationship = relationships.get(storeId);
            const attributeData = {
              ...node.attributes,
              ...(relationship !== undefined
                ? { [variableConfig.relationshipVariable]: relationship }
                : {}),
            };

            const reduxId = crypto.randomUUID();
            const result = await dispatch(
              addNodeToNetwork({
                type: variableConfig.nodeType,
                attributeData,
                modelData: { _uid: reduxId },
                allowUnknownAttributes: true,
                currentStep: currentStep ?? 0,
              }),
            );

            if (addNodeToNetwork.fulfilled.match(result)) {
              idMap.set(storeId, reduxId);
              createdReduxIds.set(storeId, reduxId);
            }
          }

          for (const [edgeId, edge] of network.edges) {
            // Edges seeded from Redux already exist in the shared graph.
            if (preexistingReduxEdgeIds.has(edgeId)) {
              continue;
            }

            const mappedFrom = idMap.get(edge.from);
            const mappedTo = idMap.get(edge.to);
            if (mappedFrom && mappedTo) {
              await dispatch(
                addEdgeToNetwork({
                  type: variableConfig.edgeType,
                  from: mappedFrom,
                  to: mappedTo,
                  attributeData: { ...edge.attributes },
                  currentStep: currentStep ?? 0,
                }),
              );
            }
          }

          set((state) => {
            state.storeToReduxIdMap = new Map(createdReduxIds);
            for (const key of state.nodeMetadata.keys()) {
              const meta = state.nodeMetadata.get(key);
              if (meta) {
                meta.readOnly = true;
              }
            }
          });

          sync();
        },

        resetNetwork: () => {
          const { storeToReduxIdMap } = get();

          for (const reduxId of storeToReduxIdMap.values()) {
            dispatch?.(deleteNode(reduxId));
          }

          set((state) => {
            state.network.nodes.clear();
            state.network.edges.clear();
            state.nodeMetadata.clear();
            state.storeToReduxIdMap.clear();
            state.step = 'scaffolding';
            state.activeNominationVariable = null;
          });

          dispatch?.(
            updateStageMetadata({
              currentStep: currentStep ?? 0,
              metadata: { isNetworkCommitted: false },
            }),
          );
        },
      };
    }),
  );
};

export type FamilyPedigreeStoreApi = ReturnType<
  typeof createFamilyPedigreeStore
>;

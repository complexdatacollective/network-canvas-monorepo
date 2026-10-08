import { invariant } from 'es-toolkit';
import { v4 as uuid } from 'uuid';

import {
  type VariableValue,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import type { AttributePatch } from '../../store/entityAttributePatch';
import {
  addEdge,
  addNode,
  deleteEdge,
  deleteNode,
  type NodeAttributeSnapshot,
  restoreNode,
  restoreNodeAttributes,
  updateEdge,
  updateNode,
} from '../../store/modules/session';
import type { AppDispatch } from '../../store/store';
import type { UndoStoreApi } from './useUndoStore';

type Position = { x: number; y: number };

type UseComposerActionsArgs = {
  subjectType: string;
  quickAdd: string;
  layoutVariable: string;
  /** Whether the quick-add variable is marked encrypted in the codebook. */
  useEncryption: boolean;
  currentStep: number;
  undoStore: UndoStoreApi;
  dispatch: AppDispatch;
};

type ComposerActions = {
  createNodeAt: (name: string, position: Position) => Promise<string>;
  connect: (from: string, to: string, edgeType: string) => Promise<void>;
  deleteNodeById: (id: string) => void;
  deleteNodesById: (ids: string[]) => void;
  deleteEdgeById: (id: string) => void;
  updateNodeAttributes: (
    id: string,
    attributePatch: AttributePatch,
    coalesceKey?: string,
  ) => Promise<void>;
  updateEdgeAttributes: (
    id: string,
    attributePatch: AttributePatch,
    coalesceKey?: string,
  ) => Promise<void>;
  repositionNode: (
    id: string,
    position: Position,
    previous: Position,
  ) => Promise<void>;
  toggleGroupMembership: (
    id: string,
    variable: string,
    value: string,
  ) => Promise<void>;
  setGroupMembership: (
    ids: string[],
    variable: string,
    value: string,
    member: boolean,
  ) => Promise<void>;
};

// Node undo and redo put stored state back verbatim instead of replaying a
// write: an encrypted value can only be read with the IV and salt it was
// stored with, so a value and its secure-attribute metadata travel together.
function snapshotAttributes(
  node: NcNode | undefined,
  keys: readonly string[],
): NodeAttributeSnapshot {
  const attributes = node?.[entityAttributesProperty] ?? {};
  const secureAttributes = node?.[entitySecureAttributesMeta] ?? {};

  return Object.fromEntries(
    keys.map((key): [string, NodeAttributeSnapshot[string]] => {
      const value = Object.hasOwn(attributes, key) ? attributes[key] : null;
      if (value === null || value === undefined) return [key, null];
      const secure = Object.hasOwn(secureAttributes, key)
        ? secureAttributes[key]
        : undefined;
      return [key, secure ? { value, secure } : { value }];
    }),
  );
}

export function useComposerActions({
  subjectType,
  quickAdd,
  layoutVariable,
  useEncryption,
  currentStep,
  undoStore,
  dispatch,
}: UseComposerActionsArgs): ComposerActions {
  function readNode(id: string): NcNode | undefined {
    return dispatch((_, getState) =>
      getState().session.network.nodes.find(
        (n) => n[entityPrimaryKeyProperty] === id,
      ),
    );
  }

  function readIncidentEdges(ids: ReadonlySet<string>): NcEdge[] {
    return dispatch((_, getState) =>
      getState().session.network.edges.filter(
        (e) => ids.has(e.from) || ids.has(e.to),
      ),
    );
  }

  async function restoreEdges(edges: NcEdge[]): Promise<void> {
    for (const edge of edges) {
      await dispatch(
        addEdge({
          from: edge.from,
          to: edge.to,
          type: edge.type,
          attributeData: edge[entityAttributesProperty],
          currentStep,
        }),
      ).unwrap();
    }
  }

  async function createNodeAt(
    name: string,
    position: Position,
  ): Promise<string> {
    const id = uuid();

    await undoStore.getState().record(async () => {
      await dispatch(
        addNode({
          type: subjectType,
          attributeData: {
            [quickAdd]: name,
            [layoutVariable]: position,
          },
          modelData: { [entityPrimaryKeyProperty]: id },
          useEncryption,
          currentStep,
        }),
      ).unwrap();

      const created = readNode(id);
      invariant(created, 'The created node is missing from the network');

      return {
        label: `Add node`,
        undo: () => {
          dispatch(deleteNode(id));
        },
        redo: () => {
          dispatch(restoreNode(created));
        },
      };
    });

    return id;
  }

  async function connect(
    from: string,
    to: string,
    edgeType: string,
  ): Promise<void> {
    await undoStore.getState().record(async () => {
      const { edgeId } = await dispatch(
        addEdge({ from, to, type: edgeType, currentStep }),
      ).unwrap();

      let liveEdgeId = edgeId;

      return {
        label: `Connect nodes`,
        undo: () => {
          dispatch(deleteEdge(liveEdgeId));
        },
        redo: async () => {
          const { edgeId: newId } = await dispatch(
            addEdge({ from, to, type: edgeType, currentStep }),
          ).unwrap();
          liveEdgeId = newId;
        },
      };
    });
  }

  function deleteNodeById(id: string): void {
    // Capture the node and its incident edges before deleting: the reducer
    // cascades edge removal.
    const nodeSnapshot = readNode(id);
    const edgeSnapshots = readIncidentEdges(new Set([id]));

    dispatch(deleteNode(id));

    if (!nodeSnapshot) return;

    void undoStore.getState().push({
      label: `Delete node`,
      undo: async () => {
        dispatch(restoreNode(nodeSnapshot));
        await restoreEdges(edgeSnapshots);
      },
      redo: () => {
        dispatch(deleteNode(id));
      },
    });
  }

  function deleteNodesById(ids: string[]): void {
    if (ids.length === 0) return;

    // Capture every node and its incident edges before any deletion; an edge
    // joining two deleted nodes is captured once.
    const capturedNodes = ids.flatMap((id) => readNode(id) ?? []);
    const capturedEdges = readIncidentEdges(new Set(ids));

    // Delete all nodes (the reducer cascades incident edge removal).
    for (const id of ids) {
      dispatch(deleteNode(id));
    }

    void undoStore.getState().push({
      label: `Delete ${ids.length} nodes`,
      undo: async () => {
        for (const node of capturedNodes) {
          dispatch(restoreNode(node));
        }
        await restoreEdges(capturedEdges);
      },
      redo: () => {
        for (const node of capturedNodes) {
          dispatch(deleteNode(node[entityPrimaryKeyProperty]));
        }
      },
    });
  }

  function deleteEdgeById(id: string): void {
    let capturedEdge: NcEdge | undefined;

    dispatch((_, getState) => {
      const { session: sessionState } = getState() as {
        session: { network: { edges: NcEdge[] } };
      };
      capturedEdge = sessionState.network.edges.find(
        (e) => e[entityPrimaryKeyProperty] === id,
      );
    });

    dispatch(deleteEdge(id));

    if (!capturedEdge) return;

    const edgeSnapshot = capturedEdge;
    let liveEdgeId = edgeSnapshot[entityPrimaryKeyProperty];

    void undoStore.getState().push({
      label: `Delete edge`,
      undo: async () => {
        const { edgeId: newId } = await dispatch(
          addEdge({
            from: edgeSnapshot.from,
            to: edgeSnapshot.to,
            type: edgeSnapshot.type,
            attributeData: edgeSnapshot[entityAttributesProperty],
            currentStep,
          }),
        ).unwrap();
        liveEdgeId = newId;
      },
      redo: () => {
        dispatch(deleteEdge(liveEdgeId));
      },
    });
  }

  async function updateNodeAttributes(
    id: string,
    attributePatch: AttributePatch,
    coalesceKey?: string,
  ): Promise<void> {
    await undoStore.getState().record(async () => {
      const editedKeys = [
        ...new Set([
          ...Object.keys(attributePatch.set),
          ...attributePatch.unset,
        ]),
      ];
      const before = snapshotAttributes(readNode(id), editedKeys);

      await dispatch(
        updateNode({ nodeId: id, attributePatch, currentStep }),
      ).unwrap();

      const after = snapshotAttributes(readNode(id), editedKeys);

      return {
        label: `Update node attributes`,
        coalesceKey,
        undo: () => {
          dispatch(restoreNodeAttributes({ nodeId: id, snapshot: before }));
        },
        redo: () => {
          dispatch(restoreNodeAttributes({ nodeId: id, snapshot: after }));
        },
      };
    });
  }

  async function updateEdgeAttributes(
    id: string,
    attributePatch: AttributePatch,
    coalesceKey?: string,
  ): Promise<void> {
    await undoStore.getState().record(async () => {
      let priorAttributes: NcEdge[typeof entityAttributesProperty] = {};

      dispatch((_, getState) => {
        const { session: sessionState } = getState() as {
          session: { network: { edges: NcEdge[] } };
        };
        const edge = sessionState.network.edges.find(
          (e) => e[entityPrimaryKeyProperty] === id,
        );
        if (edge) {
          priorAttributes = edge[entityAttributesProperty];
        }
      });

      await dispatch(updateEdge({ edgeId: id, attributePatch })).unwrap();

      const editedKeys = [
        ...new Set([
          ...Object.keys(attributePatch.set),
          ...attributePatch.unset,
        ]),
      ];
      const inverseSet: Record<string, VariableValue> = {};
      const inverseUnset: string[] = [];

      for (const key of editedKeys) {
        const priorValue = priorAttributes[key];
        if (
          Object.hasOwn(priorAttributes, key) &&
          priorValue !== null &&
          priorValue !== undefined
        ) {
          inverseSet[key] = priorValue;
        } else {
          inverseUnset.push(key);
        }
      }

      const inversePatch: AttributePatch = {
        set: inverseSet,
        unset: inverseUnset,
      };

      return {
        label: `Update edge attributes`,
        coalesceKey,
        undo: async () => {
          await dispatch(
            updateEdge({ edgeId: id, attributePatch: inversePatch }),
          ).unwrap();
        },
        redo: async () => {
          await dispatch(updateEdge({ edgeId: id, attributePatch })).unwrap();
        },
      };
    });
  }

  async function repositionNode(
    id: string,
    position: Position,
    previous: Position,
  ): Promise<void> {
    await undoStore.getState().record(async () => {
      await dispatch(
        updateNode({
          nodeId: id,
          attributePatch: {
            set: { [layoutVariable]: position },
            unset: [],
          },
          currentStep,
        }),
      ).unwrap();

      return {
        label: `Move node`,
        undo: async () => {
          await dispatch(
            updateNode({
              nodeId: id,
              attributePatch: {
                set: { [layoutVariable]: previous },
                unset: [],
              },
              currentStep,
            }),
          ).unwrap();
        },
        redo: async () => {
          await dispatch(
            updateNode({
              nodeId: id,
              attributePatch: {
                set: { [layoutVariable]: position },
                unset: [],
              },
              currentStep,
            }),
          ).unwrap();
        },
      };
    });
  }

  // Categorical group membership is stored as an array of string values (a node
  // can belong to several groups of the same variable). Normalise any prior
  // value (array / scalar / null) into that shape.
  function normalizeGroupValues(raw: unknown): string[] {
    if (raw == null) return [];
    return (Array.isArray(raw) ? raw : [raw])
      .filter(
        (value): value is string | number =>
          typeof value === 'string' || typeof value === 'number',
      )
      .map(String);
  }

  type GroupValuesSnapshot = {
    values: string[];
    present: boolean;
  };

  function readGroupValues(id: string, variable: string): GroupValuesSnapshot {
    let snapshot: GroupValuesSnapshot = { values: [], present: false };
    dispatch((_, getState) => {
      const { session: sessionState } = getState() as {
        session: { network: { nodes: NcNode[] } };
      };
      const node = sessionState.network.nodes.find(
        (n) => n[entityPrimaryKeyProperty] === id,
      );
      if (node) {
        const attributes = node[entityAttributesProperty];
        const raw = attributes[variable];
        snapshot = {
          values: normalizeGroupValues(raw),
          present:
            Object.hasOwn(attributes, variable) &&
            raw !== null &&
            raw !== undefined,
        };
      }
    });
    return snapshot;
  }

  async function toggleGroupMembership(
    id: string,
    variable: string,
    value: string,
  ): Promise<void> {
    await undoStore.getState().record(async () => {
      const prior = readGroupValues(id, variable);
      const next = prior.values.includes(value)
        ? prior.values.filter((v) => v !== value)
        : [...prior.values, value];

      await dispatch(
        updateNode({
          nodeId: id,
          attributePatch: { set: { [variable]: next }, unset: [] },
          currentStep,
        }),
      ).unwrap();

      return {
        label: `Toggle group membership`,
        undo: async () => {
          await dispatch(
            updateNode({
              nodeId: id,
              attributePatch: prior.present
                ? { set: { [variable]: prior.values }, unset: [] }
                : { set: {}, unset: [variable] },
              currentStep,
            }),
          ).unwrap();
        },
        redo: async () => {
          await dispatch(
            updateNode({
              nodeId: id,
              attributePatch: { set: { [variable]: next }, unset: [] },
              currentStep,
            }),
          ).unwrap();
        },
      };
    });
  }

  async function setGroupMembership(
    ids: string[],
    variable: string,
    value: string,
    member: boolean,
  ): Promise<void> {
    await undoStore.getState().record(async () => {
      const changes: {
        id: string;
        prior: GroupValuesSnapshot;
        next: string[];
      }[] = [];
      for (const id of ids) {
        const prior = readGroupValues(id, variable);
        if (prior.values.includes(value) === member) continue;
        changes.push({
          id,
          prior,
          next: member
            ? [...prior.values, value]
            : prior.values.filter((groupValue) => groupValue !== value),
        });
      }

      if (changes.length === 0) return null;

      for (const { id, next } of changes) {
        await dispatch(
          updateNode({
            nodeId: id,
            attributePatch: { set: { [variable]: next }, unset: [] },
            currentStep,
          }),
        ).unwrap();
      }

      return {
        label: `${member ? 'Add' : 'Remove'} ${changes.length} ${member ? 'to' : 'from'} group`,
        undo: async () => {
          for (const { id, prior } of changes) {
            await dispatch(
              updateNode({
                nodeId: id,
                attributePatch: prior.present
                  ? { set: { [variable]: prior.values }, unset: [] }
                  : { set: {}, unset: [variable] },
                currentStep,
              }),
            ).unwrap();
          }
        },
        redo: async () => {
          for (const { id, next } of changes) {
            await dispatch(
              updateNode({
                nodeId: id,
                attributePatch: { set: { [variable]: next }, unset: [] },
                currentStep,
              }),
            ).unwrap();
          }
        },
      };
    });
  }

  return {
    createNodeAt,
    connect,
    deleteNodeById,
    deleteNodesById,
    deleteEdgeById,
    updateNodeAttributes,
    updateEdgeAttributes,
    repositionNode,
    toggleGroupMembership,
    setGroupMembership,
  };
}

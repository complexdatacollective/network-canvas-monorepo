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
import { isPosition } from './gridPlacement';
import type { UndoCommand, UndoStoreApi } from './useUndoStore';

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

// Every change is made in the undo store's queue, so it can be made later
// than it was asked for. Whatever it depends on is therefore read when it is
// made, not when it is asked for.

/**
 * Where a new person goes, or how to choose it from where the people already
 * on the stage are when the person is added.
 */
type Placement = Position | ((occupied: Position[]) => Position);

/**
 * The patch to save, or how to build it when the save is made, after every
 * change, undo and redo asked for before it. Building null saves nothing.
 */
type PatchToSave = AttributePatch | (() => AttributePatch | null);

const buildPatch = (patchToSave: PatchToSave) =>
  typeof patchToSave === 'function' ? patchToSave() : patchToSave;

type ComposerActions = {
  createNodeAt: (name: string, placement: Placement) => Promise<string>;
  /**
   * Connects two people with a relationship of `edgeType`, or removes the one
   * they already have.
   */
  toggleEdge: (from: string, to: string, edgeType: string) => Promise<void>;
  deleteNodeById: (id: string) => Promise<void>;
  deleteNodesById: (ids: string[]) => Promise<void>;
  deleteEdgeById: (id: string) => Promise<void>;
  updateNodeAttributes: (
    id: string,
    attributePatch: PatchToSave,
    coalesceKey?: string,
  ) => Promise<void>;
  updateEdgeAttributes: (
    id: string,
    attributePatch: PatchToSave,
    coalesceKey?: string,
  ) => Promise<void>;
  /**
   * Moves a person. The move can be undone when they had a position before
   * it; a person the automatic layout placed has none of their own yet.
   */
  repositionNode: (id: string, position: Position) => Promise<void>;
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

  function readOccupiedPositions(): Position[] {
    return dispatch((_, getState) =>
      getState()
        .session.network.nodes.filter((n) => n.type === subjectType)
        .map((n) => n[entityAttributesProperty][layoutVariable])
        .filter(isPosition),
    );
  }

  function readEdges(): NcEdge[] {
    return dispatch((_, getState) => getState().session.network.edges);
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
    placement: Placement,
  ): Promise<string> {
    const id = uuid();

    await undoStore.getState().record(async () => {
      const position =
        typeof placement === 'function'
          ? placement(readOccupiedPositions())
          : placement;
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
  ): Promise<UndoCommand> {
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
  }

  function removeEdge(edgeSnapshot: NcEdge): UndoCommand {
    let liveEdgeId = edgeSnapshot[entityPrimaryKeyProperty];
    dispatch(deleteEdge(liveEdgeId));

    return {
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
    };
  }

  async function toggleEdge(
    from: string,
    to: string,
    edgeType: string,
  ): Promise<void> {
    await undoStore.getState().record(async () => {
      const existing = readEdges().find(
        (e) =>
          e.type === edgeType &&
          ((e.from === from && e.to === to) ||
            (e.from === to && e.to === from)),
      );
      return existing ? removeEdge(existing) : connect(from, to, edgeType);
    });
  }

  async function deleteNodeById(id: string): Promise<void> {
    await undoStore.getState().record(async () => {
      // Capture the node and its incident edges before deleting: the reducer
      // cascades edge removal.
      const nodeSnapshot = readNode(id);
      const edgeSnapshots = readIncidentEdges(new Set([id]));

      dispatch(deleteNode(id));

      if (!nodeSnapshot) return null;

      return {
        label: `Delete node`,
        undo: async () => {
          dispatch(restoreNode(nodeSnapshot));
          await restoreEdges(edgeSnapshots);
        },
        redo: () => {
          dispatch(deleteNode(id));
        },
      };
    });
  }

  async function deleteNodesById(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await undoStore.getState().record(async () => {
      // Capture every node and its incident edges before any deletion; an
      // edge joining two deleted nodes is captured once.
      const capturedNodes = ids.flatMap((id) => readNode(id) ?? []);
      const capturedEdges = readIncidentEdges(new Set(ids));

      // Delete all nodes (the reducer cascades incident edge removal).
      for (const id of ids) {
        dispatch(deleteNode(id));
      }

      return {
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
      };
    });
  }

  async function deleteEdgeById(id: string): Promise<void> {
    await undoStore.getState().record(async () => {
      const edge = readEdges().find((e) => e[entityPrimaryKeyProperty] === id);
      return edge ? removeEdge(edge) : null;
    });
  }

  async function updateNodeAttributes(
    id: string,
    patchToSave: PatchToSave,
    coalesceKey?: string,
  ): Promise<void> {
    await undoStore.getState().record(async () => {
      const attributePatch = buildPatch(patchToSave);
      if (attributePatch === null) return null;

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
    patchToSave: PatchToSave,
    coalesceKey?: string,
  ): Promise<void> {
    await undoStore.getState().record(async () => {
      const attributePatch = buildPatch(patchToSave);
      if (attributePatch === null) return null;

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

  async function repositionNode(id: string, position: Position): Promise<void> {
    await undoStore.getState().record(async () => {
      const prior = readNode(id)?.[entityAttributesProperty][layoutVariable];
      const previous = isPosition(prior) ? prior : null;

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

      if (previous === null) return null;

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
    toggleEdge,
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

import { v4 as uuid } from 'uuid';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';
import {
  addEdge,
  addNode,
  deleteEdge,
  deleteNode,
  updateEdge,
  updateNode,
} from '~/store/modules/session';
import type { AppDispatch } from '~/store/store';

import type { UndoStoreApi } from './useUndoStore';

type Position = { x: number; y: number };

type UseComposerActionsArgs = {
  subjectType: string;
  quickAdd: string;
  layoutVariable: string;
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
    data: NcNode[typeof entityAttributesProperty],
    coalesceKey?: string,
  ) => Promise<void>;
  updateEdgeAttributes: (
    id: string,
    data: NcEdge[typeof entityAttributesProperty],
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
  addGroupMembership: (
    ids: string[],
    variable: string,
    value: string,
  ) => Promise<void>;
};

export function useComposerActions({
  subjectType,
  quickAdd,
  layoutVariable,
  currentStep,
  undoStore,
  dispatch,
}: UseComposerActionsArgs): ComposerActions {
  async function createNodeAt(
    name: string,
    position: Position,
  ): Promise<string> {
    const id = uuid();

    await dispatch(
      addNode({
        type: subjectType,
        attributeData: {
          [quickAdd]: name,
          [layoutVariable]: position,
        },
        modelData: { [entityPrimaryKeyProperty]: id },
        currentStep,
      }),
    ).unwrap();

    void undoStore.getState().push({
      label: `Add node ${name}`,
      undo: () => {
        dispatch(deleteNode(id));
      },
      redo: async () => {
        await dispatch(
          addNode({
            type: subjectType,
            attributeData: {
              [quickAdd]: name,
              [layoutVariable]: position,
            },
            modelData: { [entityPrimaryKeyProperty]: id },
            currentStep,
          }),
        ).unwrap();
      },
    });

    return id;
  }

  async function connect(
    from: string,
    to: string,
    edgeType: string,
  ): Promise<void> {
    const { edgeId } = await dispatch(
      addEdge({ from, to, type: edgeType, currentStep }),
    ).unwrap();

    let liveEdgeId = edgeId;

    void undoStore.getState().push({
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
    });
  }

  function deleteNodeById(id: string): void {
    // Capture node and incident edges BEFORE dispatching delete
    // (the reducer cascades edge removal)
    // We read from the store at call time via dispatch's getState-equivalent:
    // However dispatch doesn't expose getState. We capture from the action result.
    // Use a closure over a pre-captured snapshot — call sites must pass in the
    // network state if needed. Instead, we capture via a selector pattern:
    // Since we cannot call getState directly from this hook, we store snapshots
    // inline. The store IS accessible via dispatch's async thunk, but for plain
    // sync capture we use a thunk-style approach.

    let capturedNode: NcNode | undefined;
    let capturedEdges: NcEdge[] = [];

    // Dispatch a sync thunk that captures state before deletion
    dispatch((_, getState) => {
      const { session: sessionState } = getState() as {
        session: { network: { nodes: NcNode[]; edges: NcEdge[] } };
      };
      capturedNode = sessionState.network.nodes.find(
        (n) => n[entityPrimaryKeyProperty] === id,
      );
      capturedEdges = sessionState.network.edges.filter(
        (e) => e.from === id || e.to === id,
      );
    });

    dispatch(deleteNode(id));

    if (!capturedNode) return;

    const nodeSnapshot = capturedNode;
    const edgeSnapshots = capturedEdges;

    void undoStore.getState().push({
      label: `Delete node`,
      undo: async () => {
        await dispatch(
          addNode({
            type: nodeSnapshot.type,
            attributeData: nodeSnapshot[entityAttributesProperty],
            modelData: {
              [entityPrimaryKeyProperty]:
                nodeSnapshot[entityPrimaryKeyProperty],
            },
            currentStep,
          }),
        ).unwrap();

        for (const edge of edgeSnapshots) {
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
      },
      redo: () => {
        dispatch(deleteNode(nodeSnapshot[entityPrimaryKeyProperty]));
      },
    });
  }

  function deleteNodesById(ids: string[]): void {
    if (ids.length === 0) return;

    // Capture ALL nodes and their incident edges BEFORE any deletion.
    const capturedNodes: NcNode[] = [];
    const capturedEdges: NcEdge[] = [];

    dispatch((_, getState) => {
      const { session: sessionState } = getState() as {
        session: { network: { nodes: NcNode[]; edges: NcEdge[] } };
      };
      const idSet = new Set(ids);

      for (const node of sessionState.network.nodes) {
        if (idSet.has(node[entityPrimaryKeyProperty])) {
          capturedNodes.push(node);
        }
      }

      // Collect incident edges, deduplicating edges that connect two deleted nodes.
      const seenEdgeIds = new Set<string>();
      for (const edge of sessionState.network.edges) {
        if (
          (idSet.has(edge.from) || idSet.has(edge.to)) &&
          !seenEdgeIds.has(edge[entityPrimaryKeyProperty])
        ) {
          seenEdgeIds.add(edge[entityPrimaryKeyProperty]);
          capturedEdges.push(edge);
        }
      }
    });

    // Delete all nodes (the reducer cascades incident edge removal).
    for (const id of ids) {
      dispatch(deleteNode(id));
    }

    void undoStore.getState().push({
      label: `Delete ${ids.length} nodes`,
      undo: async () => {
        for (const node of capturedNodes) {
          await dispatch(
            addNode({
              type: node.type,
              attributeData: node[entityAttributesProperty],
              modelData: {
                [entityPrimaryKeyProperty]: node[entityPrimaryKeyProperty],
              },
              currentStep,
            }),
          ).unwrap();
        }
        for (const edge of capturedEdges) {
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
    data: NcNode[typeof entityAttributesProperty],
    coalesceKey?: string,
  ): Promise<void> {
    let priorAttributes: NcNode[typeof entityAttributesProperty] = {};

    dispatch((_, getState) => {
      const { session: sessionState } = getState() as {
        session: { network: { nodes: NcNode[] } };
      };
      const node = sessionState.network.nodes.find(
        (n) => n[entityPrimaryKeyProperty] === id,
      );
      if (node) {
        priorAttributes = node[entityAttributesProperty];
      }
    });

    await dispatch(
      updateNode({ nodeId: id, newAttributeData: data, currentStep }),
    ).unwrap();

    // Scope undo to edited keys so a coalesced autosave undo can't clobber
    // unrelated attributes changed while the drawer was open.
    const editedKeys = new Set(Object.keys(data));
    const capturedPrior: NcNode[typeof entityAttributesProperty] =
      Object.fromEntries(
        Object.entries(priorAttributes).filter(([key]) => editedKeys.has(key)),
      );

    void undoStore.getState().push({
      label: `Update node attributes`,
      coalesceKey,
      undo: async () => {
        await dispatch(
          updateNode({
            nodeId: id,
            newAttributeData: capturedPrior,
            currentStep,
          }),
        ).unwrap();
      },
      redo: async () => {
        await dispatch(
          updateNode({ nodeId: id, newAttributeData: data, currentStep }),
        ).unwrap();
      },
    });
  }

  async function updateEdgeAttributes(
    id: string,
    data: NcEdge[typeof entityAttributesProperty],
    coalesceKey?: string,
  ): Promise<void> {
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

    await dispatch(updateEdge({ edgeId: id, newAttributeData: data })).unwrap();

    // Scope undo to edited keys so a coalesced autosave undo can't clobber
    // unrelated attributes changed while the drawer was open.
    const editedKeys = new Set(Object.keys(data));
    const capturedPrior: NcEdge[typeof entityAttributesProperty] =
      Object.fromEntries(
        Object.entries(priorAttributes).filter(([key]) => editedKeys.has(key)),
      );

    void undoStore.getState().push({
      label: `Update edge attributes`,
      coalesceKey,
      undo: async () => {
        await dispatch(
          updateEdge({ edgeId: id, newAttributeData: capturedPrior }),
        ).unwrap();
      },
      redo: async () => {
        await dispatch(
          updateEdge({ edgeId: id, newAttributeData: data }),
        ).unwrap();
      },
    });
  }

  async function repositionNode(
    id: string,
    position: Position,
    previous: Position,
  ): Promise<void> {
    await dispatch(
      updateNode({
        nodeId: id,
        newAttributeData: { [layoutVariable]: position },
        currentStep,
      }),
    ).unwrap();

    void undoStore.getState().push({
      label: `Move node`,
      undo: async () => {
        await dispatch(
          updateNode({
            nodeId: id,
            newAttributeData: { [layoutVariable]: previous },
            currentStep,
          }),
        ).unwrap();
      },
      redo: async () => {
        await dispatch(
          updateNode({
            nodeId: id,
            newAttributeData: { [layoutVariable]: position },
            currentStep,
          }),
        ).unwrap();
      },
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

  function readGroupValues(id: string, variable: string): string[] {
    let values: string[] = [];
    dispatch((_, getState) => {
      const { session: sessionState } = getState() as {
        session: { network: { nodes: NcNode[] } };
      };
      const node = sessionState.network.nodes.find(
        (n) => n[entityPrimaryKeyProperty] === id,
      );
      if (node) {
        values = normalizeGroupValues(node[entityAttributesProperty][variable]);
      }
    });
    return values;
  }

  async function writeGroupValues(
    id: string,
    variable: string,
    prior: string[],
    next: string[],
    label: string,
  ): Promise<void> {
    await dispatch(
      updateNode({
        nodeId: id,
        newAttributeData: { [variable]: next },
        currentStep,
      }),
    ).unwrap();

    void undoStore.getState().push({
      label,
      undo: async () => {
        await dispatch(
          updateNode({
            nodeId: id,
            newAttributeData: { [variable]: prior },
            currentStep,
          }),
        ).unwrap();
      },
      redo: async () => {
        await dispatch(
          updateNode({
            nodeId: id,
            newAttributeData: { [variable]: next },
            currentStep,
          }),
        ).unwrap();
      },
    });
  }

  async function toggleGroupMembership(
    id: string,
    variable: string,
    value: string,
  ): Promise<void> {
    const prior = readGroupValues(id, variable);
    const next = prior.includes(value)
      ? prior.filter((v) => v !== value)
      : [...prior, value];
    await writeGroupValues(
      id,
      variable,
      prior,
      next,
      `Toggle group membership`,
    );
  }

  async function addGroupMembership(
    ids: string[],
    variable: string,
    value: string,
  ): Promise<void> {
    // Add the value to every node that doesn't already have it, as one undo step.
    const changes: { id: string; prior: string[]; next: string[] }[] = [];
    for (const id of ids) {
      const prior = readGroupValues(id, variable);
      if (prior.includes(value)) continue;
      changes.push({ id, prior, next: [...prior, value] });
    }

    if (changes.length === 0) return;

    for (const { id, next } of changes) {
      await dispatch(
        updateNode({
          nodeId: id,
          newAttributeData: { [variable]: next },
          currentStep,
        }),
      ).unwrap();
    }

    void undoStore.getState().push({
      label: `Add ${changes.length} to group`,
      undo: async () => {
        for (const { id, prior } of changes) {
          await dispatch(
            updateNode({
              nodeId: id,
              newAttributeData: { [variable]: prior },
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
              newAttributeData: { [variable]: next },
              currentStep,
            }),
          ).unwrap();
        }
      },
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
    addGroupMembership,
  };
}

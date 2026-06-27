'use client';

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
  connectAll: (nodeIds: string[], edgeType: string) => Promise<void>;
  deleteNodeById: (id: string) => void;
  deleteEdgeById: (id: string) => void;
  updateNodeAttributes: (
    id: string,
    data: NcNode[typeof entityAttributesProperty],
  ) => Promise<void>;
  updateEdgeAttributes: (
    id: string,
    data: NcEdge[typeof entityAttributesProperty],
  ) => Promise<void>;
  repositionNode: (
    id: string,
    position: Position,
    previous: Position,
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

    undoStore.getState().push({
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

    undoStore.getState().push({
      label: `Connect nodes`,
      undo: () => {
        dispatch(deleteEdge(edgeId));
      },
      redo: async () => {
        await dispatch(
          addEdge({ from, to, type: edgeType, currentStep }),
        ).unwrap();
      },
    });
  }

  async function connectAll(
    nodeIds: string[],
    edgeType: string,
  ): Promise<void> {
    const addedEdgeIds: string[] = [];
    const addedEdgePairs: { from: string; to: string }[] = [];

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const from = nodeIds[i]!;
        const to = nodeIds[j]!;

        const { edgeId } = await dispatch(
          addEdge({ from, to, type: edgeType, currentStep }),
        ).unwrap();

        addedEdgeIds.push(edgeId);
        addedEdgePairs.push({ from, to });
      }
    }

    undoStore.getState().push({
      label: `Connect all nodes`,
      undo: () => {
        for (const edgeId of addedEdgeIds) {
          dispatch(deleteEdge(edgeId));
        }
      },
      redo: async () => {
        addedEdgeIds.length = 0;
        for (const { from, to } of addedEdgePairs) {
          const { edgeId } = await dispatch(
            addEdge({ from, to, type: edgeType, currentStep }),
          ).unwrap();
          addedEdgeIds.push(edgeId);
        }
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

    undoStore.getState().push({
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

    undoStore.getState().push({
      label: `Delete edge`,
      undo: async () => {
        await dispatch(
          addEdge({
            from: edgeSnapshot.from,
            to: edgeSnapshot.to,
            type: edgeSnapshot.type,
            currentStep,
          }),
        ).unwrap();
      },
      redo: () => {
        dispatch(deleteEdge(edgeSnapshot[entityPrimaryKeyProperty]));
      },
    });
  }

  async function updateNodeAttributes(
    id: string,
    data: NcNode[typeof entityAttributesProperty],
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

    const capturedPrior = priorAttributes;

    undoStore.getState().push({
      label: `Update node attributes`,
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

    const capturedPrior = priorAttributes;

    undoStore.getState().push({
      label: `Update edge attributes`,
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

    undoStore.getState().push({
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

  return {
    createNodeAt,
    connect,
    connectAll,
    deleteNodeById,
    deleteEdgeById,
    updateNodeAttributes,
    updateEdgeAttributes,
    repositionNode,
  };
}

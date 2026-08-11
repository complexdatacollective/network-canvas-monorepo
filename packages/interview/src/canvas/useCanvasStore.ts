import { clamp } from 'es-toolkit';
import { createStore, useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { updateNode } from '../store/modules/session';
import type { AppDispatch } from '../store/store';
import { edgeInsetForNode, FALLBACK_NODE_RADIUS } from './layoutGeometry';

type Position = { x: number; y: number };
type CanvasDimensions = { width: number; height: number };

type CanvasState = {
  positions: Map<string, Position>;
  selectedNodeId: string | null;
  canvasDimensions: CanvasDimensions | null;
  // Rendered node radius (px) the boundary clamp insets by. Starts at
  // FALLBACK_NODE_RADIUS and is corrected via setNodeRadius once
  // `useNodeMeasurement` reports the live size (useAutoLayout pushes it), so
  // the clamp tracks the real radius — which varies with the Shell's viewport
  // ramp and the participant text-size control — instead of clipping larger
  // nodes against a fixed inset.
  nodeRadius: number;
};

type CanvasActions = {
  setPosition: (nodeId: string, position: Position) => void;
  setBatchPositions: (entries: [string, Position][]) => void;
  setCanvasDimensions: (dimensions: CanvasDimensions) => void;
  setNodeRadius: (radius: number) => void;
  syncFromNodes: (nodes: NcNode[], layoutVariable: string) => void;
  syncNewFromNodes: (nodes: NcNode[], layoutVariable: string) => void;
  selectNode: (nodeId: string | null) => void;
  syncToRedux: (
    dispatch: AppDispatch,
    layoutVariable: string,
    currentStep: number,
  ) => void;
};

type CanvasStore = CanvasState & CanvasActions;

const clampPosition = (
  pos: Position,
  dimensions: CanvasDimensions | null,
  nodeRadius: number,
): Position => {
  if (!dimensions || dimensions.width === 0 || dimensions.height === 0) {
    return { x: clamp(pos.x, 0, 1), y: clamp(pos.y, 0, 1) };
  }

  const inset = edgeInsetForNode(nodeRadius);
  const marginX = Math.min(inset / dimensions.width, 0.5);
  const marginY = Math.min(inset / dimensions.height, 0.5);

  return {
    x: clamp(pos.x, marginX, 1 - marginX),
    y: clamp(pos.y, marginY, 1 - marginY),
  };
};

export const createCanvasStore = () =>
  createStore<CanvasStore>()(
    subscribeWithSelector((set, get) => ({
      positions: new Map(),
      selectedNodeId: null,
      canvasDimensions: null,
      nodeRadius: FALLBACK_NODE_RADIUS,

      setPosition: (nodeId, position) => {
        set((state) => {
          const next = new Map(state.positions);
          next.set(
            nodeId,
            clampPosition(position, state.canvasDimensions, state.nodeRadius),
          );
          return { positions: next };
        });
      },

      setBatchPositions: (entries) => {
        set((state) => {
          const next = new Map(state.positions);
          for (const [nodeId, position] of entries) {
            next.set(
              nodeId,
              clampPosition(position, state.canvasDimensions, state.nodeRadius),
            );
          }
          return { positions: next };
        });
      },

      setCanvasDimensions: (dimensions) => {
        set((state) => {
          const next = new Map<string, Position>();
          for (const [nodeId, pos] of state.positions) {
            next.set(nodeId, clampPosition(pos, dimensions, state.nodeRadius));
          }
          return { canvasDimensions: dimensions, positions: next };
        });
      },

      setNodeRadius: (radius) => {
        // <= 0 (unmeasured) falls back so the clamp always has a usable inset.
        const resolved = radius > 0 ? radius : FALLBACK_NODE_RADIUS;
        if (resolved === get().nodeRadius) return;
        set((state) => {
          const next = new Map<string, Position>();
          for (const [nodeId, pos] of state.positions) {
            next.set(
              nodeId,
              clampPosition(pos, state.canvasDimensions, resolved),
            );
          }
          return { nodeRadius: resolved, positions: next };
        });
      },

      syncFromNodes: (nodes, layoutVariable) => {
        const { canvasDimensions: dims, nodeRadius } = get();
        const next = new Map<string, Position>();
        for (const node of nodes) {
          const attrs = node[entityAttributesProperty];
          const layoutValue = attrs[layoutVariable] as
            | Position
            | null
            | undefined;
          if (
            layoutValue &&
            typeof layoutValue.x === 'number' &&
            typeof layoutValue.y === 'number'
          ) {
            next.set(
              node[entityPrimaryKeyProperty],
              clampPosition(layoutValue, dims, nodeRadius),
            );
          }
        }
        set({ positions: next });
      },

      // Only add positions for new nodes and remove stale ones.
      // Preserves existing positions managed by the force simulation.
      syncNewFromNodes: (nodes, layoutVariable) => {
        set((state) => {
          const next = new Map(state.positions);
          const currentNodeIds = new Set(
            nodes.map((n) => n[entityPrimaryKeyProperty]),
          );

          for (const nodeId of next.keys()) {
            if (!currentNodeIds.has(nodeId)) {
              next.delete(nodeId);
            }
          }

          for (const node of nodes) {
            const nodeId = node[entityPrimaryKeyProperty];
            if (!next.has(nodeId)) {
              const attrs = node[entityAttributesProperty];
              const layoutValue = attrs[layoutVariable] as
                | Position
                | null
                | undefined;
              if (
                layoutValue &&
                typeof layoutValue.x === 'number' &&
                typeof layoutValue.y === 'number'
              ) {
                next.set(
                  nodeId,
                  clampPosition(
                    layoutValue,
                    state.canvasDimensions,
                    state.nodeRadius,
                  ),
                );
              }
            }
          }

          return { positions: next };
        });
      },

      selectNode: (nodeId) => {
        set({ selectedNodeId: nodeId });
      },

      syncToRedux: (dispatch, layoutVariable, currentStep) => {
        const { positions } = get();
        for (const [nodeId, position] of positions) {
          void dispatch(
            updateNode({
              nodeId,
              newAttributeData: {
                [layoutVariable]: { x: position.x, y: position.y },
              },
              currentStep,
            }),
          );
        }
      },
    })),
  );

export type CanvasStoreApi = ReturnType<typeof createCanvasStore>;

export function useCanvasStore<T>(
  store: CanvasStoreApi,
  selector: (state: CanvasStore) => T,
): T {
  return useStore(store, selector);
}

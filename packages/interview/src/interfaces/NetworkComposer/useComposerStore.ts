import { createStore, useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type ComposerTool =
  | { kind: 'select' }
  | { kind: 'addNode' }
  | { kind: 'edge'; edgeType: string }
  // Convex-hull group membership: one categorical `variable` is active, and
  // tapping a node toggles its membership in `value` (a value of that variable).
  | { kind: 'group'; variable: string; value: string };

type Point = { x: number; y: number };

type ComposerState = {
  activeTool: ComposerTool;
  selectedNodeIds: ReadonlySet<string>;
  selectedEdgeId: string | null;
  pendingEdgeSource: string | null;
  lassoPoints: Point[] | null;
};

type ComposerActions = {
  setActiveTool: (tool: ComposerTool) => void;
  selectOnlyNode: (id: string) => void;
  toggleNodeInSelection: (id: string) => void;
  selectNodes: (ids: string[]) => void;
  clearSelection: () => void;
  selectEdge: (id: string) => void;
  setPendingEdgeSource: (id: string | null) => void;
  startLasso: () => void;
  addLassoPoint: (point: Point) => void;
  endLasso: () => void;
};

export type ComposerStore = ComposerState & ComposerActions;

export const createComposerStore = () =>
  createStore<ComposerStore>()(
    subscribeWithSelector((set) => ({
      activeTool: { kind: 'select' },
      selectedNodeIds: new Set<string>(),
      selectedEdgeId: null,
      pendingEdgeSource: null,
      lassoPoints: null,

      setActiveTool: (tool) =>
        set({
          activeTool: tool,
          selectedNodeIds: new Set<string>(),
          selectedEdgeId: null,
          pendingEdgeSource: null,
        }),

      selectOnlyNode: (id) =>
        set({ selectedNodeIds: new Set([id]), selectedEdgeId: null }),

      toggleNodeInSelection: (id) =>
        set((state) => {
          const next = new Set(state.selectedNodeIds);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return { selectedNodeIds: next, selectedEdgeId: null };
        }),

      selectNodes: (ids) =>
        set({ selectedNodeIds: new Set(ids), selectedEdgeId: null }),

      clearSelection: () =>
        set({ selectedNodeIds: new Set<string>(), selectedEdgeId: null }),

      selectEdge: (id) =>
        set({ selectedEdgeId: id, selectedNodeIds: new Set<string>() }),

      setPendingEdgeSource: (id) => set({ pendingEdgeSource: id }),

      startLasso: () => set({ lassoPoints: [] }),

      addLassoPoint: (point) =>
        set((state) => ({
          lassoPoints: [...(state.lassoPoints ?? []), point],
        })),

      endLasso: () => set({ lassoPoints: null }),
    })),
  );

export type ComposerStoreApi = ReturnType<typeof createComposerStore>;

export function useComposerStore<T>(
  store: ComposerStoreApi,
  selector: (state: ComposerStore) => T,
): T {
  return useStore(store, selector);
}

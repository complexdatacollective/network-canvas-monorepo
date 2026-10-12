'use client';

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

/**
 * Whether the Inspector holding a draft may close: true at once when there is
 * nothing to save or ask about, otherwise once the draft is saved or the
 * participant agrees to discard it.
 */
export type LeaveGuard = () => true | Promise<boolean>;

type ComposerState = {
  activeTool: ComposerTool;
  selectedNodeIds: ReadonlySet<string>;
  selectedEdgeId: string | null;
  pendingEdgeSource: string | null;
  lassoPoints: Point[] | null;
};

type SelectionChange = Partial<ComposerState> &
  Pick<ComposerState, 'selectedNodeIds' | 'selectedEdgeId'>;

type ComposerActions = {
  setActiveTool: (tool: ComposerTool) => void;
  selectOnlyNode: (id: string) => void;
  toggleNodeInSelection: (id: string) => void;
  selectNodes: (ids: string[]) => void;
  clearSelection: () => void;
  /**
   * Clears the selection once its entities are deleted. A draft of a deleted
   * entity goes with it, so the participant is not asked about it.
   */
  deselectDeleted: () => void;
  selectEdge: (id: string) => void;
  /**
   * Holds the selection on `entityId` while its Inspector has a draft: a
   * change that would close that Inspector waits for `confirmLeave`, and is
   * dropped if it refuses. Returns the function that releases the hold.
   */
  guardDraft: (entityId: string, confirmLeave: LeaveGuard) => () => void;
  setPendingEdgeSource: (id: string | null) => void;
  startLasso: () => void;
  addLassoPoint: (point: Point) => void;
  endLasso: () => void;
};

export type ComposerStore = ComposerState & ComposerActions;

export const createComposerStore = () => {
  let draft: { entityId: string; confirmLeave: LeaveGuard } | null = null;
  // A change made while the participant is asked about the draft replaces
  // the one waiting, so they are never asked twice.
  let waiting: { change: SelectionChange } | null = null;

  return createStore<ComposerStore>()(
    subscribeWithSelector((set, get) => {
      const changeSelection = (change: SelectionChange) => {
        if (waiting) {
          waiting.change = change;
          return;
        }
        const held = draft;
        const keepsDraft =
          held === null ||
          (change.selectedEdgeId === null
            ? change.selectedNodeIds.size === 1 &&
              change.selectedNodeIds.has(held.entityId)
            : change.selectedEdgeId === held.entityId);
        if (keepsDraft) {
          set(change);
          return;
        }
        const allowed = held.confirmLeave();
        if (allowed === true) {
          set(change);
          return;
        }
        // Deleting the entity ends this wait, and the answer to it then
        // decides nothing, even once another wait has begun.
        const wait = { change };
        waiting = wait;
        void allowed
          .then((ok) => {
            if (ok && waiting === wait) set(wait.change);
          })
          .finally(() => {
            if (waiting === wait) waiting = null;
          });
      };

      return {
        activeTool: { kind: 'select' },
        selectedNodeIds: new Set<string>(),
        selectedEdgeId: null,
        pendingEdgeSource: null,
        lassoPoints: null,

        setActiveTool: (tool) =>
          changeSelection({
            activeTool: tool,
            selectedNodeIds: new Set<string>(),
            selectedEdgeId: null,
            pendingEdgeSource: null,
          }),

        selectOnlyNode: (id) =>
          changeSelection({
            selectedNodeIds: new Set([id]),
            selectedEdgeId: null,
          }),

        toggleNodeInSelection: (id) => {
          const next = new Set(get().selectedNodeIds);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          changeSelection({ selectedNodeIds: next, selectedEdgeId: null });
        },

        selectNodes: (ids) =>
          changeSelection({
            selectedNodeIds: new Set(ids),
            selectedEdgeId: null,
          }),

        clearSelection: () =>
          changeSelection({
            selectedNodeIds: new Set<string>(),
            selectedEdgeId: null,
          }),

        deselectDeleted: () => {
          draft = null;
          waiting = null;
          set({ selectedNodeIds: new Set<string>(), selectedEdgeId: null });
        },

        selectEdge: (id) =>
          changeSelection({
            selectedEdgeId: id,
            selectedNodeIds: new Set<string>(),
          }),

        guardDraft: (entityId, confirmLeave) => {
          const hold = { entityId, confirmLeave };
          draft = hold;
          return () => {
            if (draft === hold) draft = null;
          };
        },

        setPendingEdgeSource: (id) => set({ pendingEdgeSource: id }),

        startLasso: () => set({ lassoPoints: [] }),

        addLassoPoint: (point) =>
          set((state) => ({
            lassoPoints: [...(state.lassoPoints ?? []), point],
          })),

        endLasso: () => set({ lassoPoints: null }),
      };
    }),
  );
};

export type ComposerStoreApi = ReturnType<typeof createComposerStore>;

export function useComposerStore<T>(
  store: ComposerStoreApi,
  selector: (state: ComposerStore) => T,
): T {
  return useStore(store, selector);
}

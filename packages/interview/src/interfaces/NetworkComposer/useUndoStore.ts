import { createStore, useStore } from 'zustand';

export type UndoCommand = {
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  /**
   * When set, a pushed command replaces the previous one if it is on top of the
   * stack and shares the same key. Used to collapse a run of live edits to the
   * same entity (e.g. drawer auto-saves) into a single undo step.
   */
  coalesceKey?: string;
};

type UndoState = {
  past: UndoCommand[];
  future: UndoCommand[];
};

type UndoActions = {
  push: (command: UndoCommand) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

export type UndoStore = UndoState & UndoActions;

export const createUndoStore = (limit = 50) =>
  createStore<UndoStore>()((set, get) => {
    // Serialize every history mutation through a single promise chain. undo/redo
    // are fired-and-forgotten (`void undoStore.getState().undo()`) from a keydown
    // handler, so rapid key-repeat can otherwise overlap: a second undo would read
    // the same stack head before the first awaited command settles (replaying it),
    // or a concurrent push's set() could be clobbered by a stale post-await set().
    let chain: Promise<void> = Promise.resolve();
    const enqueue = (op: () => void | Promise<void>): Promise<void> => {
      chain = chain.then(op, op);
      return chain;
    };

    return {
      past: [],
      future: [],

      push: (command) =>
        enqueue(() => {
          set((state) => {
            const previous = state.past[state.past.length - 1];
            // Collapse consecutive same-key commands so a run of live edits is a
            // single undo step (the first command's `undo` already restores the
            // pre-edit state; only its `redo` needs to advance).
            if (
              command.coalesceKey !== undefined &&
              previous?.coalesceKey === command.coalesceKey
            ) {
              return {
                past: [
                  ...state.past.slice(0, -1),
                  { ...command, undo: previous.undo },
                ],
                future: [],
              };
            }
            return {
              past: [...state.past, command].slice(-limit),
              future: [],
            };
          });
        }),

      undo: () =>
        enqueue(async () => {
          const { past } = get();
          const command = past[past.length - 1];
          if (!command) return;
          await command.undo();
          set((state) => ({
            past: state.past.slice(0, -1),
            future: [command, ...state.future],
          }));
        }),

      redo: () =>
        enqueue(async () => {
          const { future } = get();
          const command = future[0];
          if (!command) return;
          await command.redo();
          set((state) => ({
            past: [...state.past, command],
            future: state.future.slice(1),
          }));
        }),
    };
  });

export type UndoStoreApi = ReturnType<typeof createUndoStore>;

export function useUndoStore<T>(
  store: UndoStoreApi,
  selector: (state: UndoStore) => T,
): T {
  return useStore(store, selector);
}

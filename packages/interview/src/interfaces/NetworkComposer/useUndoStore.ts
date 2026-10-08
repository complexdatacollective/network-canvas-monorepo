'use client';

import { createStore, useStore } from 'zustand';

export type UndoCommand = {
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  /**
   * When set, a pushed command joins the previous one if it is on top of the
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
  /**
   * Makes a change and records the command that reverses it as one step of
   * the history. An undo or redo asked for while the change is being made
   * waits for it, so it applies to this change instead of overtaking it, and
   * a change asked for while an undo or redo is being made waits for that.
   * `change` resolves to the command, or to null when it changed nothing.
   */
  record: (change: () => Promise<UndoCommand | null>) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

export type UndoStore = UndoState & UndoActions;

/**
 * One step made of `earlier` followed by `later`. Undoing it reverses `later`
 * before `earlier`, so an answer only the later edit changed is put back too.
 */
const joinCommands = (
  earlier: UndoCommand,
  later: UndoCommand,
): UndoCommand => ({
  ...later,
  undo: async () => {
    await later.undo();
    await earlier.undo();
  },
  redo: async () => {
    await earlier.redo();
    await later.redo();
  },
});

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

    const pushNow = (command: UndoCommand) => {
      set((state) => {
        const previous = state.past[state.past.length - 1];
        // Join consecutive same-key commands so a run of live edits is a
        // single undo step.
        if (
          command.coalesceKey !== undefined &&
          previous?.coalesceKey === command.coalesceKey
        ) {
          return {
            past: [...state.past.slice(0, -1), joinCommands(previous, command)],
            future: [],
          };
        }
        return {
          past: [...state.past, command].slice(-limit),
          future: [],
        };
      });
    };

    return {
      past: [],
      future: [],

      push: (command) => enqueue(() => pushNow(command)),

      record: (change) =>
        enqueue(async () => {
          const command = await change();
          if (command) pushNow(command);
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

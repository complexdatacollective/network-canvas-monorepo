import { createStore, useStore } from 'zustand';

export type UndoCommand = {
  label: string;
  undo: () => void;
  redo: () => void;
};

type UndoState = {
  past: UndoCommand[];
  future: UndoCommand[];
};

type UndoActions = {
  push: (command: UndoCommand) => void;
  undo: () => void;
  redo: () => void;
};

export type UndoStore = UndoState & UndoActions;

export const createUndoStore = (limit = 50) =>
  createStore<UndoStore>()((set, get) => ({
    past: [],
    future: [],

    push: (command) =>
      set((state) => ({
        past: [...state.past, command].slice(-limit),
        future: [],
      })),

    undo: () => {
      const { past } = get();
      const command = past[past.length - 1];
      if (!command) return;
      command.undo();
      set((state) => ({
        past: state.past.slice(0, -1),
        future: [command, ...state.future],
      }));
    },

    redo: () => {
      const { future } = get();
      const command = future[0];
      if (!command) return;
      command.redo();
      set((state) => ({
        past: [...state.past, command],
        future: state.future.slice(1),
      }));
    },
  }));

export type UndoStoreApi = ReturnType<typeof createUndoStore>;

export function useUndoStore<T>(
  store: UndoStoreApi,
  selector: (state: UndoStore) => T,
): T {
  return useStore(store, selector);
}

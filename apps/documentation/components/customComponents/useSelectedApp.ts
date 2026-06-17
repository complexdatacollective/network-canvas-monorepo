'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEYS = {
  architect: 'nc-docs-selected-app',
  interviewer: 'nc-docs-selected-app-interviewer',
} as const;

export type AppAxis = keyof typeof STORAGE_KEYS;

type Store = {
  value: string | null;
  hydrated: boolean;
  listeners: Set<() => void>;
  onStorage: (event: StorageEvent) => void;
  select: (app: string) => void;
};

const stores: Partial<Record<AppAxis, Store>> = {};

function emit(store: Store) {
  for (const listener of store.listeners) {
    listener();
  }
}

function writeStoredApp(key: string, app: string) {
  try {
    window.localStorage.setItem(key, app);
  } catch {
    return;
  }
}

function getStore(axis: AppAxis): Store {
  const existing = stores[axis];
  if (existing) {
    return existing;
  }

  const key = STORAGE_KEYS[axis];
  const store: Store = {
    value: null,
    hydrated: false,
    listeners: new Set(),
    onStorage: () => {},
    select: () => {},
  };

  store.onStorage = (event: StorageEvent) => {
    if (event.key !== key) {
      return;
    }
    const next = event.newValue;
    if (next !== null && next !== store.value) {
      store.value = next;
      emit(store);
    }
  };

  store.select = (app: string) => {
    if (app === store.value) {
      return;
    }
    store.value = app;
    writeStoredApp(key, app);
    emit(store);
  };

  stores[axis] = store;
  return store;
}

function hydrateOnce(axis: AppAxis, store: Store) {
  if (store.hydrated) {
    return;
  }
  store.hydrated = true;

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEYS[axis]);
  } catch {
    stored = null;
  }

  if (stored !== null && stored !== store.value) {
    store.value = stored;
    emit(store);
  }
}

export function useSelectedApp(axis: AppAxis = 'architect') {
  const store = getStore(axis);

  const selected = useSyncExternalStore(
    (listener: () => void) => {
      if (store.listeners.size === 0) {
        window.addEventListener('storage', store.onStorage);
      }
      store.listeners.add(listener);
      hydrateOnce(axis, store);

      return () => {
        store.listeners.delete(listener);
        if (store.listeners.size === 0) {
          window.removeEventListener('storage', store.onStorage);
        }
      };
    },
    () => store.value,
    () => null,
  );

  return [selected, store.select] as const;
}

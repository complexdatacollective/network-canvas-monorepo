'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEYS = {
  architect: 'nc-docs-selected-app',
  interviewer: 'nc-docs-selected-app-interviewer',
} as const;

export type AppAxis = keyof typeof STORAGE_KEYS;

type Store = {
  value: string | null;
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
    listeners: new Set(),
    onStorage: () => {},
    select: () => {},
  };

  store.onStorage = (event: StorageEvent) => {
    if (event.key !== key) {
      return;
    }
    // event.newValue is null when the key is removed in another tab; treat
    // that as a reset rather than ignoring it.
    const next = event.newValue;
    if (next !== store.value) {
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

// Re-read storage on every (re)subscribe so a mount after the last unsubscribe
// — during which the `storage` listener was detached — picks up any cross-tab
// change it missed, including removal of the key (stored === null).
function syncFromStorage(axis: AppAxis, store: Store) {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEYS[axis]);
  } catch {
    stored = null;
  }

  if (stored !== store.value) {
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
      syncFromStorage(axis, store);

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

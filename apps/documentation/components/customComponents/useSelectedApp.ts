'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'nc-docs-selected-app';

let selectedApp: string | null = null;
let hydrated = false;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function readStoredApp(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredApp(app: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, app);
  } catch {
    return;
  }
}

function hydrateOnce() {
  if (hydrated) {
    return;
  }
  hydrated = true;

  const stored = readStoredApp();
  if (stored !== null && stored !== selectedApp) {
    selectedApp = stored;
    emit();
  }
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) {
    return;
  }

  const next = event.newValue;
  if (next !== null && next !== selectedApp) {
    selectedApp = next;
    emit();
  }
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener('storage', handleStorageEvent);
  }
  listeners.add(listener);
  hydrateOnce();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}

function getSnapshot(): string | null {
  return selectedApp;
}

function getServerSnapshot(): string | null {
  return null;
}

function selectApp(app: string) {
  if (app === selectedApp) {
    return;
  }
  selectedApp = app;
  writeStoredApp(app);
  emit();
}

export function useSelectedApp() {
  const selected = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return [selected, selectApp] as const;
}

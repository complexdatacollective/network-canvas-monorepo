import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { Progress } from './types';

const EMPTY: Progress = { beat: null, choices: {} };

const storageKey = (id: string) => `nc-walkthrough:${id}`;

// Every instance on the page (the poster card and each section's button)
// reads the same entry, so a change made in one is seen by the others. The
// in-memory copy keeps the walkthrough working where storage is refused.
const listeners = new Set<() => void>();
const memory = new Map<string, string | null>();

const onStorage = () => {
  memory.clear();
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
};

const read = (id: string) => {
  const remembered = memory.get(id);
  if (remembered !== undefined) return remembered;
  try {
    return window.localStorage.getItem(storageKey(id));
  } catch {
    return null;
  }
};

const isProgress = (value: unknown): value is Progress =>
  typeof value === 'object' &&
  value !== null &&
  'beat' in value &&
  (value.beat === null || typeof value.beat === 'string') &&
  'choices' in value &&
  typeof value.choices === 'object' &&
  value.choices !== null &&
  Object.values(value.choices).every((option) => typeof option === 'string');

const parse = (raw: string | null): Progress => {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    return isProgress(value) ? value : EMPTY;
  } catch {
    return EMPTY;
  }
};

export default function useWalkthroughProgress(id: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(id),
    () => null,
  );
  const progress = useMemo(() => parse(raw), [raw]);

  const save = useCallback(
    (next: Progress | null) => {
      memory.set(id, next ? JSON.stringify(next) : null);
      try {
        if (next) {
          window.localStorage.setItem(storageKey(id), JSON.stringify(next));
        } else {
          window.localStorage.removeItem(storageKey(id));
        }
      } catch {
        // Kept in memory only: it won't resume after a reload.
      }
      listeners.forEach((listener) => listener());
    },
    [id],
  );

  return [progress, save, raw !== null] as const;
}

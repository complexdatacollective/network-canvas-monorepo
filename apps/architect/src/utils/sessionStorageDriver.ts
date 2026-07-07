import type { Driver } from 'redux-remember';

// A redux-remember Driver backed by the tab's own sessionStorage, so the
// persisted session slices (which protocol is open + its undo timeline) are
// per-tab rather than shared across every tab of the origin. sessionStorage
// survives reload but is cleared when the tab closes — see the design doc for
// the crash-recovery trade-off (protocol content lives durably in IndexedDB).
//
// If sessionStorage is present but rejects writes (e.g. Safari private
// browsing), reads/writes degrade to a per-instance in-memory map so the app
// still functions this session. The map is per instance so a storage-blocked
// tab can never leak state into another tab.
const getSessionStorage = (): globalThis.Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const createSessionStorageDriver = (): Driver => {
  const memory = new Map<string, string>();
  let useMemory = false;

  return {
    getItem: (key: string): string | null => {
      if (!useMemory) {
        const storage = getSessionStorage();
        if (storage) {
          try {
            return storage.getItem(key);
          } catch {
            useMemory = true;
          }
        } else {
          useMemory = true;
        }
      }
      return memory.has(key) ? (memory.get(key) ?? null) : null;
    },
    setItem: (key: string, value: string): void => {
      if (!useMemory) {
        const storage = getSessionStorage();
        if (storage) {
          try {
            storage.setItem(key, value);
            return;
          } catch {
            useMemory = true;
          }
        } else {
          useMemory = true;
        }
      }
      memory.set(key, value);
    },
  };
};

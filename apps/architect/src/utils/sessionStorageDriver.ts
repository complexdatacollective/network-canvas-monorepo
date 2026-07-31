import type { Driver } from 'redux-remember';

// A redux-remember Driver backed by the tab's own sessionStorage, so the active
// protocol id and other app preferences are per-tab rather than origin-wide.
// sessionStorage survives reload but is cleared when the tab closes; protocol
// content lives durably in IndexedDB.
//
// If sessionStorage is present but rejects writes (e.g. Safari private
// browsing) or runs out of quota, reads/writes degrade to a per-instance
// in-memory map so the app still functions this session. The map is per
// instance so a storage-blocked tab can never leak state into another tab.
//
// Only the active library id is stored here. A fallback can lose reload
// convenience, but it cannot affect canonical IndexedDB protocol content or
// disable otherwise-healthy persistence.
const getSessionStorage = (): globalThis.Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const REMEMBERED_APP_SESSION_KEY = '@@remember-app';

// A failed startup rehydration may leave malformed or stale remembered state
// behind. Remove it directly because redux-remember installs its persistence
// subscription only after rehydration, so an immediate Redux reset is not
// guaranteed to overwrite the stored payload.
export const clearRememberedAppSession = (): void => {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(REMEMBERED_APP_SESSION_KEY);
  } catch {
    // Inaccessible session storage is already non-persistent. The in-memory
    // Redux state is reset separately by startup recovery.
  }
};

export const createSessionStorageDriver = (): Driver => {
  const memory = new Map<string, string>();
  let useMemory = false;

  const fallBackToMemory = (): void => {
    useMemory = true;
  };

  return {
    getItem: (key: string): string | null => {
      if (!useMemory) {
        const storage = getSessionStorage();
        if (storage) {
          try {
            return storage.getItem(key);
          } catch {
            fallBackToMemory();
          }
        } else {
          fallBackToMemory();
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
            fallBackToMemory();
          }
        } else {
          fallBackToMemory();
        }
      }
      memory.set(key, value);
    },
  };
};

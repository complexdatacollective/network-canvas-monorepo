import type { Driver } from 'redux-remember';

// A redux-remember Driver backed by the tab's own sessionStorage, so the
// persisted session slices (which protocol is open + its undo timeline) are
// per-tab rather than shared across every tab of the origin. sessionStorage
// survives reload but is cleared when the tab closes — see the design doc for
// the crash-recovery trade-off (protocol content lives durably in IndexedDB).
//
// If sessionStorage is present but rejects writes (e.g. Safari private
// browsing) or runs out of quota, reads/writes degrade to a per-instance
// in-memory map so the app still functions this session. The map is per
// instance so a storage-blocked tab can never leak state into another tab.
//
// Falling back silently would drop autosaved edits on reload (the stale
// sessionStorage `present` rehydrates over the newer durable IndexedDB row), so
// the driver notifies `onStorageError` the first time it flips to memory. The
// caller uses this to surface the storage-unavailable banner.
const getSessionStorage = (): globalThis.Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const createSessionStorageDriver = (
  onStorageError?: (error: unknown) => void,
): Driver => {
  const memory = new Map<string, string>();
  let useMemory = false;

  // Flip to the in-memory fallback and notify the caller once, so the banner
  // fires a single time rather than on every subsequent write.
  const fallBackToMemory = (error?: unknown): void => {
    const alreadyFellBack = useMemory;
    useMemory = true;
    if (!alreadyFellBack) {
      onStorageError?.(error);
    }
  };

  return {
    getItem: (key: string): string | null => {
      if (!useMemory) {
        const storage = getSessionStorage();
        if (storage) {
          try {
            return storage.getItem(key);
          } catch (error) {
            fallBackToMemory(error);
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
          } catch (error) {
            fallBackToMemory(error);
          }
        } else {
          fallBackToMemory();
        }
      }
      memory.set(key, value);
    },
  };
};

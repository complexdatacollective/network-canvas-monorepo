export type StorageEstimate = {
  usage: number | null;
  quota: number | null;
  percent: number | null;
};

// Dispatched on window when a persist() request is freshly granted, so live UI
// (StatusRow) can re-read durability without waiting for a focus change.
export const STORAGE_PERSISTED_EVENT = 'interviewer:storage-persisted';

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    const already = await navigator.storage.persisted?.();
    if (already) return true;
    const granted = await navigator.storage.persist();
    if (granted && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(STORAGE_PERSISTED_EVENT));
    }
    return granted;
  } catch {
    return false;
  }
}

// Request from a user gesture rather than at startup. WebKit and Chromium use
// interaction/engagement heuristics for their silent decision, while Firefox
// can show a permission prompt. Deferring gives every browser the strongest
// useful context and avoids surprising Firefox users during page load (#886).
export function requestPersistentStorageOnFirstInteraction(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }
  const request = () => {
    window.removeEventListener('pointerdown', request);
    window.removeEventListener('keydown', request);
    void requestPersistentStorage();
  };
  window.addEventListener('pointerdown', request);
  window.addEventListener('keydown', request);
}

export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return false;
  }
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export async function estimateStorage(): Promise<StorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: null, quota: null, percent: null };
  }
  try {
    const e = await navigator.storage.estimate();
    const usage = e.usage ?? null;
    const quota = e.quota ?? null;
    const percent =
      usage !== null && quota !== null && quota > 0
        ? (usage / quota) * 100
        : null;
    return { usage, quota, percent };
  } catch {
    return { usage: null, quota: null, percent: null };
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unitIndex]}`;
}

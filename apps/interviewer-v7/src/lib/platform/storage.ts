export type StorageEstimate = {
  usage: number | null;
  quota: number | null;
  percent: number | null;
};

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    const already = await navigator.storage.persisted?.();
    if (already) return true;
    return await navigator.storage.persist();
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

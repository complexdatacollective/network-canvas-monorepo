import { isElectron } from './platform';

export type StorageEstimate = {
  // db bytes on Electron, IndexedDB usage on web/Capacitor
  usage: number | null;
  // disk total on Electron, IndexedDB quota on web/Capacitor
  quota: number | null;
  // disk free on Electron, derived quota - usage on web/Capacitor
  free: number | null;
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

async function estimateStorageElectron(): Promise<StorageEstimate> {
  const api = window.electronAPI;
  if (!api?.system) {
    return { usage: null, quota: null, free: null, percent: null };
  }
  try {
    const { dbBytes, diskFreeBytes, diskTotalBytes } =
      await api.system.storageInfo();
    const percent =
      dbBytes !== null && diskTotalBytes !== null && diskTotalBytes > 0
        ? (dbBytes / diskTotalBytes) * 100
        : null;
    return {
      usage: dbBytes,
      quota: diskTotalBytes,
      free: diskFreeBytes,
      percent,
    };
  } catch {
    return { usage: null, quota: null, free: null, percent: null };
  }
}

async function estimateStorageWeb(): Promise<StorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: null, quota: null, free: null, percent: null };
  }
  try {
    const e = await navigator.storage.estimate();
    const usage = e.usage ?? null;
    const quota = e.quota ?? null;
    const free =
      usage !== null && quota !== null ? Math.max(0, quota - usage) : null;
    const percent =
      usage !== null && quota !== null && quota > 0
        ? (usage / quota) * 100
        : null;
    return { usage, quota, free, percent };
  } catch {
    return { usage: null, quota: null, free: null, percent: null };
  }
}

export async function estimateStorage(): Promise<StorageEstimate> {
  return isElectron ? estimateStorageElectron() : estimateStorageWeb();
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

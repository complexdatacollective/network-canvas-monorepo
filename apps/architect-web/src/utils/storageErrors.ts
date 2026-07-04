// Error names thrown when IndexedDB is unavailable or over quota — the common
// case being Safari private browsing, whose per-origin quota is too small for
// the bundled sample media. Used to decide when to fall back to an in-memory
// copy rather than failing outright. Leaf module (no imports) to avoid cycles.
const STORAGE_ERROR_NAMES = new Set([
  'QuotaExceededError',
  'InvalidStateError',
  'UnknownError',
  'SecurityError',
  'AbortError',
  'DatabaseClosedError',
  'OpenFailedError',
  'VersionError',
]);

export const isStorageUnavailableError = (error: unknown): boolean => {
  if (error instanceof Error && STORAGE_ERROR_NAMES.has(error.name)) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /quota|indexeddb|idbdatabase|object ?store|storage/i.test(message);
};

// DOMException names IndexedDB throws when storage is unavailable or over
// quota — the common case being Safari private browsing, whose per-origin quota
// is too small for the bundled sample media. Gated on `instanceof DOMException`
// so a same-named plain Error from unrelated code can't be misread as a storage
// failure. Leaf module (no imports) to avoid cycles.
const STORAGE_DOM_EXCEPTION_NAMES = new Set([
  'QuotaExceededError',
  'InvalidStateError',
  'SecurityError',
]);

// Dexie-specific error names raised when the database itself can't be opened or
// used — unambiguously a storage failure, so match by name alone.
const STORAGE_DEXIE_ERROR_NAMES = new Set([
  'DatabaseClosedError',
  'OpenFailedError',
  'VersionError',
]);

export const isStorageUnavailableError = (error: unknown): boolean => {
  if (
    error instanceof DOMException &&
    STORAGE_DOM_EXCEPTION_NAMES.has(error.name)
  ) {
    return true;
  }
  if (error instanceof Error) {
    if (STORAGE_DEXIE_ERROR_NAMES.has(error.name)) {
      return true;
    }
    // Quota/IndexedDB-specific wording only — the bare word "storage" matched
    // too many unrelated errors and risked masking genuine bugs behind the
    // memory fallback.
    return /quota|quotaexceeded|indexeddb|idbdatabase/i.test(error.message);
  }
  return false;
};

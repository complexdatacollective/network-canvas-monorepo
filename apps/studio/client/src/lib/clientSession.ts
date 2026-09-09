// This tab's identity, which is what its protocol-builder locks belong to.
//
// Minted once and kept in `sessionStorage`, so it survives a reload and every
// socket the tab opens but is not shared with a second tab — two tabs of one
// researcher are two editors, and the second opens read-only behind the first
// (#1275). The server derives the lock owner from it, so a tab that reconnects
// is still the holder of the section it has open.

import { createUuid } from './createUuid.ts';

const STORAGE_KEY = 'studio.clientSessionId';

let minted: string | undefined;

/**
 * `sessionStorage` throws rather than returning nothing in a browser
 * configured to block site data, and the id still has to exist there — a
 * per-load id is a worse owner than a per-tab one, but it is an owner.
 */
function stored(): string | undefined {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function remember(id: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Nothing to do: `minted` carries the id for this document's lifetime.
  }
}

export function clientSessionId(): string {
  if (minted !== undefined) return minted;
  const kept = stored();
  minted = kept ?? createUuid();
  if (kept === undefined) remember(minted);
  return minted;
}

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { get } from 'es-toolkit/compat';

import type { RootState } from './root';

type AppState = {
  [key: string]: unknown;
};

const initialState: AppState = {};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setProperty: (
      state,
      action: PayloadAction<{ key: string; value: unknown }>,
    ) => {
      const { key, value } = action.payload;
      state[key] = value;
    },
  },
});

const { setProperty } = appSlice.actions;

const PREVIEW_USE_SYNTHETIC_DATA_KEY = 'previewUseSyntheticData';

export function setPreviewUseSyntheticData(value: boolean) {
  return setProperty({ key: PREVIEW_USE_SYNTHETIC_DATA_KEY, value });
}

export function getPreviewUseSyntheticData(
  state: Pick<RootState, 'app'>,
): boolean {
  const raw = get(state, ['app', PREVIEW_USE_SYNTHETIC_DATA_KEY]);
  return raw === undefined ? true : Boolean(raw);
}

const ACTIVE_PROTOCOL_ID_KEY = 'activeProtocolId';

// The library id of the protocol currently in the editing buffer. Persisted (in
// `app`) so a reload knows which library row to autosave into. Mirrored into the
// non-redux asset scope (see `activeProtocolScope.ts`) by a store subscription.
export function setActiveProtocolId(value: string | null) {
  return setProperty({ key: ACTIVE_PROTOCOL_ID_KEY, value });
}

export function getActiveProtocolId(
  state: Pick<RootState, 'app'>,
): string | null {
  const raw = get(state, ['app', ACTIVE_PROTOCOL_ID_KEY]);
  return typeof raw === 'string' ? raw : null;
}

const STORAGE_UNAVAILABLE_KEY = 'storageUnavailable';

// Set when a protocol had to be opened from an in-memory copy because persistent
// storage (IndexedDB) was unavailable — e.g. Safari private browsing. Drives the
// "won't be saved" banner and disables autosave for the session.
export function setStorageUnavailable(value: boolean) {
  return setProperty({ key: STORAGE_UNAVAILABLE_KEY, value });
}

export function getStorageUnavailable(state: Pick<RootState, 'app'>): boolean {
  return Boolean(get(state, ['app', STORAGE_UNAVAILABLE_KEY]));
}

const PROTOCOL_LOCK_STATE_KEY = 'protocolLockState';

/**
 * Which tab owns the saved copy of the active protocol.
 *
 * Only one tab may edit a given library row (they share it), so this decides
 * whether anything this tab does can reach disk. Derived per session from the
 * tab-lock BroadcastChannel, and reset to `owned` on every claim so a reloaded
 * tab never restores a stale state.
 *
 * - `owned`: this tab holds the lock. Normal editing; autosave writes.
 * - `open-elsewhere`: another tab holds it. This tab may show the protocol but
 *   every write it makes is dropped.
 * - `reclaim-blocked`: the other tab released the protocol, but this tab holds
 *   an open stage editor draft. Loading the saved copy would close that
 *   transaction and take the draft with it (#1382), while committing the draft
 *   would replace the codebook wholesale from a snapshot taken before the other
 *   tab's edits. Neither may happen silently, so the reclaim stops here until
 *   the researcher chooses — and until then nothing is written, exactly as in
 *   `open-elsewhere`.
 */
export type ProtocolLockState = 'owned' | 'open-elsewhere' | 'reclaim-blocked';

export function setProtocolLockState(value: ProtocolLockState) {
  return setProperty({ key: PROTOCOL_LOCK_STATE_KEY, value });
}

export function getProtocolLockState(
  state: Pick<RootState, 'app'>,
): ProtocolLockState {
  const raw = get(state, ['app', PROTOCOL_LOCK_STATE_KEY]);
  return raw === 'open-elsewhere' || raw === 'reclaim-blocked' ? raw : 'owned';
}

/**
 * Whether this tab owns the saved copy, and may therefore write to it.
 *
 * The question every persistence gate actually asks. Deliberately not "is the
 * protocol open elsewhere": a reclaim blocked on an unresolved draft conflict
 * has no other tab to blame, and still must not write.
 */
export function getProtocolOwnedHere(state: Pick<RootState, 'app'>): boolean {
  return getProtocolLockState(state) === 'owned';
}

const PROTOCOL_RECLAIM_CHOICE_REQUEST_KEY = 'protocolReclaimChoiceRequest';

/**
 * Asks for the blocked-reclaim choice to be put back on screen.
 *
 * The choice may be dismissed without answering — nothing is written or
 * discarded until the researcher answers, so dismissing has to be safe. But
 * dismissing it must not strand the one action that KEEPS the work (downloading
 * a copy that includes the draft), so the banner explaining the situation can
 * raise the question again. A counter rather than a flag: what the dialog
 * reacts to is a fresh request, and a flag would need clearing afterwards by
 * whoever happened to notice.
 */
export function requestProtocolReclaimChoice() {
  return (
    dispatch: (action: ReturnType<typeof setProperty>) => void,
    getState: () => Pick<RootState, 'app'>,
  ) => {
    dispatch(
      setProperty({
        key: PROTOCOL_RECLAIM_CHOICE_REQUEST_KEY,
        value: getProtocolReclaimChoiceRequest(getState()) + 1,
      }),
    );
  };
}

export function getProtocolReclaimChoiceRequest(
  state: Pick<RootState, 'app'>,
): number {
  const raw = get(state, ['app', PROTOCOL_RECLAIM_CHOICE_REQUEST_KEY]);
  return typeof raw === 'number' ? raw : 0;
}

const PREVIEW_RESPECT_SKIP_LOGIC_KEY = 'previewRespectSkipLogic';
const LEGACY_PREVIEW_IGNORE_SKIP_LOGIC_KEY = 'previewIgnoreSkipLogic';

export function setPreviewRespectSkipLogic(value: boolean) {
  return setProperty({ key: PREVIEW_RESPECT_SKIP_LOGIC_KEY, value });
}

export function getPreviewRespectSkipLogic(
  state: Pick<RootState, 'app'>,
): boolean {
  const raw = get(state, ['app', PREVIEW_RESPECT_SKIP_LOGIC_KEY]);
  if (raw !== undefined) return Boolean(raw);

  // Preserve an explicitly selected preference from the inverse legacy
  // setting when rehydrating state written by an earlier Architect version.
  const legacyRaw = get(state, ['app', LEGACY_PREVIEW_IGNORE_SKIP_LOGIC_KEY]);
  return legacyRaw === undefined ? false : !legacyRaw;
}

export default appSlice.reducer;

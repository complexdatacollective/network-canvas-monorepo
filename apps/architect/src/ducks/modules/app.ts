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

const PROTOCOL_OPEN_ELSEWHERE_KEY = 'protocolOpenElsewhere';

// Set when the active protocol is already open in another tab of this browser.
// Only one tab may edit a given library row (they share it), so the second tab
// becomes a read-only view: autosave is disabled and a banner is shown. Derived
// per session from the tab-lock BroadcastChannel, and reset on every claim so a
// reloaded tab never restores a stale read-only state.
export function setProtocolOpenElsewhere(value: boolean) {
  return setProperty({ key: PROTOCOL_OPEN_ELSEWHERE_KEY, value });
}

export function getProtocolOpenElsewhere(
  state: Pick<RootState, 'app'>,
): boolean {
  return Boolean(get(state, ['app', PROTOCOL_OPEN_ELSEWHERE_KEY]));
}

const PREVIEW_IGNORE_SKIP_LOGIC_KEY = 'previewIgnoreSkipLogic';

export function setPreviewIgnoreSkipLogic(value: boolean) {
  return setProperty({ key: PREVIEW_IGNORE_SKIP_LOGIC_KEY, value });
}

export function getPreviewIgnoreSkipLogic(
  state: Pick<RootState, 'app'>,
): boolean {
  const raw = get(state, ['app', PREVIEW_IGNORE_SKIP_LOGIC_KEY]);
  return raw === undefined ? true : Boolean(raw);
}

export default appSlice.reducer;

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

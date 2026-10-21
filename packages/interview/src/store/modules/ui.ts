import {
  createAction,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';

import type { LocaleTag } from '@codaco/protocol-validation';

import { transitionStage } from './session';

type UIState = {
  FORM_IS_READY: boolean;
  /**
   * Names the decryption scope holding the interview's encryption key, while
   * one is in force. Only this opaque id is kept here: the key and the
   * passphrase it came from are never put in Redux state.
   */
  encryptionKeyId: string | null;
  showPassphrasePrompter: boolean;
  /**
   * The language the participant chose on a language chooser stage (or the
   * host stated for them), or `null` to follow the browser's languages. It is
   * not interview data: never part of the session handed to the host, and
   * kept only in the tab's sessionStorage (see
   * `localization/localePreferenceStorage`).
   */
  localePreference: LocaleTag | null;
};

const initialState: UIState = {
  FORM_IS_READY: false,
  encryptionKeyId: null,
  showPassphrasePrompter: false,
  localePreference: null,
};

/** A passphrase was turned away because it does not open the interview. */
export const passphraseRejected = createAction('ui/passphraseRejected');

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setFormIsReady: (state, action: PayloadAction<boolean>) => ({
      ...state,
      FORM_IS_READY: action.payload,
    }),
    encryptionUnlocked: (state, action: PayloadAction<string>) => ({
      ...state,
      encryptionKeyId: action.payload,
    }),
    setShowPassphrasePrompter: (state, action: PayloadAction<boolean>) => ({
      ...state,
      showPassphrasePrompter: action.payload,
    }),
    setLocalePreference: (state, action: PayloadAction<LocaleTag>) =>
      state.localePreference === action.payload
        ? state
        : { ...state, localePreference: action.payload },
  },
  extraReducers: (builder) => {
    // Reset showPassphrasePrompter when the stage transitions
    builder.addCase(transitionStage, (state) => ({
      ...state,
      showPassphrasePrompter: false,
    }));
  },
  selectors: {
    formIsReady: (state) => state.FORM_IS_READY,
    getEncryptionKeyId: (state) => state.encryptionKeyId,
    showPassphrasePrompter: (state) => state.showPassphrasePrompter,
    getLocalePreference: (state) => state.localePreference,
  },
});

// Export the reducer
export default uiSlice.reducer;

// Export the action creators
export const {
  setFormIsReady,
  encryptionUnlocked,
  setShowPassphrasePrompter,
  setLocalePreference,
} = uiSlice.actions;

// Export the selectors
export const {
  formIsReady,
  getEncryptionKeyId,
  showPassphrasePrompter,
  getLocalePreference,
} = uiSlice.selectors;

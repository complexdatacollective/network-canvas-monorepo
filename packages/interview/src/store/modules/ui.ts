import {
  createAction,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';

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
};

const initialState: UIState = {
  FORM_IS_READY: false,
  encryptionKeyId: null,
  showPassphrasePrompter: false,
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
  },
});

// Export the reducer
export default uiSlice.reducer;

// Export the action creators
export const { setFormIsReady, encryptionUnlocked, setShowPassphrasePrompter } =
  uiSlice.actions;

// Export the selectors
export const { formIsReady, getEncryptionKeyId, showPassphrasePrompter } =
  uiSlice.selectors;

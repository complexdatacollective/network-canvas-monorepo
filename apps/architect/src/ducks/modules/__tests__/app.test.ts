import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import appReducer, {
  getPreviewRespectSkipLogic,
  getPreviewUseSyntheticData,
  getProtocolLockState,
  getProtocolOwnedHere,
  setPreviewRespectSkipLogic,
  setPreviewUseSyntheticData,
  setProtocolLockState,
} from '../app';

function createStore() {
  return configureStore({ reducer: { app: appReducer } });
}

describe('app slice — preview preferences', () => {
  it('getPreviewUseSyntheticData defaults to true when unset', () => {
    const store = createStore();
    expect(getPreviewUseSyntheticData(store.getState())).toBe(true);
  });

  it('setPreviewUseSyntheticData(false) flips the preference', () => {
    const store = createStore();
    store.dispatch(setPreviewUseSyntheticData(false));
    expect(getPreviewUseSyntheticData(store.getState())).toBe(false);
  });

  it('setPreviewUseSyntheticData(true) restores the preference', () => {
    const store = createStore();
    store.dispatch(setPreviewUseSyntheticData(false));
    store.dispatch(setPreviewUseSyntheticData(true));
    expect(getPreviewUseSyntheticData(store.getState())).toBe(true);
  });

  it('defaults to not respecting skip logic', () => {
    const store = createStore();
    expect(getPreviewRespectSkipLogic(store.getState())).toBe(false);
  });

  it.each([
    { previewIgnoreSkipLogic: true, expected: false },
    { previewIgnoreSkipLogic: false, expected: true },
  ])(
    'preserves the inverse legacy preview preference %#',
    ({ previewIgnoreSkipLogic, expected }) => {
      expect(
        getPreviewRespectSkipLogic({ app: { previewIgnoreSkipLogic } }),
      ).toBe(expected);
    },
  );

  it('prefers the new preview preference over legacy state', () => {
    expect(
      getPreviewRespectSkipLogic({
        app: {
          previewRespectSkipLogic: false,
          previewIgnoreSkipLogic: false,
        },
      }),
    ).toBe(false);
  });

  it('persists the respect skip logic preference', () => {
    const store = createStore();
    store.dispatch(setPreviewRespectSkipLogic(true));
    expect(getPreviewRespectSkipLogic(store.getState())).toBe(true);

    store.dispatch(setPreviewRespectSkipLogic(false));
    expect(getPreviewRespectSkipLogic(store.getState())).toBe(false);
  });
});

describe('app slice — protocol lock state', () => {
  it('defaults to false when unset', () => {
    const store = createStore();
    expect(getProtocolLockState(store.getState())).toBe('owned');
    expect(getProtocolOwnedHere(store.getState())).toBe(true);
  });

  it('records that another tab holds the saved copy', () => {
    const store = createStore();
    store.dispatch(setProtocolLockState('open-elsewhere'));
    expect(getProtocolLockState(store.getState())).toBe('open-elsewhere');
    expect(getProtocolOwnedHere(store.getState())).toBe(false);
  });

  // A blocked reclaim has no other tab to blame, and still must not write.
  it('refuses writes while a reclaim is blocked on an unresolved draft', () => {
    const store = createStore();
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    expect(getProtocolLockState(store.getState())).toBe('reclaim-blocked');
    expect(getProtocolOwnedHere(store.getState())).toBe(false);
  });

  it('hands ownership back to this tab', () => {
    const store = createStore();
    store.dispatch(setProtocolLockState('open-elsewhere'));
    store.dispatch(setProtocolLockState('owned'));
    expect(getProtocolOwnedHere(store.getState())).toBe(true);
  });
});

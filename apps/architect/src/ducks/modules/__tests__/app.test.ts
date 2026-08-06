import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import appReducer, {
  getPreviewRespectSkipLogic,
  getPreviewUseSyntheticData,
  getProtocolOpenElsewhere,
  setPreviewRespectSkipLogic,
  setPreviewUseSyntheticData,
  setProtocolOpenElsewhere,
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

describe('app slice — protocolOpenElsewhere', () => {
  it('defaults to false when unset', () => {
    const store = createStore();
    expect(getProtocolOpenElsewhere(store.getState())).toBe(false);
  });

  it('setProtocolOpenElsewhere(true) flips the flag', () => {
    const store = createStore();
    store.dispatch(setProtocolOpenElsewhere(true));
    expect(getProtocolOpenElsewhere(store.getState())).toBe(true);
  });

  it('setProtocolOpenElsewhere(false) clears the flag', () => {
    const store = createStore();
    store.dispatch(setProtocolOpenElsewhere(true));
    store.dispatch(setProtocolOpenElsewhere(false));
    expect(getProtocolOpenElsewhere(store.getState())).toBe(false);
  });
});

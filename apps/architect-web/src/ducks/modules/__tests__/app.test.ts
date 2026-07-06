import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import appReducer, {
  getPreviewUseSyntheticData,
  getProtocolOpenElsewhere,
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

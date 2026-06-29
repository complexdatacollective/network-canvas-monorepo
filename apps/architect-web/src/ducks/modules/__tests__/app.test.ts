import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import appReducer, {
  getPreviewAllowStageNavigation,
  getPreviewUseSyntheticData,
  setPreviewAllowStageNavigation,
  setPreviewUseSyntheticData,
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

  it('getPreviewAllowStageNavigation defaults to false when unset', () => {
    const store = createStore();
    expect(getPreviewAllowStageNavigation(store.getState())).toBe(false);
  });

  it('setPreviewAllowStageNavigation(true) flips the preference', () => {
    const store = createStore();
    store.dispatch(setPreviewAllowStageNavigation(true));
    expect(getPreviewAllowStageNavigation(store.getState())).toBe(true);
  });
});

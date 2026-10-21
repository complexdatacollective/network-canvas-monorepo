import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import appReducer, {
  dismissMissingTranslations,
  getDismissedMissingTranslations,
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

describe('app slice — dismissed missing translations', () => {
  it('reads as not dismissed when nothing is stored', () => {
    const store = createStore();
    expect(getDismissedMissingTranslations(store.getState(), 'p1')).toBeNull();
  });

  it('remembers the missing count per protocol', () => {
    const store = createStore();
    store.dispatch(dismissMissingTranslations('p1', 3));
    store.dispatch(dismissMissingTranslations('p2', 0));

    expect(getDismissedMissingTranslations(store.getState(), 'p1')).toBe(3);
    expect(getDismissedMissingTranslations(store.getState(), 'p2')).toBe(0);
    expect(getDismissedMissingTranslations(store.getState(), 'p3')).toBeNull();
  });

  it('replaces the count when a protocol is dismissed again', () => {
    const store = createStore();
    store.dispatch(dismissMissingTranslations('p1', 3));
    store.dispatch(dismissMissingTranslations('p1', 5));

    expect(getDismissedMissingTranslations(store.getState(), 'p1')).toBe(5);
  });

  it.each([
    ['a negative count', { p1: -1 }],
    ['a fractional count', { p1: 1.5 }],
    ['a count that is not finite', { p1: Infinity }],
    ['a count stored as a string', { p1: '3' }],
    ['a null count', { p1: null }],
    ['one malformed entry beside a valid one', { p1: 3, p2: -2 }],
    ['an array', [3]],
    ['a bare number', 3],
    ['a string', 'p1'],
    ['null', null],
  ])('reads %s as not dismissed', (_, stored) => {
    const state = { app: { dismissedMissingTranslations: stored } };

    expect(getDismissedMissingTranslations(state, 'p1')).toBeNull();
  });

  it('starts again from nothing when overwriting malformed stored data', () => {
    const store = createStore();
    store.dispatch({
      type: 'app/setProperty',
      payload: { key: 'dismissedMissingTranslations', value: { p1: -1 } },
    });
    store.dispatch(dismissMissingTranslations('p2', 2));

    expect(getDismissedMissingTranslations(store.getState(), 'p1')).toBeNull();
    expect(getDismissedMissingTranslations(store.getState(), 'p2')).toBe(2);
  });
});

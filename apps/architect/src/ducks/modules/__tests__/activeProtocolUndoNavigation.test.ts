import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navigate } from 'wouter/use-browser-location';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { AppDispatch, RootState } from '~/ducks/store';

import createTimelineReducer from '../../middleware/timeline';
import activeProtocolReducer, {
  actionCreators,
  redoWithNavigation,
  undoWithNavigation,
} from '../activeProtocol';

vi.mock('wouter/use-browser-location', () => ({ navigate: vi.fn() }));

type Entry = { id: string; path: string };

const buildState = (opts: {
  past?: unknown[];
  future?: unknown[];
  timeline?: Entry[];
  futureTimeline?: Entry[];
}) =>
  ({
    activeProtocol: {
      past: opts.past ?? [{}],
      present: { name: 'P', stages: [] },
      future: opts.future ?? [],
      timeline: opts.timeline ?? [],
      futureTimeline: opts.futureTimeline ?? [],
    },
  }) as unknown as RootState;

// Fake dispatch that runs nested thunks and records plain actions so we can
// assert whether the raw undo/redo was applied.
const makeHarness = (state: RootState) => {
  const plainActions: { type: string }[] = [];
  const getState = () => state;
  const dispatch = ((action: unknown) => {
    if (typeof action === 'function') {
      return (action as (d: unknown, g: () => RootState) => unknown)(
        dispatch,
        getState,
      );
    }
    plainActions.push(action as { type: string });
    return action;
  }) as unknown as AppDispatch;
  return { dispatch, getState, plainActions };
};

const setPath = (path: string) => window.history.replaceState({}, '', path);
const undoApplied = (actions: { type: string }[]) =>
  actions.some((a) => a.type === 'timeline/undo');
const redoApplied = (actions: { type: string }[]) =>
  actions.some((a) => a.type === 'timeline/redo');

describe('undoWithNavigation / redoWithNavigation', () => {
  beforeEach(() => {
    vi.mocked(navigate).mockClear();
    setPath('/protocol');
  });

  it('reverts in place when the change lives on the current page', () => {
    setPath('/protocol/codebook');
    const state = buildState({
      timeline: [{ id: 'a', path: '/protocol/codebook' }],
    });
    const { dispatch, getState, plainActions } = makeHarness(state);

    undoWithNavigation()(dispatch, getState);

    expect(navigate).not.toHaveBeenCalled();
    expect(undoApplied(plainActions)).toBe(true);
  });

  it('navigates first (without reverting) when the change lives on another page', () => {
    const state = buildState({
      timeline: [{ id: 'a', path: '/protocol/codebook' }],
    });
    const { dispatch, getState, plainActions } = makeHarness(state);

    undoWithNavigation()(dispatch, getState);

    expect(navigate).toHaveBeenCalledWith('/protocol/codebook');
    expect(undoApplied(plainActions)).toBe(false);
  });

  it('reverts on the second press once on the target page', () => {
    setPath('/protocol/codebook');
    const state = buildState({
      timeline: [{ id: 'a', path: '/protocol/codebook' }],
    });
    const { dispatch, getState, plainActions } = makeHarness(state);

    // Simulates the press that follows the navigation step.
    undoWithNavigation()(dispatch, getState);

    expect(navigate).not.toHaveBeenCalled();
    expect(undoApplied(plainActions)).toBe(true);
  });

  it('routes a committed stage edit to the stage list, not the editor', () => {
    setPath('/protocol/codebook');
    const state = buildState({
      timeline: [{ id: 'a', path: '/protocol/stage/stage-1' }],
    });
    const { dispatch, getState, plainActions } = makeHarness(state);

    undoWithNavigation()(dispatch, getState);

    expect(navigate).toHaveBeenCalledWith('/protocol');
    expect(undoApplied(plainActions)).toBe(false);
  });

  it('reverts path-less (legacy) entries in place', () => {
    const state = buildState({ timeline: [{ id: 'a', path: '' }] });
    const { dispatch, getState, plainActions } = makeHarness(state);

    undoWithNavigation()(dispatch, getState);

    expect(navigate).not.toHaveBeenCalled();
    expect(undoApplied(plainActions)).toBe(true);
  });

  it('does nothing when there is nothing to undo', () => {
    const state = buildState({
      past: [],
      timeline: [{ id: 'a', path: '/protocol/codebook' }],
    });
    const { dispatch, getState, plainActions } = makeHarness(state);

    undoWithNavigation()(dispatch, getState);

    expect(navigate).not.toHaveBeenCalled();
    expect(undoApplied(plainActions)).toBe(false);
  });

  it('redo mirrors undo using the future timeline head', () => {
    const state = buildState({
      future: [{}],
      futureTimeline: [{ id: 'b', path: '/protocol/assets' }],
    });
    const { dispatch, getState, plainActions } = makeHarness(state);

    // First press: orient to the page the redone change lives on.
    redoWithNavigation()(dispatch, getState);
    expect(navigate).toHaveBeenCalledWith('/protocol/assets');
    expect(redoApplied(plainActions)).toBe(false);

    // Second press, now on that page: reapply.
    setPath('/protocol/assets');
    redoWithNavigation()(dispatch, getState);
    expect(redoApplied(plainActions)).toBe(true);
  });

  it('does nothing when there is nothing to redo', () => {
    const state = buildState({
      future: [],
      futureTimeline: [{ id: 'b', path: '/protocol/assets' }],
    });
    const { dispatch, getState, plainActions } = makeHarness(state);

    redoWithNavigation()(dispatch, getState);

    expect(navigate).not.toHaveBeenCalled();
    expect(redoApplied(plainActions)).toBe(false);
  });
});

// Exercises the thunks against a real timeline-wrapped store so the
// getUndoTargetPath ↔ middleware-locus assumption is verified end to end (the
// fake-state unit tests above can't reach the middleware's locus bookkeeping).
describe('undoWithNavigation (real store integration)', () => {
  const baseProtocol: CurrentProtocol = {
    name: 'Orig',
    description: 'd',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  };

  const makeStore = () =>
    configureStore({
      reducer: { activeProtocol: createTimelineReducer(activeProtocolReducer) },
      middleware: (getDefault) => getDefault({ serializableCheck: false }),
    });

  beforeEach(() => {
    vi.mocked(navigate).mockClear();
    setPath('/protocol');
  });

  it('navigates to the editing page first, then reverts on the next press', () => {
    setPath('/protocol/codebook');
    const store = makeStore();
    store.dispatch(actionCreators.setActiveProtocol(baseProtocol));
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));
    expect(store.getState().activeProtocol.present?.name).toBe('Renamed');

    // The user has since navigated away from where the change was made.
    setPath('/protocol');
    store.dispatch(undoWithNavigation());
    expect(navigate).toHaveBeenCalledWith('/protocol/codebook');
    // Not reverted off-screen.
    expect(store.getState().activeProtocol.present?.name).toBe('Renamed');

    // Second press, now on the change's page: revert in view.
    setPath('/protocol/codebook');
    store.dispatch(undoWithNavigation());
    expect(store.getState().activeProtocol.present?.name).toBe('Orig');
  });

  it('navigates once for consecutive changes on the same page, then reverts in place', () => {
    setPath('/protocol/codebook');
    const store = makeStore();
    store.dispatch(actionCreators.setActiveProtocol(baseProtocol));
    store.dispatch(actionCreators.updateProtocolName({ name: 'A' }));
    store.dispatch(
      actionCreators.updateProtocolDescription({ description: 'B' }),
    );

    // First press from another page only navigates.
    setPath('/protocol');
    store.dispatch(undoWithNavigation());
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/protocol/codebook');

    // Subsequent presses on that page revert both changes without re-navigating.
    setPath('/protocol/codebook');
    store.dispatch(undoWithNavigation());
    store.dispatch(undoWithNavigation());
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(store.getState().activeProtocol.present?.name).toBe('Orig');
    expect(store.getState().activeProtocol.present?.description).toBe('d');
  });
});

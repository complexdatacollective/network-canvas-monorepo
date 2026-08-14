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

const setPath = (path: string) => window.history.replaceState({}, '', path);

const baseProtocol: CurrentProtocol = {
  name: 'Orig',
  description: 'd',
  schemaVersion: 8,
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
};

// The thunks are exercised against a real timeline-wrapped store throughout:
// they read the locus the middleware recorded and confirm the operation landed
// by observing `present`, so a fake state object cannot reach either contract.
const makeStore = (getPath?: () => string) =>
  configureStore({
    reducer: {
      activeProtocol: createTimelineReducer(
        activeProtocolReducer,
        getPath ? { getPath } : {},
      ),
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });

const seeded = (getPath?: () => string) => {
  const store = makeStore(getPath);
  store.dispatch(actionCreators.setActiveProtocol(baseProtocol));
  return store;
};

// One activation performs one history operation from any page, and only changes
// route when a page exists that would reveal the result (#1389). Before the
// fix, a cross-page activation navigated and returned without applying, so the
// researcher had to press the same control twice.
describe('undoWithNavigation', () => {
  beforeEach(() => {
    vi.mocked(navigate).mockClear();
    setPath('/protocol');
  });

  it('reverts in place when the change lives on the current page', () => {
    setPath('/protocol/codebook');
    const store = seeded();
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));

    const outcome = store.dispatch(undoWithNavigation());

    expect(navigate).not.toHaveBeenCalled();
    expect(store.getState().activeProtocol.present?.name).toBe('Orig');
    expect(outcome).toEqual({ applied: true, navigatedTo: null });
  });

  it('reverts AND navigates in a single activation when the change lives on another page', () => {
    setPath('/protocol/codebook');
    const store = seeded();
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));

    // The researcher has since moved away from where the change was made.
    setPath('/protocol/assets');
    const outcome = store.dispatch(undoWithNavigation());

    expect(navigate).toHaveBeenCalledWith('/protocol/codebook');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(store.getState().activeProtocol.present?.name).toBe('Orig');
    expect(outcome).toEqual({
      applied: true,
      navigatedTo: '/protocol/codebook',
    });
  });

  it('reverts consecutive same-page changes one per activation', () => {
    setPath('/protocol/codebook');
    const store = seeded();
    store.dispatch(actionCreators.updateProtocolName({ name: 'A' }));
    store.dispatch(
      actionCreators.updateProtocolDescription({ description: 'B' }),
    );

    setPath('/protocol');
    store.dispatch(undoWithNavigation());
    expect(store.getState().activeProtocol.present?.description).toBe('d');
    expect(store.getState().activeProtocol.present?.name).toBe('A');

    setPath('/protocol/codebook');
    store.dispatch(undoWithNavigation());
    expect(store.getState().activeProtocol.present?.name).toBe('Orig');

    // Only the first activation needed to move the researcher.
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/protocol/codebook');
  });

  // The destination must come from the entry being reverted, which undo pops —
  // so it has to be read before the dispatch. Reading it afterwards would
  // resolve the PREVIOUS change's page, which is only distinguishable when the
  // two changes were made on different pages.
  it('targets the page of the change being reverted, not the one before it', () => {
    setPath('/protocol/assets');
    const store = seeded();
    store.dispatch(actionCreators.updateProtocolName({ name: 'A' }));

    setPath('/protocol/codebook');
    store.dispatch(
      actionCreators.updateProtocolDescription({ description: 'B' }),
    );

    setPath('/protocol');
    const outcome = store.dispatch(undoWithNavigation());

    expect(navigate).toHaveBeenCalledWith('/protocol/codebook');
    expect(navigate).not.toHaveBeenCalledWith('/protocol/assets');
    expect(store.getState().activeProtocol.present?.description).toBe('d');
    expect(outcome).toEqual({
      applied: true,
      navigatedTo: '/protocol/codebook',
    });
  });

  // Summary renders the whole protocol, so the revert is visible without a
  // route change and the researcher keeps their place in the report.
  it('applies without moving the researcher off the Summary report', () => {
    setPath('/protocol/codebook');
    const store = seeded();
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));

    setPath('/protocol/summary');
    const outcome = store.dispatch(undoWithNavigation());

    expect(navigate).not.toHaveBeenCalled();
    expect(store.getState().activeProtocol.present?.name).toBe('Orig');
    expect(outcome).toEqual({ applied: true, navigatedTo: null });
  });

  it('routes a committed stage edit to the stage list, not the editor, while applying it', () => {
    setPath('/protocol/stage/stage-1');
    const store = seeded();
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));

    setPath('/protocol/codebook');
    const outcome = store.dispatch(undoWithNavigation());

    expect(navigate).toHaveBeenCalledWith('/protocol');
    expect(store.getState().activeProtocol.present?.name).toBe('Orig');
    expect(outcome).toEqual({ applied: true, navigatedTo: '/protocol' });
  });

  it('applies an experiments-page change without moving the researcher', () => {
    setPath('/protocol/experiments');
    const store = seeded();
    store.dispatch(
      actionCreators.updateProtocol({
        experiments: { encryptedVariables: true },
      }),
    );

    setPath('/protocol');
    const outcome = store.dispatch(undoWithNavigation());

    expect(navigate).not.toHaveBeenCalled();
    expect(
      store.getState().activeProtocol.present?.experiments,
    ).toBeUndefined();
    expect(outcome).toEqual({ applied: true, navigatedTo: null });
  });

  it('reverts path-less (legacy) entries in place', () => {
    const store = seeded(() => '');
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));

    setPath('/protocol/assets');
    const outcome = store.dispatch(undoWithNavigation());

    expect(navigate).not.toHaveBeenCalled();
    expect(store.getState().activeProtocol.present?.name).toBe('Orig');
    expect(outcome).toEqual({ applied: true, navigatedTo: null });
  });

  it('does nothing when there is nothing to undo', () => {
    setPath('/protocol/assets');
    const store = seeded();

    const outcome = store.dispatch(undoWithNavigation());

    expect(navigate).not.toHaveBeenCalled();
    expect(outcome).toEqual({ applied: false, navigatedTo: null });
  });

  // The pre-flight `getCanUndo` check and the timeline reducer's own guards are
  // kept in step, but the outcome is confirmed against observed state so a
  // refusal can never be reported — and therefore never announced — as applied.
  it('reports nothing applied when the timeline refuses the operation', () => {
    const state = {
      activeProtocol: {
        past: [{ name: 'Orig' }],
        present: { name: 'Renamed' },
        future: [],
        timeline: [{ id: 'a', path: '/protocol/codebook' }],
        futureTimeline: [],
      },
    } as unknown as RootState;
    // Records the action without ever changing state, standing in for a
    // reducer that declines to apply it.
    const dispatch = ((action: unknown) => action) as unknown as AppDispatch;

    const outcome = undoWithNavigation()(dispatch, () => state);

    expect(navigate).not.toHaveBeenCalled();
    expect(outcome).toEqual({ applied: false, navigatedTo: null });
  });
});

describe('redoWithNavigation', () => {
  beforeEach(() => {
    vi.mocked(navigate).mockClear();
    setPath('/protocol');
  });

  it('reapplies AND navigates in a single activation when the change lives on another page', () => {
    setPath('/protocol/assets');
    const store = seeded();
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));
    store.dispatch(undoWithNavigation());
    expect(store.getState().activeProtocol.present?.name).toBe('Orig');

    setPath('/protocol');
    vi.mocked(navigate).mockClear();
    const outcome = store.dispatch(redoWithNavigation());

    expect(navigate).toHaveBeenCalledWith('/protocol/assets');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(store.getState().activeProtocol.present?.name).toBe('Renamed');
    expect(outcome).toEqual({ applied: true, navigatedTo: '/protocol/assets' });
  });

  it('reapplies in place when the change lives on the current page', () => {
    setPath('/protocol/codebook');
    const store = seeded();
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));
    store.dispatch(undoWithNavigation());

    const outcome = store.dispatch(redoWithNavigation());

    expect(navigate).not.toHaveBeenCalled();
    expect(store.getState().activeProtocol.present?.name).toBe('Renamed');
    expect(outcome).toEqual({ applied: true, navigatedTo: null });
  });

  it('does nothing when there is nothing to redo', () => {
    setPath('/protocol/assets');
    const store = seeded();
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));

    const outcome = store.dispatch(redoWithNavigation());

    expect(navigate).not.toHaveBeenCalled();
    expect(store.getState().activeProtocol.present?.name).toBe('Renamed');
    expect(outcome).toEqual({ applied: false, navigatedTo: null });
  });

  // Finding 2 of the issue: Redo stayed disabled after a cross-page Undo,
  // because that Undo never moved the timeline.
  it('becomes available immediately after a cross-page undo', () => {
    setPath('/protocol/codebook');
    const store = seeded();
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));

    setPath('/protocol/assets');
    store.dispatch(undoWithNavigation());

    expect(store.getState().activeProtocol.future).toHaveLength(1);
  });
});

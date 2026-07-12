import {
  combineReducers,
  configureStore,
  type Middleware,
} from '@reduxjs/toolkit';
import {
  arrayPush,
  arraySplice,
  blur,
  change,
  initialize,
  reducer as formReducer,
} from 'redux-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import stageEditorDraft, {
  draftSnapshot,
  draftTimelineActions,
  setRestoring,
} from '../../modules/stageEditorDraft';
import { stageEditorDraftListenerMiddleware } from '../stageEditorDraftListener';

const FORM_NAME = 'edit-stage';

// The only reliable signal that the listener took a snapshot is a dispatched
// `draftSnapshot` action. (The underlying timeline reducer pushes a `past`
// entry for every form action that flows through it, so `past.length` is not a
// clean snapshot counter.) This middleware records the payload of each
// `draftSnapshot` so tests can assert on snapshot count and captured values.
const makeStore = () => {
  const snapshots: Stage[] = [];

  const recordSnapshots: Middleware = () => (next) => (action) => {
    if (draftSnapshot.match(action)) {
      snapshots.push(action.payload);
    }
    return next(action);
  };

  const reducer = combineReducers({
    form: formReducer,
    stageEditorDraft,
  });

  const store = configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false })
        .concat(recordSnapshots)
        .prepend(stageEditorDraftListenerMiddleware.middleware),
  });

  return { store, snapshots };
};

const getPresent = (store: ReturnType<typeof makeStore>['store']) =>
  store.getState().stageEditorDraft.history.present;

describe('stageEditorDraftListenerMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('seeds initial values on INITIALIZE without taking a snapshot', () => {
    const { store, snapshots } = makeStore();

    store.dispatch(initialize(FORM_NAME, { label: 'Initial' }));

    // No snapshot dispatched; the draft baseline is seeded via resetDraft.
    expect(snapshots).toHaveLength(0);
    expect(getPresent(store)).toEqual({ label: 'Initial' });
  });

  it('snapshots immediately for a bracketed CHANGE path', () => {
    const { store, snapshots } = makeStore();
    store.dispatch(initialize(FORM_NAME, { label: 'Initial', prompts: [] }));

    store.dispatch(
      change(FORM_NAME, 'prompts[0]', { id: 'p1', text: 'Prompt' }),
    );

    // Immediate: snapshot taken synchronously, before any debounce window.
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      prompts: [{ id: 'p1', text: 'Prompt' }],
    });
  });

  it('debounces a leaf CHANGE path', () => {
    const { store, snapshots } = makeStore();
    store.dispatch(initialize(FORM_NAME, { label: 'Initial' }));

    store.dispatch(change(FORM_NAME, 'label', 'Updated'));

    // No snapshot before the debounce window elapses.
    expect(snapshots).toHaveLength(0);

    vi.advanceTimersByTime(400);

    // Snapshot taken only after the 400ms debounce delay.
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ label: 'Updated' });
    expect(getPresent(store)).toMatchObject({ label: 'Updated' });
  });

  it('snapshots immediately on ARRAY_PUSH', () => {
    const { store, snapshots } = makeStore();
    store.dispatch(initialize(FORM_NAME, { label: 'Initial', prompts: [] }));

    store.dispatch(arrayPush(FORM_NAME, 'prompts', { id: 'p1' }));

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ prompts: [{ id: 'p1' }] });
  });

  it('snapshots an item replacement immediately on ARRAY_SPLICE', () => {
    const { store, snapshots } = makeStore();
    store.dispatch(
      initialize(FORM_NAME, { label: 'Initial', prompts: [{ id: 'p1' }] }),
    );

    store.dispatch(
      arraySplice(FORM_NAME, 'prompts', 0, 1, { id: 'p1', text: 'Updated' }),
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      prompts: [{ id: 'p1', text: 'Updated' }],
    });
  });

  it('flushes a pending debounce on BLUR and does not double-snapshot', () => {
    const { store, snapshots } = makeStore();
    store.dispatch(initialize(FORM_NAME, { label: 'Initial' }));

    store.dispatch(change(FORM_NAME, 'label', 'Updated'));
    expect(snapshots).toHaveLength(0);

    // BLUR flushes the pending debounced snapshot immediately.
    store.dispatch(blur(FORM_NAME, 'label', 'Updated'));
    expect(snapshots).toHaveLength(1);

    // Advancing past the window must not produce a second snapshot.
    vi.advanceTimersByTime(400);
    expect(snapshots).toHaveLength(1);
  });

  it('does nothing on BLUR when no debounce is pending', () => {
    const { store, snapshots } = makeStore();
    store.dispatch(initialize(FORM_NAME, { label: 'Initial' }));

    store.dispatch(blur(FORM_NAME, 'label', 'Initial'));

    expect(snapshots).toHaveLength(0);
  });

  it('cancels a pending leaf debounce when the draft is reset', () => {
    const { store, snapshots } = makeStore();
    store.dispatch(initialize(FORM_NAME, { label: 'Initial' }));

    // Arm a leaf CHANGE debounce.
    store.dispatch(change(FORM_NAME, 'label', 'Updated'));
    expect(snapshots).toHaveLength(0);

    // resetDraft dispatches draftTimelineActions.reset, which must cancel the
    // armed timer (commit/cancel/stage-switch path). Dispatch the action
    // directly here — it's exactly what the resetDraft thunk dispatches and
    // what the listener keys on.
    store.dispatch(draftTimelineActions.reset(null));

    const pastBefore = store.getState().stageEditorDraft.history.past?.length;

    vi.advanceTimersByTime(400);

    // No phantom snapshot fired after reset.
    expect(snapshots).toHaveLength(0);
    expect(store.getState().stageEditorDraft.history.past?.length).toBe(
      pastBefore,
    );
    expect(getPresent(store)).toBeNull();
  });

  it('dedups identical consecutive snapshots', () => {
    const { store, snapshots } = makeStore();
    store.dispatch(initialize(FORM_NAME, { label: 'Initial', prompts: [] }));

    // Two immediate bracketed CHANGEs producing identical resulting values.
    store.dispatch(
      change(FORM_NAME, 'prompts[0]', { id: 'p1', text: 'Prompt' }),
    );
    store.dispatch(
      change(FORM_NAME, 'prompts[0]', { id: 'p1', text: 'Prompt' }),
    );

    // Only the first snapshot is recorded; the duplicate is skipped.
    expect(snapshots).toHaveLength(1);
  });

  it('debounces a nested-leaf bracketed CHANGE path', () => {
    const { store, snapshots } = makeStore();
    store.dispatch(
      initialize(FORM_NAME, { label: 'Initial', panels: [{ title: '' }] }),
    );

    // A nested leaf (text after the last `]`) is per-keystroke and must
    // debounce, not snapshot immediately.
    store.dispatch(change(FORM_NAME, 'panels[0].title', 'Hello'));
    expect(snapshots).toHaveLength(0);

    vi.advanceTimersByTime(400);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ panels: [{ title: 'Hello' }] });
  });

  it('does not snapshot while restoring is true', () => {
    const { store, snapshots } = makeStore();
    store.dispatch(initialize(FORM_NAME, { label: 'Initial', prompts: [] }));
    store.dispatch(setRestoring(true));

    store.dispatch(change(FORM_NAME, 'label', 'Updated'));
    store.dispatch(
      change(FORM_NAME, 'prompts[0]', { id: 'p1', text: 'Prompt' }),
    );
    store.dispatch(arrayPush(FORM_NAME, 'prompts', { id: 'p2' }));
    vi.advanceTimersByTime(400);

    // The restoring guard suppresses every snapshot path.
    expect(snapshots).toHaveLength(0);
  });
});

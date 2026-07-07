import {
  combineReducers,
  configureStore,
  createAction,
  createReducer,
} from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import protocolValidationReducer from '../../modules/protocolValidation';

// The listener resolves the routing navigate() as a side-effect; stub it so the
// effect can run in jsdom without a real router.
vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}));

// Mock the underlying validator so each test controls success / failure /
// throw, while the real validateProtocolAsync thunk (which flips isValidating)
// still runs.
const validateProtocol = vi.fn();
vi.mock('@codaco/protocol-validation', () => ({
  validateProtocol: (...args: unknown[]) => validateProtocol(...args),
}));

// Minimal activeProtocol slice mirroring the shape the selectors read
// (present + timeline of Locus objects). setPresent simulates an edit landing.
type Locus = { id: string; path: string };
type Protocol = { name: string } | null;
type ActiveProtocolState = { present: Protocol; timeline: Locus[] };

const setPresent = createAction<{ present: Protocol; locusId: string }>(
  'test/setPresent',
);
const jump = createAction<string>('activeProtocol/jump');

const activeProtocolReducer = createReducer<ActiveProtocolState>(
  { present: null, timeline: [] },
  (builder) => {
    builder
      .addCase(setPresent, (state, action) => {
        state.present = action.payload.present;
        state.timeline.push({ id: action.payload.locusId, path: '/' });
      })
      .addCase(jump, (state, action) => {
        const idx = state.timeline.findIndex((e) => e.id === action.payload);
        if (idx !== -1) {
          state.timeline = state.timeline.slice(0, idx + 1);
        }
      });
  },
);

const dialogAdded = createAction<{ id: string }>('dialogs/addDialog');
const dialogClosed = createAction<string>('dialogs/closeDialog');

type DialogsState = { dialogs: { id: string }[] };
const dialogsReducer = createReducer<DialogsState>(
  { dialogs: [] },
  (builder) => {
    builder
      .addCase(dialogAdded, (state, action) => {
        state.dialogs.push({ id: action.payload.id });
      })
      .addCase(dialogClosed, (state, action) => {
        state.dialogs = state.dialogs.filter((d) => d.id !== action.payload);
      });
  },
);

const buildStore = async () => {
  // Fresh module state (lastValidLocusId / revalidatePending / invalidDialogId)
  // per test.
  vi.resetModules();
  const { protocolValidationListenerMiddleware } =
    await import('../protocolValidationListener');

  const rootReducer = combineReducers({
    activeProtocol: activeProtocolReducer,
    protocolValidation: protocolValidationReducer,
    dialogs: dialogsReducer,
  });

  return configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault().prepend(protocolValidationListenerMiddleware.middleware),
  });
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  validateProtocol.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('protocolValidationListener', () => {
  // #775: an edit landing while a validation is in flight must still be
  // validated, even when the in-flight validation THROWS/REJECTS.
  it('re-validates an edit that lands while an in-flight validation rejects (#775)', async () => {
    // First validation throws (thunk rejects); second (for the edit that landed
    // mid-run) resolves cleanly.
    validateProtocol
      .mockRejectedValueOnce(new Error('internal validator error'))
      .mockResolvedValueOnce({ success: true });

    const store = await buildStore();

    // Edit 1 kicks off validation.
    store.dispatch(setPresent({ present: { name: 'p1' }, locusId: 'L1' }));

    // While validation is in flight, edit 2 lands -> revalidatePending.
    await Promise.resolve();
    store.dispatch(setPresent({ present: { name: 'p2' }, locusId: 'L2' }));

    await flush();
    await flush();

    // The second edit must have been validated despite the first run throwing.
    expect(validateProtocol).toHaveBeenCalledTimes(2);
    expect(validateProtocol).toHaveBeenLastCalledWith({ name: 'p2' });
  });

  // #776: a valid newer edit that lands during an invalid edit's validation
  // must NOT be reverted, and its later success must dismiss the stale dialog.
  it('does not revert a valid newer edit and dismisses the stale dialog (#776)', async () => {
    // Establish a known-valid baseline (L0), then an invalid edit (L1), then a
    // valid newer edit (L2) landing during L1's validation.
    validateProtocol
      .mockResolvedValueOnce({ success: true }) // L0 valid baseline
      .mockResolvedValueOnce({ success: false, error: 'bad' }) // L1 invalid
      .mockResolvedValueOnce({ success: true }); // L2 valid

    const store = await buildStore();

    store.dispatch(setPresent({ present: { name: 'p0' }, locusId: 'L0' }));
    await flush();
    await flush();

    // Invalid edit L1.
    store.dispatch(setPresent({ present: { name: 'p1' }, locusId: 'L1' }));
    // Valid newer edit L2 lands during L1's in-flight validation.
    await Promise.resolve();
    store.dispatch(setPresent({ present: { name: 'p2' }, locusId: 'L2' }));

    await flush();
    await flush();
    await flush();

    // All three validations ran; L2 (valid) is the latest.
    expect(validateProtocol).toHaveBeenCalledTimes(3);

    // The stale invalid-protocol dialog must have been dismissed by L2's
    // success, so no dialog remains open.
    expect(store.getState().dialogs.dialogs).toHaveLength(0);

    // The valid newer edit L2 must still be the timeline head (not reverted).
    const { timeline } = store.getState().activeProtocol;
    expect(timeline[timeline.length - 1]?.id).toBe('L2');
  });
});

import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app, {
  getProtocolLockState,
  setActiveProtocolId,
} from '~/ducks/modules/app';
import protocols from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';
import stageEditorDraft, {
  draftTimelineActions,
  setLiveValues,
  type StageEditorDraftPresent,
} from '~/ducks/modules/stageEditorDraft';
import { getLiveStageDraftDirty } from '~/selectors/stageEditorDraft';
import type { ProtocolTabLock } from '~/utils/protocolTabLock';

import { useProtocolTabLock } from '../useProtocolTabLock';

const { mockLocation, mockBrowserNavigate } = vi.hoisted(() => ({
  mockLocation: vi.fn<() => string>(() => '/protocol'),
  mockBrowserNavigate: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => [mockLocation(), vi.fn()],
}));

vi.mock('wouter/use-browser-location', () => ({
  navigate: mockBrowserNavigate,
}));

// Only isProtocolPath is used; stub it so the test doesn't pull the real store
// (useProtocolNavGuard imports it at module scope).
vi.mock('~/hooks/useProtocolNavGuard', () => ({
  isProtocolPath: (path: string) => path.startsWith('/protocol'),
}));

const makeFakeLock = () => {
  let onExclusivityChange: ((exclusive: boolean) => void) | undefined;
  const claims: string[] = [];
  const releases: number[] = [];
  let closed = 0;

  const lock: ProtocolTabLock = {
    claimProtocol: (id: string) => {
      claims.push(id);
    },
    releaseProtocol: () => {
      releases.push(1);
    },
    isExclusive: () => true,
    close: () => {
      closed += 1;
    },
  };

  const factory = (opts: {
    onExclusivityChange: (exclusive: boolean) => void;
  }) => {
    onExclusivityChange = opts.onExclusivityChange;
    return lock;
  };

  return {
    factory,
    claims,
    releases,
    get closed() {
      return closed;
    },
    fireExclusivity: (exclusive: boolean) => onExclusivityChange?.(exclusive),
  };
};

const protocol: CurrentProtocol = {
  name: 'Test Protocol',
  schemaVersion: 8,
  stages: [],
  codebook: {},
};

// What the OTHER tab saved while this one was demoted. The refresh replaces the
// whole editing buffer with it.
const savedProtocol: CurrentProtocol = {
  ...protocol,
  name: 'Test Protocol, edited elsewhere',
};

const stage = { id: 'stage-1', type: 'Information', label: 'A' } as Stage;

// The draft as the stage editor opens it: the committed stage plus the editor's
// private copy of the codebook it opened on (#1382).
const draftPresent: StageEditorDraftPresent = {
  stage,
  codebook: protocol.codebook,
};

const editedStage = { ...stage, label: 'A, edited' } as Stage;

const createTestStore = () =>
  configureStore({
    reducer: combineReducers({
      app,
      protocols,
      protocolValidation,
      stageEditorDraft,
      activeProtocol: createTimeline(activeProtocol),
    }),
  });

type TestStore = ReturnType<typeof createTestStore>;

// The real `restoreActiveProtocolFromLibrary` replaces the editing buffer with
// the canonical row, which is precisely what closes any transaction taken from
// the previous one. Stubbing that away is what let the draft-wipe through.
const makeRefresh = () =>
  vi.fn(async (store: TestStore) => {
    store.dispatch(setActiveProtocol(savedProtocol));
    return 'restored';
  });

// Opens a stage editor draft and puts a real edit into it, the way the stage
// form bridge does: seed the baseline, then mirror changed form values.
const openDirtyStageDraft = (store: TestStore) => {
  store.dispatch(draftTimelineActions.reset(draftPresent));
  store.dispatch(setLiveValues(editedStage));
};

const renderTabLock = (
  fakeFactory: ReturnType<typeof makeFakeLock>['factory'],
  refreshActiveProtocol = makeRefresh(),
) => {
  const store = createTestStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const view = renderHook(
    () =>
      useProtocolTabLock(
        fakeFactory,
        refreshActiveProtocol as unknown as Parameters<
          typeof useProtocolTabLock
        >[1],
      ),
    { wrapper },
  );
  return { store, refreshActiveProtocol, ...view };
};

describe('useProtocolTabLock', () => {
  beforeEach(() => {
    mockLocation.mockReturnValue('/protocol');
    mockBrowserNavigate.mockClear();
  });

  it('claims the active protocol while on a /protocol route', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    const { store } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });

    expect(fake.claims).toEqual(['p1']);
  });

  it('does NOT claim on Home even when a protocol is active — and releases', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/');
    const { store } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });

    expect(fake.claims).toEqual([]);
    expect(fake.releases.length).toBeGreaterThanOrEqual(1);
  });

  it('releases the lock when navigating from the editor back to Home', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    const { store, rerender } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });
    expect(fake.claims).toEqual(['p1']);

    const releasesBefore = fake.releases.length;
    mockLocation.mockReturnValue('/');
    act(() => {
      rerender();
    });

    expect(fake.releases.length).toBeGreaterThan(releasesBefore);
  });

  it('does not re-claim when navigating between /protocol sub-routes', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    const { store, rerender } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });
    expect(fake.claims).toEqual(['p1']);

    mockLocation.mockReturnValue('/protocol/assets');
    act(() => {
      rerender();
    });

    expect(fake.claims).toEqual(['p1']);
  });

  it('claims when a protocol becomes active while already on the editor (reload)', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    const { store } = renderTabLock(fake.factory);
    // No id yet (mimics rehydrate not landed).
    expect(fake.claims).toEqual([]);

    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });

    expect(fake.claims).toEqual(['p1']);
  });

  it('records that another tab holds the protocol when exclusivity is lost', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    const { store } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });
    expect(getProtocolLockState(store.getState())).toBe('owned');

    act(() => {
      fake.fireExclusivity(false);
    });
    expect(getProtocolLockState(store.getState())).toBe('open-elsewhere');
  });

  // The demoted tab's buffer is a snapshot from before the other tab took over.
  // Editing must not resume against it: the first commit would `put` the whole
  // row and delete asset blobs the other tab added in the meantime.
  it('re-reads the canonical row before editing resumes on a re-claim', async () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    window.history.replaceState(null, '', '/protocol');
    const { store, refreshActiveProtocol } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });
    act(() => {
      fake.fireExclusivity(false);
    });

    await act(async () => {
      fake.fireExclusivity(true);
      await Promise.resolve();
    });

    expect(refreshActiveProtocol).toHaveBeenCalledTimes(1);
    expect(getProtocolLockState(store.getState())).toBe('owned');
  });

  it('does not pull a protocol back in when the release came from leaving the editor', async () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    window.history.replaceState(null, '', '/protocol');
    const { store, refreshActiveProtocol } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });
    act(() => {
      fake.fireExclusivity(false);
    });

    window.history.replaceState(null, '', '/');
    await act(async () => {
      fake.fireExclusivity(true);
      await Promise.resolve();
    });

    expect(refreshActiveProtocol).not.toHaveBeenCalled();
    expect(getProtocolLockState(store.getState())).toBe('owned');
  });

  // Reloading the saved copy replaces the whole editing buffer, and a stage
  // editor draft is a transaction taken FROM that buffer — so the reload closes
  // it (#1382). Doing that behind the researcher's back throws away the very
  // work the demotion banner told them to close the other tab to keep.
  it('does not discard an in-progress stage draft when the other tab closes', async () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    window.history.replaceState(null, '', '/protocol/stage/stage-1');
    const { store, refreshActiveProtocol } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
      store.dispatch(setActiveProtocol(protocol));
    });
    act(() => {
      openDirtyStageDraft(store);
    });
    act(() => {
      fake.fireExclusivity(false);
    });
    expect(getLiveStageDraftDirty(store.getState())).toBe(true);

    await act(async () => {
      fake.fireExclusivity(true);
      await Promise.resolve();
    });

    // The draft is still there, and still dirty: nothing was decided for the
    // researcher.
    expect(store.getState().stageEditorDraft.history.present).not.toBeNull();
    expect(getLiveStageDraftDirty(store.getState())).toBe(true);
    expect(refreshActiveProtocol).not.toHaveBeenCalled();
  });

  // Refreshing would also promote this tab to editable, so a commit could then
  // write this tab's pre-demotion buffer — plus the draft's whole-codebook
  // replacement — over what the other tab saved.
  it('does not re-enable saving while the draft conflict is unresolved', async () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    window.history.replaceState(null, '', '/protocol/stage/stage-1');
    const { store } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
      store.dispatch(setActiveProtocol(protocol));
    });
    act(() => {
      openDirtyStageDraft(store);
    });
    act(() => {
      fake.fireExclusivity(false);
    });

    await act(async () => {
      fake.fireExclusivity(true);
      await Promise.resolve();
    });

    expect(getProtocolLockState(store.getState())).toBe('reclaim-blocked');
    // The buffer is still this tab's own, un-refreshed copy — the other tab's
    // saved edits have not been pulled in and have not been overwritten.
    expect(store.getState().activeProtocol?.present?.name).toBe(
      'Test Protocol',
    );
  });

  // Once the researcher has answered — here by discarding — the reclaim the
  // peer's release started must actually finish, or the tab stays read-only
  // with no other tab to blame.
  it('finishes the reclaim once the draft that blocked it is gone', async () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    window.history.replaceState(null, '', '/protocol/stage/stage-1');
    const { store, refreshActiveProtocol } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
      store.dispatch(setActiveProtocol(protocol));
    });
    act(() => {
      openDirtyStageDraft(store);
    });
    act(() => {
      fake.fireExclusivity(false);
    });
    await act(async () => {
      fake.fireExclusivity(true);
      await Promise.resolve();
    });
    expect(refreshActiveProtocol).not.toHaveBeenCalled();

    await act(async () => {
      store.dispatch(draftTimelineActions.reset(null));
      await Promise.resolve();
    });

    expect(refreshActiveProtocol).toHaveBeenCalledTimes(1);
    expect(getProtocolLockState(store.getState())).toBe('owned');
    expect(store.getState().activeProtocol?.present?.name).toBe(
      'Test Protocol, edited elsewhere',
    );
  });

  // A pristine editor has nothing to weigh against the saved copy, but it still
  // cannot survive the reload: replacing the buffer empties the draft's
  // baseline, leaving a mounted form that reports itself unchanged and can
  // never be saved. Close it and return to the stage list instead.
  it('closes a pristine stage editor rather than reloading underneath it', async () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    window.history.replaceState(null, '', '/protocol/stage/stage-1');
    const { store, refreshActiveProtocol } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
      store.dispatch(setActiveProtocol(protocol));
    });
    act(() => {
      // Seeded, never typed into.
      store.dispatch(draftTimelineActions.reset(draftPresent));
    });
    act(() => {
      fake.fireExclusivity(false);
    });
    expect(getLiveStageDraftDirty(store.getState())).toBe(false);

    await act(async () => {
      fake.fireExclusivity(true);
      await Promise.resolve();
    });

    expect(refreshActiveProtocol).toHaveBeenCalledTimes(1);
    expect(store.getState().stageEditorDraft.history.present).toBeNull();
    expect(mockBrowserNavigate).toHaveBeenCalledWith('/protocol', {
      replace: true,
    });
    expect(getProtocolLockState(store.getState())).toBe('owned');
  });

  // A draft undone all the way back to the values the editor opened on leaves
  // nothing to weigh against the saved copy. Waiting for the draft to be
  // *gone* would leave the tab refusing every write forever, with no other tab
  // to blame and a banner describing changes that no longer exist.
  it('finishes the reclaim once the draft is undone back to clean', async () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    window.history.replaceState(null, '', '/protocol/stage/stage-1');
    const { store, refreshActiveProtocol } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
      store.dispatch(setActiveProtocol(protocol));
    });
    act(() => {
      openDirtyStageDraft(store);
    });
    act(() => {
      fake.fireExclusivity(false);
    });
    await act(async () => {
      fake.fireExclusivity(true);
      await Promise.resolve();
    });
    expect(getProtocolLockState(store.getState())).toBe('reclaim-blocked');

    await act(async () => {
      // The undo itself: the form is back at the values it opened on, so the
      // bridge mirrors those. The draft session is still open.
      store.dispatch(setLiveValues(stage));
      await Promise.resolve();
    });

    expect(getLiveStageDraftDirty(store.getState())).toBe(false);
    expect(refreshActiveProtocol).toHaveBeenCalledTimes(1);
    expect(getProtocolLockState(store.getState())).toBe('owned');
  });

  // The canonical read is asynchronous, so a peer can take the protocol back
  // while it is in flight. Promoting afterwards regardless would leave both
  // tabs believing they own the one library row, and both autosaving into it.
  it('does not hand editing back if a peer took the protocol during the refresh', async () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    window.history.replaceState(null, '', '/protocol');
    let releaseRefresh: () => void = () => undefined;
    const refresh = vi.fn(async (currentStore: TestStore) => {
      await new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
      currentStore.dispatch(setActiveProtocol(savedProtocol));
      return 'restored';
    });
    const { store } = renderTabLock(fake.factory, refresh);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
      store.dispatch(setActiveProtocol(protocol));
    });
    act(() => {
      fake.fireExclusivity(false);
    });
    act(() => {
      fake.fireExclusivity(true);
    });
    // A peer claims it back while the canonical read is still in flight.
    act(() => {
      fake.fireExclusivity(false);
    });
    expect(getProtocolLockState(store.getState())).toBe('open-elsewhere');

    await act(async () => {
      releaseRefresh();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getProtocolLockState(store.getState())).toBe('open-elsewhere');
  });

  it('closes the lock on unmount', () => {
    const fake = makeFakeLock();
    const { unmount } = renderTabLock(fake.factory);

    unmount();

    expect(fake.closed).toBe(1);
  });
});

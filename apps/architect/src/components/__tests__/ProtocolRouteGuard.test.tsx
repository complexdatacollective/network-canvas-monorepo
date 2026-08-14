import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app, { setProtocolLockState } from '~/ducks/modules/app';
import protocols from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';
import stageEditorDraft, {
  draftTimelineActions,
  setLiveValues,
  type StageEditorDraftPresent,
} from '~/ducks/modules/stageEditorDraft';
import { guardState } from '~/hooks/useProtocolNavGuard';
import { getLiveStageDraftDirty } from '~/selectors/stageEditorDraft';

import ProtocolRouteGuard from '../ProtocolRouteGuard';

const { mockLocation, mockBrowserNavigate } = vi.hoisted(() => ({
  mockLocation: vi.fn<() => string>(),
  mockBrowserNavigate: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => [mockLocation(), vi.fn()],
}));

vi.mock('wouter/use-browser-location', () => ({
  navigate: mockBrowserNavigate,
}));

vi.mock('~/components/pages/SummaryPage', () => ({
  default: () => <div data-testid="read-only-summary">Summary</div>,
}));

vi.mock('~/components/ProjectNav/ProjectLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const protocol: CurrentProtocol = {
  name: 'Test Protocol',
  schemaVersion: 8,
  stages: [],
  codebook: {},
};

const stage = { id: 'stage-1', type: 'Information', label: 'A' } as Stage;

// The draft as the stage editor opens it: the committed stage plus the editor's
// private copy of the codebook it opened on (#1382).
const draftPresent: StageEditorDraftPresent = {
  stage,
  codebook: protocol.codebook,
};

// What the form holds after the researcher has typed into it. Genuinely
// different from the seeded baseline, so `getLiveStageDraftDirty` — a deep
// comparison of the live mirror against that baseline — reports dirty.
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

// Opens a stage editor draft and puts a real edit into it, the way the stage
// form bridge does: seed the baseline, then mirror changed form values.
const openDirtyStageDraft = (store: TestStore) => {
  store.dispatch(draftTimelineActions.reset(draftPresent));
  store.dispatch(setLiveValues(editedStage));
};

const renderGuard = (store: TestStore) =>
  render(
    <Provider store={store}>
      <ProtocolRouteGuard>
        <div data-testid="editor">Editor</div>
      </ProtocolRouteGuard>
    </Provider>,
  );

describe('ProtocolRouteGuard', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
    mockLocation.mockReturnValue('/protocol');
    mockBrowserNavigate.mockClear();
    guardState.bypass = false;
  });

  it('renders the route when this tab holds an editable protocol', () => {
    store.dispatch(setActiveProtocol(protocol));

    renderGuard(store);

    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(mockBrowserNavigate).not.toHaveBeenCalled();
  });

  it('leaves for the start screen, rendering nothing, when no protocol is open', () => {
    const { container } = renderGuard(store);

    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    // The raw browser-location navigate, so the redirect does not pass through
    // the Router's aroundNav and raise the leave-editor confirmation.
    expect(mockBrowserNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it.each([
    '/protocol/codebook',
    '/protocol/assets',
    '/protocol/summary',
    '/protocol/stage/new',
    '/protocol/experiments',
  ])('blocks %s when no protocol is open', (path) => {
    mockLocation.mockReturnValue(path);

    const { container } = renderGuard(store);

    expect(container).toBeEmptyDOMElement();
    expect(mockBrowserNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('does not redirect during a confirmed leave, which collapses the history itself', () => {
    guardState.bypass = true;

    renderGuard(store);

    expect(mockBrowserNavigate).not.toHaveBeenCalled();
  });

  it('leaves non-protocol routes alone', () => {
    mockLocation.mockReturnValue('/');

    renderGuard(store);

    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(mockBrowserNavigate).not.toHaveBeenCalled();
  });

  it('replaces the editor with the read-only view when the protocol is open in another tab', () => {
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuard(store);

    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(screen.getByTestId('read-only-summary')).toBeInTheDocument();
    // The URL is the user's; losing the lock must not also move them.
    expect(mockBrowserNavigate).not.toHaveBeenCalled();
  });

  it('keeps the stage editor mounted when the tab is demoted while editing a stage', () => {
    store.dispatch(setActiveProtocol(protocol));
    openDirtyStageDraft(store);
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    store.dispatch(setProtocolLockState('open-elsewhere'));

    // The precondition this test exists to cover: there really is unsaved work
    // in the editor at the moment the lock is lost.
    expect(getLiveStageDraftDirty(store.getState())).toBe(true);

    renderGuard(store);

    // A stage draft exists nowhere else: replacing the editor underneath it
    // would be the silent discard this guard exists to prevent.
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.queryByTestId('read-only-summary')).not.toBeInTheDocument();
  });

  // Keyed on the route rather than on the draft being dirty: dirtiness is a deep
  // comparison of the live form values against the values the editor opened on
  // (`getLiveStageDraftDirty`), so it flips back to clean the moment the user
  // undoes to the committed values — which would tear the editor away (and its
  // redo history with it) mid-edit.
  it('keeps the stage editor mounted after the draft is undone back to clean', () => {
    store.dispatch(setActiveProtocol(protocol));
    openDirtyStageDraft(store);
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    store.dispatch(setProtocolLockState('open-elsewhere'));

    expect(getLiveStageDraftDirty(store.getState())).toBe(true);

    renderGuard(store);
    expect(screen.getByTestId('editor')).toBeInTheDocument();

    act(() => {
      // The undo itself: the form is back at the values it opened on, so the
      // bridge mirrors those. Deliberately not a second `reset` — that would
      // move the baseline instead of moving the values back to it, and would
      // report clean even if the form still held the edit.
      store.dispatch(setLiveValues(stage));
    });

    expect(getLiveStageDraftDirty(store.getState())).toBe(false);
    expect(screen.getByTestId('editor')).toBeInTheDocument();
  });

  // Dialogs are portalled outside the route tree, so an editor dialog open at
  // the moment the lock is lost would survive the swap with a confirm that
  // writes into a protocol this tab no longer owns.
  it('dismisses open dialogs when the editor is replaced by the read-only view', () => {
    const closeAllDialogs = globalThis.__architectDialogMocks.closeAllDialogs;
    store.dispatch(setActiveProtocol(protocol));

    renderGuard(store);
    expect(closeAllDialogs).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });

    expect(closeAllDialogs).toHaveBeenCalledTimes(1);
  });

  it('leaves dialogs alone on a first render that is already read-only', () => {
    const closeAllDialogs = globalThis.__architectDialogMocks.closeAllDialogs;
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));

    renderGuard(store);

    expect(closeAllDialogs).not.toHaveBeenCalled();
  });

  it('shows the read-only view everywhere outside the stage editor', () => {
    store.dispatch(setActiveProtocol(protocol));
    openDirtyStageDraft(store);
    mockLocation.mockReturnValue('/protocol');
    store.dispatch(setProtocolLockState('open-elsewhere'));

    // A dirty draft is not the exemption — the route is. Off the stage editor
    // route, an unsaved draft does not hold the editor open.
    expect(getLiveStageDraftDirty(store.getState())).toBe(true);

    renderGuard(store);

    expect(screen.getByTestId('read-only-summary')).toBeInTheDocument();
  });
});

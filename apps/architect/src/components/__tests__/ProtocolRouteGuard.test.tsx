import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import { useNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import { routeFocusTargetProps } from '~/components/RouteFocus';
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
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
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

// A nested editor dialog as the routes really render it: from INSIDE the route
// tree. Its draft lives in its own form store, and its own discard confirmation
// only ever runs through `closeDialog` — an unmount takes the values with no
// question asked at all.
const NestedEditor = ({ dirty }: { dirty: boolean }) => {
  useNestedDraft(true, () => dirty);
  return <div data-testid="nested-editor">Editor dialog</div>;
};

const renderGuardWithNestedEditor = (store: TestStore, dirty = true) =>
  render(
    <Provider store={store}>
      <ProtocolRouteGuard>
        <div data-testid="editor">Editor</div>
        <NestedEditor dirty={dirty} />
      </ProtocolRouteGuard>
    </Provider>,
  );

const ROUTE_TITLE = 'Codebook';

// Stands in for ProtocolLockBanner, which App renders as a sibling above the
// routes. What matters here is its lifecycle, not its copy: it exists only in
// read-only mode, takes focus when it arrives (so the researcher is not left on
// `<body>` when the editor is replaced), and unmounts the moment the lock comes
// back — taking focus with it.
const LockBanner = () => {
  const mode = useProtocolAccessMode();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== 'read-only') return;
    ref.current?.focus();
  }, [mode]);

  if (mode !== 'read-only') return null;
  return <div ref={ref} tabIndex={-1} data-testid="lock-banner" />;
};

// The restored editor as the real routes render it: a heading carrying the
// route's landing point, which is what focus has to end up on.
const renderGuardWithBanner = (store: TestStore, children?: ReactNode) =>
  render(
    <Provider store={store}>
      <LockBanner />
      <ProtocolRouteGuard>
        <h1 {...routeFocusTargetProps}>{ROUTE_TITLE}</h1>
        <div data-testid="editor">Editor</div>
        {children}
      </ProtocolRouteGuard>
    </Provider>,
  );

const routeHeading = () =>
  screen.getByRole('heading', { level: 1, name: ROUTE_TITLE });

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

  // The other tab closed, so this one reclaimed the lock: the read-only view is
  // replaced by the editor and the banner that held focus unmounts. RouteFocus
  // is keyed on the location, which this transition does not change, so nothing
  // else can put the researcher back into the restored page.
  it('lands focus on the restored route when the other tab releases the lock', () => {
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuardWithBanner(store);

    // The precondition: focus is on the banner, and the editor — heading and
    // all — is not on the page at all.
    expect(screen.getByTestId('lock-banner')).toHaveFocus();
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();

    act(() => {
      store.dispatch(setProtocolLockState('owned'));
    });

    expect(screen.queryByTestId('lock-banner')).not.toBeInTheDocument();
    expect(routeHeading()).toHaveFocus();
  });

  // Same narrowness as RouteFocus: the restored editor may focus something of
  // its own (the stage editor autofocuses its name input on a new stage), and
  // dragging the researcher back to the heading would undo it.
  it('leaves a control that took focus in the restored route alone', () => {
    const Autofocusing = () => {
      const ref = useRef<HTMLButtonElement>(null);
      useEffect(() => {
        ref.current?.focus();
      }, []);
      return (
        <button ref={ref} type="button">
          Stage name
        </button>
      );
    };
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuardWithBanner(store, <Autofocusing />);

    act(() => {
      store.dispatch(setProtocolLockState('owned'));
    });

    expect(screen.getByRole('button', { name: 'Stage name' })).toHaveFocus();
    expect(routeHeading()).not.toHaveFocus();
  });

  it('leaves dialogs alone on a first render that is already read-only', () => {
    const closeAllDialogs = globalThis.__architectDialogMocks.closeAllDialogs;
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));

    renderGuard(store);

    expect(closeAllDialogs).not.toHaveBeenCalled();
  });

  // The demote path's own silent discard (#1387): a variable or entity-type
  // editor open over the Codebook is rendered from the route tree, so replacing
  // that tree unmounts it — `handleClose` never runs, and
  // `confirmDiscardNestedDraft` never asks.
  it('keeps a dirty nested editor mounted when the tab is demoted outside the stage editor', () => {
    store.dispatch(setActiveProtocol(protocol));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuardWithNestedEditor(store);
    expect(screen.getByTestId('nested-editor')).toBeInTheDocument();

    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });

    expect(screen.getByTestId('nested-editor')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.queryByTestId('read-only-summary')).not.toBeInTheDocument();
  });

  // Keyed on an editor being OPEN rather than on its draft being dirty, for the
  // same reason `held-stage-editor` is keyed on the route: dirtiness is
  // recomputed on every render, so an editor cleared back to empty would vanish
  // from under the researcher at the next unrelated re-render. Being open only
  // changes when they open or close one.
  it('keeps a pristine nested editor mounted too, rather than deciding by dirtiness', () => {
    store.dispatch(setActiveProtocol(protocol));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuardWithNestedEditor(store, false);

    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });

    expect(screen.getByTestId('nested-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('read-only-summary')).not.toBeInTheDocument();
  });

  // Once the researcher has dealt with the editor, there is nothing left that
  // the read-only view would take — so the swap that was held finally happens.
  it('shows the read-only view once the nested editor is closed', () => {
    store.dispatch(setActiveProtocol(protocol));
    mockLocation.mockReturnValue('/protocol/codebook');

    const { rerender } = renderGuardWithNestedEditor(store);
    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });
    expect(screen.getByTestId('nested-editor')).toBeInTheDocument();

    // The researcher answers the editor's own discard confirmation, and it
    // closes.
    act(() => {
      rerender(
        <Provider store={store}>
          <ProtocolRouteGuard>
            <div data-testid="editor">Editor</div>
          </ProtocolRouteGuard>
        </Provider>,
      );
    });

    expect(screen.getByTestId('read-only-summary')).toBeInTheDocument();
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

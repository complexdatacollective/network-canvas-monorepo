import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import { useNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import { routeFocusTargetProps } from '~/components/RouteFocus';
import {
  closeStageDraft,
  publishStageDraft,
  readStageDraft,
} from '~/components/StageEditor/stageDraftBeacon';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app, { setProtocolLockState } from '~/ducks/modules/app';
import protocols from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import { guardState } from '~/hooks/useProtocolNavGuard';
import { useProtocolReadOnly } from '~/hooks/useProtocolReadOnly';

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

const protocol: CurrentProtocol = {
  name: 'Test Protocol',
  schemaVersion: 8,
  stages: [],
  codebook: {},
};

const stage = { id: 'stage-1', type: 'Information', label: 'A' } as Stage;

// What the form holds after the researcher has typed into it. Genuinely
// different from the document the editor opened on, so the beacon reports
// dirty.
const editedStage = { ...stage, label: 'A, edited' } as Stage;

const createTestStore = () =>
  configureStore({
    reducer: combineReducers({
      app,
      protocols,
      protocolValidation,
      activeProtocol: createTimeline(activeProtocol),
    }),
  });

type TestStore = ReturnType<typeof createTestStore>;

// A stage editor holding a real edit, exactly as its own chrome publishes one.
const openDirtyStageDraft = () => {
  publishStageDraft(editedStage, { label: 'A' }, { label: 'A, edited' }, true);
};

// A stage editor opened while another tab held the protocol: never granted its
// stage, so it holds nothing of the researcher's.
const openReadOnlyStageEditor = () => {
  publishStageDraft(stage, { label: 'A' }, { label: 'A' }, false);
};

// A page as the routes render one: it asks the guard whether to offer editing.
const Editor = () => (
  <div data-testid="editor" data-read-only={String(useProtocolReadOnly())}>
    Editor
  </div>
);

const expectReadOnly = (readOnly: boolean) => {
  expect(screen.getByTestId('editor')).toHaveAttribute(
    'data-read-only',
    String(readOnly),
  );
};

const renderGuard = (store: TestStore) =>
  render(
    <Provider store={store}>
      <ProtocolRouteGuard>
        <Editor />
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
        <Editor />
        <NestedEditor dirty={dirty} />
      </ProtocolRouteGuard>
    </Provider>,
  );

const ROUTE_TITLE = 'Codebook';

// Stands in for ProtocolLockBanner, which App renders as a sibling above the
// routes. What matters here is its lifecycle, not its copy: it exists only in
// read-only mode, takes focus when it arrives (so the researcher is not left on
// `<body>` when the control they were using is disabled), and unmounts the
// moment the lock comes back — taking focus with it.
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

// The page as the real routes render it: a heading carrying the route's
// landing point, which is what focus has to end up on.
const renderGuardWithBanner = (store: TestStore, children?: ReactNode) =>
  render(
    <Provider store={store}>
      <LockBanner />
      <ProtocolRouteGuard>
        <h1 {...routeFocusTargetProps}>{ROUTE_TITLE}</h1>
        <Editor />
        {children}
      </ProtocolRouteGuard>
    </Provider>,
  );

const routeHeading = () =>
  screen.getByRole('heading', { level: 1, name: ROUTE_TITLE });

describe('ProtocolRouteGuard', () => {
  let store: TestStore;

  beforeEach(() => {
    closeStageDraft();
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

  it('renders the route as it is, but read-only, when the protocol is open in another tab', () => {
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuard(store);

    expectReadOnly(true);
    // The URL is the user's; losing the lock must not also move them.
    expect(mockBrowserNavigate).not.toHaveBeenCalled();
  });

  it('offers editing while this tab holds the protocol', () => {
    store.dispatch(setActiveProtocol(protocol));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuard(store);

    expectReadOnly(false);
  });

  it('stays read-only while the reclaim waits on a draft conflict', () => {
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuard(store);

    expectReadOnly(true);
  });

  it('keeps a stage editor that was editing operable when the tab is demoted', () => {
    store.dispatch(setActiveProtocol(protocol));
    openDirtyStageDraft();
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    store.dispatch(setProtocolLockState('open-elsewhere'));

    // The precondition this test exists to cover: there really is unsaved work
    // in the editor at the moment the lock is lost.
    expect(readStageDraft().dirty).toBe(true);

    renderGuard(store);

    // A stage draft exists nowhere else: making the editor read-only
    // underneath it would leave the researcher unable to deal with it.
    expectReadOnly(false);
  });

  // Keyed on the editor having been granted its stage rather than on the draft
  // being dirty: dirtiness is a deep comparison of the live form values against
  // the values the editor opened on, so it flips back to clean the moment the
  // user undoes to the committed values — which would freeze the editor (and
  // its redo history with it) mid-edit.
  it('keeps that stage editor operable after the draft is undone back to clean', () => {
    store.dispatch(setActiveProtocol(protocol));
    openDirtyStageDraft();
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    store.dispatch(setProtocolLockState('open-elsewhere'));

    renderGuard(store);
    expectReadOnly(false);

    act(() => {
      // The undo itself: the form is back at the values it opened on, and the
      // editor publishes those. Deliberately against the SAME baseline — a
      // published pair whose baseline had moved too would report clean even if
      // the form still held the edit.
      publishStageDraft(stage, { label: 'A' }, { label: 'A' }, true);
    });

    expect(readStageDraft().dirty).toBe(false);
    expectReadOnly(false);
  });

  it('makes a stage editor opened while another tab held the protocol read-only', () => {
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));
    openReadOnlyStageEditor();
    mockLocation.mockReturnValue('/protocol/stage/stage-1');

    renderGuard(store);

    expectReadOnly(true);
  });

  // Dialogs are portalled outside the route tree, so a confirmation open at the
  // moment the lock is lost would survive the switch with a confirm that writes
  // into a protocol this tab no longer owns.
  it('dismisses open dialogs when the page becomes read-only', () => {
    const closeAllDialogs = globalThis.__architectDialogMocks.closeAllDialogs;
    store.dispatch(setActiveProtocol(protocol));

    renderGuard(store);
    expect(closeAllDialogs).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });

    expect(closeAllDialogs).toHaveBeenCalledTimes(1);
    expectReadOnly(true);
  });

  // The other tab let the protocol go, so this one reclaimed it: the page stays
  // where it is and becomes editable, and the banner that held focus unmounts.
  // RouteFocus is keyed on the location, which this transition does not change,
  // so nothing else would put the researcher back into the page.
  it('lands focus on the route heading when the lock comes back while the banner has focus', () => {
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuardWithBanner(store);

    expect(screen.getByTestId('lock-banner')).toHaveFocus();
    expectReadOnly(true);

    act(() => {
      store.dispatch(setProtocolLockState('owned'));
    });

    expect(screen.queryByTestId('lock-banner')).not.toBeInTheDocument();
    expectReadOnly(false);
    expect(routeHeading()).toHaveFocus();
  });

  // The researcher has moved on from the banner to look through the page;
  // dragging them back to the heading would lose their place.
  it('leaves focus where the researcher put it when the lock comes back', () => {
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuardWithBanner(
      store,
      <a href="#stage-1" data-testid="page-link">
        Stage 1
      </a>,
    );
    act(() => {
      screen.getByTestId('page-link').focus();
    });

    act(() => {
      store.dispatch(setProtocolLockState('owned'));
    });

    expect(screen.getByTestId('page-link')).toHaveFocus();
    expect(routeHeading()).not.toHaveFocus();
  });

  // Nothing on the page moves when editing comes back, so without this a
  // screen-reader user would only find out by trying a control.
  it('announces that editing is available again', () => {
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuard(store);
    expect(
      screen.queryByText(/no longer editing this protocol/),
    ).not.toBeInTheDocument();

    act(() => {
      store.dispatch(setProtocolLockState('owned'));
    });

    expect(
      screen.getByText(
        'The other tab is no longer editing this protocol, so you can edit it here again.',
      ),
    ).toBeInTheDocument();
  });

  it('leaves dialogs alone on a first render that is already read-only', () => {
    const closeAllDialogs = globalThis.__architectDialogMocks.closeAllDialogs;
    store.dispatch(setActiveProtocol(protocol));
    store.dispatch(setProtocolLockState('open-elsewhere'));

    renderGuard(store);

    expect(closeAllDialogs).not.toHaveBeenCalled();
  });

  // A variable or entity-type editor open over the Codebook holds its values in
  // its own form store (#1387): disabling the page under it would leave the
  // researcher unable to finish or cancel it.
  it('keeps a dirty nested editor operable when the tab is demoted outside the stage editor', () => {
    store.dispatch(setActiveProtocol(protocol));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuardWithNestedEditor(store);
    expect(screen.getByTestId('nested-editor')).toBeInTheDocument();

    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });

    expect(screen.getByTestId('nested-editor')).toBeInTheDocument();
    expectReadOnly(false);
  });

  // Keyed on an editor being OPEN rather than on its draft being dirty, for the
  // same reason the stage editor is keyed on being granted: dirtiness is
  // recomputed on every render, so an editor cleared back to empty would freeze
  // under the researcher at the next unrelated re-render. Being open only
  // changes when they open or close one.
  it('keeps a pristine nested editor operable too, rather than deciding by dirtiness', () => {
    store.dispatch(setActiveProtocol(protocol));
    mockLocation.mockReturnValue('/protocol/codebook');

    renderGuardWithNestedEditor(store, false);

    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });

    expect(screen.getByTestId('nested-editor')).toBeInTheDocument();
    expectReadOnly(false);
  });

  // Once the researcher has dealt with the editor, there is nothing left of
  // theirs on the page — so it goes read-only like any other.
  it('makes the page read-only once the nested editor is closed', () => {
    store.dispatch(setActiveProtocol(protocol));
    mockLocation.mockReturnValue('/protocol/codebook');

    const { rerender } = renderGuardWithNestedEditor(store);
    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });
    expectReadOnly(false);

    // The researcher answers the editor's own discard confirmation, and it
    // closes.
    act(() => {
      rerender(
        <Provider store={store}>
          <ProtocolRouteGuard>
            <Editor />
          </ProtocolRouteGuard>
        </Provider>,
      );
    });

    expectReadOnly(true);
  });

  it('makes every page outside the stage editor read-only, whatever the stage draft holds', () => {
    store.dispatch(setActiveProtocol(protocol));
    openDirtyStageDraft();
    mockLocation.mockReturnValue('/protocol');
    store.dispatch(setProtocolLockState('open-elsewhere'));

    // A dirty draft is not the exemption — the stage editor holding it is. Off
    // the stage editor route, an unsaved draft does not hold the page open.
    expect(readStageDraft().dirty).toBe(true);

    renderGuard(store);

    expectReadOnly(true);
  });
});

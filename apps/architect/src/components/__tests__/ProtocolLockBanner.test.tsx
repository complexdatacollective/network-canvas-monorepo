import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app, {
  getProtocolReclaimChoiceRequest,
  setProtocolLockState,
} from '~/ducks/modules/app';
import protocols from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';
import stageEditorDraft, {
  draftTimelineActions,
  setLiveValues,
  type StageEditorDraftPresent,
} from '~/ducks/modules/stageEditorDraft';
import { getLiveStageDraftDirty } from '~/selectors/stageEditorDraft';

import ProtocolLockBanner from '../ProtocolLockBanner';

const { mockLocation, mockSetLocation } = vi.hoisted(() => ({
  mockLocation: vi.fn<() => string>(),
  mockSetLocation: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => [mockLocation(), mockSetLocation],
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

const renderBanner = (store: TestStore) =>
  render(
    <Provider store={store}>
      <ProtocolLockBanner />
    </Provider>,
  );

describe('ProtocolLockBanner', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
    store.dispatch(setActiveProtocol(protocol));
    mockLocation.mockReturnValue('/protocol');
    mockSetLocation.mockClear();
  });

  it('renders nothing while this tab holds the protocol', () => {
    const { container } = renderBanner(store);

    expect(container).toBeEmptyDOMElement();
  });

  it('describes the read-only view and how to get editing back', () => {
    store.dispatch(setProtocolLockState('open-elsewhere'));

    renderBanner(store);

    const banner = screen.getByRole('status');
    // No claim that changes are being saved, and no dead end: closing the other
    // tab releases the protocol and this tab reclaims it.
    expect(banner).toHaveTextContent(/read-only mode/i);
    expect(banner).toHaveTextContent(
      /Close the other tab to continue editing/i,
    );
    expect(banner).not.toHaveTextContent(/saved automatically/i);
  });

  it('takes focus when the read-only view replaces what the user was looking at', () => {
    store.dispatch(setProtocolLockState('open-elsewhere'));

    renderBanner(store);

    expect(screen.getByRole('status')).toHaveFocus();
  });

  it('says nothing can be saved in a held stage editor, and offers to discard', () => {
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    // Open the editor on the committed stage, then mirror a real edit into it
    // the way the stage form bridge does, so there is genuinely something for
    // "Discard Changes" to discard.
    store.dispatch(draftTimelineActions.reset(draftPresent));
    store.dispatch(setLiveValues(editedStage));
    store.dispatch(setProtocolLockState('open-elsewhere'));

    expect(getLiveStageDraftDirty(store.getState())).toBe(true);

    renderBanner(store);

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/Nothing you change here can be saved/i);
    expect(banner).toHaveTextContent(
      /Close the other tab to carry on editing/i,
    );
    // Focus is left alone here: nothing has been replaced and the user may be
    // mid-keystroke.
    expect(banner).not.toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    // Both halves matter: the draft is cleared AND the editor is left, because
    // staying would leave every control live with nowhere for its writes to go.
    expect(getLiveStageDraftDirty(store.getState())).toBe(false);
    expect(mockSetLocation).toHaveBeenCalledWith('/protocol');
  });

  // The other tab has gone, so telling the researcher to close it would send
  // them looking for a tab that no longer exists.
  it('stops blaming the other tab once it has closed and a choice is outstanding', () => {
    mockLocation.mockReturnValue('/protocol/stage/stage-1');
    store.dispatch(draftTimelineActions.reset(draftPresent));
    store.dispatch(setLiveValues(editedStage));
    store.dispatch(setProtocolLockState('reclaim-blocked'));

    renderBanner(store);

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/The other tab has been closed/i);
    expect(banner).toHaveTextContent(/until you decide which to keep/i);
    expect(banner).not.toHaveTextContent(/Close the other tab/i);
    // Dismissing the choice must not strand the researcher: the banner can put
    // the question — and with it the download that keeps the work — back.
    expect(
      screen.queryByRole('button', { name: 'Discard Changes' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose What to Keep' }),
    );
    expect(getProtocolReclaimChoiceRequest(store.getState())).toBeGreaterThan(
      0,
    );
  });
});

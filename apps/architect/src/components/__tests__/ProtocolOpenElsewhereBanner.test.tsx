import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app, { setProtocolOpenElsewhere } from '~/ducks/modules/app';
import protocols from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';
import stageEditorDraft, {
  draftTimelineActions,
  setLiveValues,
  type StageEditorDraftPresent,
} from '~/ducks/modules/stageEditorDraft';
import { getLiveStageDraftDirty } from '~/selectors/stageEditorDraft';

import ProtocolOpenElsewhereBanner from '../ProtocolOpenElsewhereBanner';

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
      <ProtocolOpenElsewhereBanner />
    </Provider>,
  );

describe('ProtocolOpenElsewhereBanner', () => {
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
    store.dispatch(setProtocolOpenElsewhere(true));

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
    store.dispatch(setProtocolOpenElsewhere(true));

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
    store.dispatch(setProtocolOpenElsewhere(true));

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
});

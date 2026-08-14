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
  markExternalEdit,
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
    store.dispatch(draftTimelineActions.reset(stage));
    store.dispatch(markExternalEdit());
    store.dispatch(setProtocolOpenElsewhere(true));

    renderBanner(store);

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/Nothing you change here can be saved/i);
    expect(banner).toHaveTextContent(
      /Close the other tab to carry on editing/i,
    );
    // Focus is left alone here: nothing has been replaced and the user may be
    // mid-keystroke.
    expect(banner).not.toHaveFocus();

    expect(getLiveStageDraftDirty(store.getState())).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    // Both halves matter: the draft is cleared AND the editor is left, because
    // staying would leave every control live with nowhere for its writes to go.
    expect(getLiveStageDraftDirty(store.getState())).toBe(false);
    expect(mockSetLocation).toHaveBeenCalledWith('/protocol');
  });
});

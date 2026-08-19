import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
  updateProtocolName,
} from '~/ducks/modules/activeProtocol';
import app, { setProtocolLockState } from '~/ducks/modules/app';
import protocols from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';
import { getCanUndo } from '~/selectors/protocol';

import ProjectLayout from '../ProjectNav/ProjectLayout';

const { mockLocation } = vi.hoisted(() => ({
  mockLocation: vi.fn<() => string>(),
}));

vi.mock('wouter', () => ({
  useLocation: () => [mockLocation(), vi.fn()],
}));

// Neither participates in the toolbar decision under test, and both pull in
// large trees of their own.
vi.mock('~/components/ProjectNav/ProjectNav', () => ({
  default: () => null,
}));
vi.mock('~/components/StorageUnavailableBanner', () => ({
  default: () => null,
}));

vi.mock('~/templates/source-authoring', () => ({
  isProtocolSourceAuthoringEnabled: false,
  saveProtocolSource: vi.fn(),
}));

const protocol: CurrentProtocol = {
  name: 'Test Protocol',
  schemaVersion: 8,
  stages: [],
  codebook: {},
};

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

// A protocol with something on its timeline, so an Undo control rendered here
// would be a live one rather than a disabled stub.
const openProtocolWithHistory = (store: TestStore) => {
  store.dispatch(setActiveProtocol(protocol));
  store.dispatch(updateProtocolName({ name: 'Renamed' }));
};

const renderLayout = (store: TestStore) =>
  render(
    <Provider store={store}>
      <ProjectLayout>
        <div data-testid="page">Page</div>
      </ProjectLayout>
    </Provider>,
  );

describe('ProjectLayout', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
    mockLocation.mockReturnValue('/protocol');
  });

  // #1389's acceptance criterion: the Summary report is read-only because it is
  // a report, not because this tab cannot save. History recovery still reaches
  // disk from there, so the controls stay.
  it('keeps Undo and Redo on the Summary report', () => {
    openProtocolWithHistory(store);
    mockLocation.mockReturnValue('/protocol/summary');

    renderLayout(store);

    expect(getCanUndo(store.getState())).toBe(true);
    expect(screen.getByRole('button', { name: /undo/i })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  // The other kind of read-only. Another tab owns the saved copy, so autosave
  // is refused and the library write behind any change here is dropped: an Undo
  // control would rewind what is on screen and never reach disk.
  it('offers no Undo or Redo while another tab holds the saved copy', () => {
    openProtocolWithHistory(store);
    store.dispatch(setProtocolLockState('open-elsewhere'));

    renderLayout(store);

    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /redo/i })).toBeNull();
    // Reading the protocol is still offered: neither leaves this tab's copy
    // behind, and Download is how the work gets out.
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^download$/i }),
    ).toBeInTheDocument();
  });

  // The read-only view renders at whatever /protocol URL the researcher is on
  // (ProtocolRouteGuard), so the decision cannot be keyed on the Summary path.
  it('offers no Undo or Redo on any route while another tab holds the saved copy', () => {
    openProtocolWithHistory(store);
    mockLocation.mockReturnValue('/protocol/codebook');
    store.dispatch(setProtocolLockState('open-elsewhere'));

    renderLayout(store);

    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /redo/i })).toBeNull();
  });

  it('keeps Undo and Redo on a normal authoring page', () => {
    openProtocolWithHistory(store);

    renderLayout(store);

    expect(screen.getByRole('button', { name: /undo/i })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(screen.queryByRole('button', { name: /print/i })).toBeNull();
  });
});

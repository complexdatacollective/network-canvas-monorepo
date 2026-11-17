import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import appReducer, { setActiveProtocolId } from '~/ducks/modules/app';
import type { StoredProtocolRow } from '~/utils/assetDB';

import { ActionToolbarProvider } from './ActionToolbar';
import ProjectActions from './ProjectActions';

vi.mock('~/utils/downloadActiveProtocol', () => ({
  downloadActiveProtocol: vi.fn(),
}));

vi.mock('~/templates/source-authoring', () => ({
  isProtocolSourceAuthoringEnabled: true,
  saveProtocolSource: vi.fn(),
}));

vi.mock('~/utils/protocolLibrary', () => ({
  getStoredProtocol: vi.fn(),
}));

const { downloadActiveProtocol } =
  await import('~/utils/downloadActiveProtocol');
const mockedDownload = vi.mocked(downloadActiveProtocol);
const { saveProtocolSource } = await import('~/templates/source-authoring');
const mockedSaveSource = vi.mocked(saveProtocolSource);
const { getStoredProtocol } = await import('~/utils/protocolLibrary');
const mockedGetStoredProtocol = vi.mocked(getStoredProtocol);

const PROTOCOL: StoredProtocolRow['protocol'] = {
  name: 'Test protocol',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: {},
  stages: [],
};

const STORED_ROW: StoredProtocolRow = {
  id: 'protocol-1',
  name: 'Test protocol',
  schemaVersion: 9,
  protocol: PROTOCOL,
  sourceRef: { kind: 'template', id: 'test' },
  createdAt: 0,
  updatedAt: 0,
};

const createTestStore = () =>
  configureStore({
    reducer: {
      app: appReducer,
      // The timeline-wrapped slice, as the toolbar's selectors read it. Only
      // `present` matters here: `getProtocol` is what decides whether
      // Save to source is offered at all.
      activeProtocol: () => ({ present: PROTOCOL, past: [], future: [] }),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

const renderActions = async () => {
  const store = createTestStore();
  store.dispatch(setActiveProtocolId('protocol-1'));

  render(
    <Provider store={store}>
      <ActionToolbarProvider>
        <ProjectActions />
      </ActionToolbarProvider>
    </Provider>,
  );

  // Save to source appears only once the library row has answered with a
  // source reference; without awaiting it the control under test is absent.
  return screen.findByRole('button', { name: 'Save to source' });
};

/**
 * Fires two activations of one control without letting React re-render in
 * between — the real shape of a double click, and the shape in which the
 * button's own `disabled` prop cannot help: it is state the second event has
 * not seen yet.
 */
const clickTwiceInOneTick = async (control: HTMLElement) => {
  await act(async () => {
    control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// Download lives in the Export menu, which renders its items only while open.
const openExportItem = async (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  return screen.findByRole('menuitem', { name });
};

describe('ProjectActions', () => {
  beforeEach(() => {
    mockedDownload.mockReset();
    mockedDownload.mockResolvedValue(true);
    mockedSaveSource.mockReset();
    mockedSaveSource.mockResolvedValue({
      ok: true,
      writtenProtocolPath: 'protocols/test/protocol.json',
      writtenAssets: [],
      removedAssets: [],
    });
    mockedGetStoredProtocol.mockReset();
    mockedGetStoredProtocol.mockResolvedValue(STORED_ROW);
  });

  /*
    Neither of these operations may run twice for one intent. Save to source
    overwrites the canonical protocol source files in the repository; a
    download builds and writes a file. Their `disabled` prop is a rendering of
    state that a second event in the same tick has not seen, so the guard has
    to live with the operation — see `useSingleFlight`.
  */
  it('exports once however many times Download is activated', async () => {
    await renderActions();
    await clickTwiceInOneTick(await openExportItem('Download'));

    expect(mockedDownload).toHaveBeenCalledTimes(1);
  });

  it('writes the protocol source once however many times Save to source is activated', async () => {
    const saveToSource = await renderActions();
    await clickTwiceInOneTick(saveToSource);

    expect(mockedSaveSource).toHaveBeenCalledTimes(1);
  });

  // The latch is released when the operation settles, not held for the life of
  // the component: a researcher who downloads twice on purpose gets two files.
  it('exports again once the first export has finished', async () => {
    await renderActions();

    await clickTwiceInOneTick(await openExportItem('Download'));
    // The trigger is disabled while the first download runs, so the menu can
    // be opened again only once it has settled.
    await screen.findByRole('button', { name: 'Downloaded' });
    fireEvent.click(screen.getByRole('button', { name: 'Downloaded' }));
    const again = await screen.findByRole('menuitem', { name: 'Download' });
    await act(async () => {
      again.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockedDownload).toHaveBeenCalledTimes(2);
  });
});

describe('ProjectActions return button', () => {
  const returnLabelAt = (path: string) => {
    const store = createTestStore();
    store.dispatch(setActiveProtocolId('protocol-1'));
    render(
      <Provider store={store}>
        <Router hook={memoryLocation({ path }).hook}>
          <ActionToolbarProvider>
            <ProjectActions />
          </ActionToolbarProvider>
        </Router>
      </Provider>,
    );
  };

  it('returns to Stages from the experimental features page', () => {
    returnLabelAt('/protocol/experiments');

    expect(
      screen.getByRole('button', { name: 'Return to Stages' }),
    ).toBeInTheDocument();
  });

  it('returns to the start screen from an address that is not a protocol page', () => {
    returnLabelAt('/protocol/unknown-page');

    expect(
      screen.queryByRole('button', { name: 'Return to Stages' }),
    ).not.toBeInTheDocument();
  });
});

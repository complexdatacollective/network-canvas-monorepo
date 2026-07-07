import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredProtocolRow } from '~/utils/assetDB';
import LibraryPanel from '../LibraryPanel';

const downloadProtocolAsNetcanvasMock = vi.fn();

vi.mock('~/utils/bundleProtocol', () => ({
  downloadProtocolAsNetcanvas: (...args: unknown[]) =>
    downloadProtocolAsNetcanvasMock(...args),
}));

const openDialogMock = vi.fn((config: unknown) => ({
  type: 'dialogs/openDialog',
  payload: config,
}));

vi.mock('~/ducks/modules/dialogs', () => ({
  openDialog: (config: unknown) => openDialogMock(config),
}));

vi.mock('~/ducks/modules/userActions/userActions', () => ({
  deleteLibraryProtocol: vi.fn(() => ({
    type: 'webUserActions/deleteLibraryProtocol',
  })),
}));

const useProtocolLibraryMock = vi.fn();

vi.mock('~/hooks/useProtocolLibrary', () => ({
  useProtocolLibrary: () => useProtocolLibraryMock(),
}));

vi.mock('~/utils/reportError', () => ({
  reportError: vi.fn(),
}));

const makeProtocolRow = (overrides: Partial<StoredProtocolRow> = {}) =>
  ({
    id: 'protocol-1',
    name: 'My Protocol',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    protocol: {
      stages: [],
      codebook: { node: {}, edge: {} },
    },
    ...overrides,
  }) as unknown as StoredProtocolRow;

const store = configureStore({
  reducer: { placeholder: (state = {}) => state },
});

const wrap = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

const renderPanel = () =>
  render(
    <LibraryPanel
      onOpenProtocol={vi.fn()}
      onOpenSample={vi.fn()}
      onOpenDevProtocol={vi.fn()}
      templates={[]}
      onOpenTemplate={vi.fn()}
    />,
    { wrapper: wrap },
  );

const openDownloadFromRow = async () => {
  fireEvent.click(screen.getByRole('button', { name: /actions for/i }));
  const downloadItem = await screen.findByRole('menuitem', {
    name: /download/i,
  });
  fireEvent.click(downloadItem);
};

describe('<LibraryPanel /> download', () => {
  beforeEach(() => {
    downloadProtocolAsNetcanvasMock.mockReset();
    openDialogMock.mockClear();
    useProtocolLibraryMock.mockReturnValue({
      protocols: [makeProtocolRow()],
      isLoaded: true,
    });
  });

  it('warns the author when downloaded .netcanvas silently omits skipped assets', async () => {
    downloadProtocolAsNetcanvasMock.mockResolvedValueOnce([
      { id: 'asset-1', name: 'missing-image.png' },
    ]);

    renderPanel();
    await openDownloadFromRow();

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalled();
    });

    const warningCall = openDialogMock.mock.calls.find(
      ([config]) =>
        (config as { type?: string }).type === 'Warning',
    );
    expect(warningCall).toBeDefined();
    expect((warningCall![0] as { message: string }).message).toContain(
      'missing-image.png',
    );
  });

  it('does not warn when every asset was included', async () => {
    downloadProtocolAsNetcanvasMock.mockResolvedValueOnce([]);

    renderPanel();
    await openDownloadFromRow();

    await waitFor(() => {
      expect(downloadProtocolAsNetcanvasMock).toHaveBeenCalled();
    });

    const warningCall = openDialogMock.mock.calls.find(
      ([config]) => (config as { type?: string }).type === 'Warning',
    );
    expect(warningCall).toBeUndefined();
  });
});

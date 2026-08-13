import { configureStore } from '@reduxjs/toolkit';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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

const openDialogMock = globalThis.__architectDialogMocks.openDialog;

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
        (config as { type?: string; intent?: string }).type === 'acknowledge' &&
        (config as { type?: string; intent?: string }).intent === 'warning',
    );
    expect(warningCall).toBeDefined();
    expect((warningCall![0] as { description: string }).description).toContain(
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
    // Let the resolved-download continuation (the warn-or-not decision) run so
    // the negative assertion below isn't vacuous.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const warningCall = openDialogMock.mock.calls.find(
      ([config]) =>
        (config as { type?: string; intent?: string }).type === 'acknowledge' &&
        (config as { type?: string; intent?: string }).intent === 'warning',
    );
    expect(warningCall).toBeUndefined();
  });
});

describe('<LibraryPanel /> gallery card', () => {
  beforeEach(() => {
    localStorage.clear();
    useProtocolLibraryMock.mockReturnValue({
      protocols: [],
      isLoaded: true,
    });
  });

  // Regression: the gallery card is rendered inside a Collection with
  // selectionMode="none", so the Collection's built-in onClick is a no-op —
  // it has no row-level action of its own (only the nested Dismiss button
  // and gallery link do anything). It used to inherit the Collection's
  // default `role="option"`, announcing itself to assistive technology as a
  // selectable, actionable option wired to nothing.
  it('does not announce itself as an inert selectable option', async () => {
    renderPanel();
    await screen.findByRole('tab', { name: 'Templates' });
    fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));

    const card = await screen.findByRole('group', { name: 'Protocol gallery' });
    expect(
      screen.queryByRole('option', { name: 'Protocol gallery' }),
    ).not.toBeInTheDocument();

    // Its own controls remain independently functional.
    expect(
      within(card).getByRole('button', { name: 'Dismiss' }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('link', { name: 'protocol gallery' }),
    ).toBeInTheDocument();
  });

  it('dismisses via its own Dismiss button, not the (withheld) card click', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));

    const card = await screen.findByRole('group', { name: 'Protocol gallery' });
    fireEvent.click(card);
    expect(
      screen.getByRole('group', { name: 'Protocol gallery' }),
    ).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Dismiss' }));
    expect(
      screen.queryByRole('group', { name: 'Protocol gallery' }),
    ).not.toBeInTheDocument();
  });
});

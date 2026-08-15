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

const openMenuItem = async (name: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: /actions for/i }));
  const item = await screen.findByRole('menuitem', { name });
  fireEvent.click(item);
};

const openDownloadFromRow = () => openMenuItem(/download/i);

type DialogConfig = {
  title?: string;
  intent?: string;
  finalFocus?: () => HTMLElement | null;
};

const dialogCallWithTitle = (title: string): DialogConfig | undefined =>
  openDialogMock.mock.calls
    .map(([config]) => config as DialogConfig)
    .find((config) => config.title === title);

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

describe('<LibraryPanel /> row action focus', () => {
  beforeEach(() => {
    downloadProtocolAsNetcanvasMock.mockReset();
    openDialogMock.mockClear();
    useProtocolLibraryMock.mockReturnValue({
      protocols: [makeProtocolRow()],
      isLoaded: true,
    });
  });

  it('sends focus back to the row Actions trigger after the delete is cancelled', async () => {
    openDialogMock.mockResolvedValue(false);
    renderPanel();
    await openMenuItem(/delete/i);

    await waitFor(() => {
      expect(dialogCallWithTitle('Delete protocol?')).toBeDefined();
    });

    // The dialog's own remembered opener is the menu item, which has already
    // unmounted by the time focus is returned, so this resolver is the only
    // thing standing between the researcher and the page header.
    const resolved = dialogCallWithTitle('Delete protocol?')!.finalFocus!();
    expect(resolved).toBe(screen.getByRole('button', { name: /actions for/i }));
  });

  it('falls through to the enclosing list when the confirmed delete removes the row', async () => {
    openDialogMock.mockResolvedValue(false);
    const { rerender } = renderPanel();
    await openMenuItem(/delete/i);

    await waitFor(() => {
      expect(dialogCallWithTitle('Delete protocol?')).toBeDefined();
    });
    const resolveFocus = dialogCallWithTitle('Delete protocol?')!.finalFocus!;
    const listbox = screen.getByRole('listbox', { name: 'Recent protocols' });

    // The confirm branch: the action removes the row, and the Actions trigger
    // that opened the dialog goes with it. Naming that trigger would resolve to
    // a detached node and drop focus onto <body>.
    useProtocolLibraryMock.mockReturnValue({ protocols: [], isLoaded: true });
    rerender(
      <LibraryPanel
        onOpenProtocol={vi.fn()}
        onOpenSample={vi.fn()}
        onOpenDevProtocol={vi.fn()}
        templates={[]}
        onOpenTemplate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /actions for/i }),
      ).not.toBeInTheDocument();
    });
    const resolved = resolveFocus();
    expect(resolved).toBe(listbox);
    expect(resolved?.isConnected).toBe(true);
  });

  it('sends focus back to the row Actions trigger after a failed download is acknowledged', async () => {
    downloadProtocolAsNetcanvasMock.mockRejectedValueOnce(
      new Error('bundling failed'),
    );
    renderPanel();
    await openDownloadFromRow();

    await waitFor(() => {
      expect(dialogCallWithTitle('Download failed')).toBeDefined();
    });
    expect(dialogCallWithTitle('Download failed')!.finalFocus!()).toBe(
      screen.getByRole('button', { name: /actions for/i }),
    );
  });

  it('keeps the Actions trigger focusable while a download is in flight', async () => {
    // A disabled control cannot hold focus. Disabling the trigger while the
    // download runs drops focus to <body> at exactly the moment the menu hands
    // it back, and locks the researcher out of Delete and See more info too.
    let settleDownload: (value: unknown[]) => void = () => undefined;
    downloadProtocolAsNetcanvasMock.mockReturnValueOnce(
      new Promise((resolve) => {
        settleDownload = resolve;
      }),
    );
    renderPanel();
    await openDownloadFromRow();

    const trigger = await screen.findByRole('button', {
      name: /actions for/i,
    });
    expect(trigger).not.toBeDisabled();
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    settleDownload([]);
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

  it('hands focus to the owning tab before unmounting itself', async () => {
    // Dismissing takes the focused Dismiss button out of the document. Without
    // somewhere to send focus first, it lands on <body>, from which the next
    // Tab restarts at the page header — the one true body-focus loss on Home.
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));

    const card = await screen.findByRole('group', { name: 'Protocol gallery' });
    const dismiss = within(card).getByRole('button', { name: 'Dismiss' });
    dismiss.focus();
    expect(document.activeElement).toBe(dismiss);

    fireEvent.click(dismiss);

    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'Templates' }),
    );
    expect(document.activeElement).not.toBe(document.body);
  });
});

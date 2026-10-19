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

import { renderQueuedMessage } from '~/test/renderQueuedMessage';
import type { LegacyProtocolChoice, StoredProtocolRow } from '~/utils/assetDB';
import { UnresolvedAssetsError } from '~/utils/bundleProtocol';
import type { LegacyStoredProtocolRow } from '~/utils/legacyProtocolLibrary';

import LibraryPanel from '../LibraryPanel';

const downloadProtocolAsNetcanvasMock = vi.fn();
const downloadLegacyProtocolAsNetcanvasMock = vi.fn();

vi.mock('~/utils/bundleProtocol', async (importOriginal) => ({
  // The real error class: the panel narrows on `instanceof`, so a look-alike
  // would silently take the generic-failure branch instead.
  ...(await importOriginal<typeof import('~/utils/bundleProtocol')>()),
  downloadProtocolAsNetcanvas: (...args: unknown[]) =>
    downloadProtocolAsNetcanvasMock(...args),
  downloadLegacyProtocolAsNetcanvas: (...args: unknown[]) =>
    downloadLegacyProtocolAsNetcanvasMock(...args),
}));

const bundledLegacyArchitect = vi.hoisted(() => ({
  current: null as { version: string; path: '/v8/' } | null,
}));

vi.mock('~/utils/legacyArchitect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/legacyArchitect')>()),
  getBundledLegacyArchitect: () => bundledLegacyArchitect.current,
}));

const countLegacyAssetsMock = vi.hoisted(() => vi.fn());

vi.mock('~/utils/legacyProtocolLibrary', () => ({
  countLegacyAssets: countLegacyAssetsMock,
}));

const openDialogMock = globalThis.__architectDialogMocks.openDialog;

vi.mock('~/ducks/modules/userActions/userActions', () => ({
  deleteLibraryProtocol: vi.fn(() => ({
    type: 'webUserActions/deleteLibraryProtocol',
  })),
}));

const useProtocolLibraryMock = vi.fn();

// Architect 8's library is empty unless a test says otherwise.
vi.mock('~/hooks/useProtocolLibrary', () => ({
  useProtocolLibrary: () => ({
    legacyProtocols: [],
    legacyChoices: [],
    ...(useProtocolLibraryMock() as object),
  }),
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
      onOpenLegacyProtocol={vi.fn()}
      onUpgradeLegacyProtocol={vi.fn()}
      onOpenInLegacyArchitect={vi.fn()}
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
  title?: ReactNode;
  intent?: string;
  finalFocus?: () => HTMLElement | null;
};

const dialogCallWithTitle = (title: string): DialogConfig | undefined =>
  openDialogMock.mock.calls
    .map(([config]) => config as DialogConfig)
    .find((config) => renderQueuedMessage(config.title) === title);

describe('<LibraryPanel /> download', () => {
  beforeEach(() => {
    downloadProtocolAsNetcanvasMock.mockReset();
    openDialogMock.mockClear();
    useProtocolLibraryMock.mockReturnValue({
      protocols: [makeProtocolRow()],
      isLoaded: true,
    });
  });

  it('names the resources it could not read when the download is refused', async () => {
    downloadProtocolAsNetcanvasMock.mockRejectedValueOnce(
      new UnresolvedAssetsError(['missing-image.png']),
    );

    renderPanel();
    await openDownloadFromRow();

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalled();
    });

    // Destructive, not a warning: nothing was written. Writing the file
    // without the resource would drop its manifest entry while the stages
    // referencing it keep the id, and that file opens nowhere.
    const refusalCall = openDialogMock.mock.calls.find(
      ([config]) =>
        (config as { type?: string; intent?: string }).type === 'acknowledge' &&
        (config as { type?: string; intent?: string }).intent === 'destructive',
    );
    expect(refusalCall).toBeDefined();
    expect(
      renderQueuedMessage(
        (refusalCall![0] as { description: ReactNode }).description,
      ),
    ).toContain('missing-image.png');
  });

  it('does not warn when every asset was included', async () => {
    downloadProtocolAsNetcanvasMock.mockResolvedValueOnce(undefined);

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
        onOpenLegacyProtocol={vi.fn()}
        onUpgradeLegacyProtocol={vi.fn()}
        onOpenInLegacyArchitect={vi.fn()}
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

// #1397 filed long names as dominating the page generally. On this surface it
// did NOT reproduce: the row name was already clamped to two lines with
// `wrap-anywhere` and the full value on `title`. Pinned here so the filed
// description cannot quietly become true later — and extended with `dir="auto"`,
// which the row was missing, so an RTL name's clamp truncates from its own end.
describe('<LibraryPanel /> protocol row name', () => {
  const longRtlName = 'مشروع بحث الشبكات الاجتماعية الحضرية والريفية'.repeat(8);

  // Its own setup rather than a shared one: the focus block above needs a
  // default-named row and reset download/dialog mocks, this block needs the
  // long RTL row and touches neither.
  beforeEach(() => {
    useProtocolLibraryMock.mockReturnValue({
      protocols: [makeProtocolRow({ name: longRtlName })],
      isLoaded: true,
    });
  });

  it('stays clamped, wrappable and fully exposed however long the name is', () => {
    renderPanel();

    const label = screen.getByTitle(longRtlName);
    expect(label).toHaveClass('line-clamp-2', 'wrap-anywhere');
    expect(label).toHaveAttribute('dir', 'auto');
    expect(label).toHaveTextContent(longRtlName);
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
      within(card).getByRole('link', { name: 'Protocol Gallery' }),
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

describe('<LibraryPanel /> opening tab', () => {
  const rerenderPanel = (rerender: (ui: ReactNode) => void) =>
    rerender(
      <LibraryPanel
        onOpenProtocol={vi.fn()}
        onOpenLegacyProtocol={vi.fn()}
        onUpgradeLegacyProtocol={vi.fn()}
        onOpenInLegacyArchitect={vi.fn()}
        onOpenSample={vi.fn()}
        onOpenDevProtocol={vi.fn()}
        templates={[]}
        onOpenTemplate={vi.fn()}
      />,
    );

  it('opens on Templates when there are no recent protocols', () => {
    useProtocolLibraryMock.mockReturnValue({ protocols: [], isLoaded: true });
    renderPanel();

    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens on Recent when there are saved protocols', () => {
    useProtocolLibraryMock.mockReturnValue({
      protocols: [makeProtocolRow()],
      isLoaded: true,
    });
    renderPanel();

    expect(screen.getByRole('tab', { name: 'Recent' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('waits for the library to load before choosing', () => {
    useProtocolLibraryMock.mockReturnValue({ protocols: [], isLoaded: false });
    const { rerender } = renderPanel();

    useProtocolLibraryMock.mockReturnValue({
      protocols: [makeProtocolRow()],
      isLoaded: true,
    });
    rerenderPanel(rerender);

    expect(screen.getByRole('tab', { name: 'Recent' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('stays on Recent when the last protocol is removed', () => {
    useProtocolLibraryMock.mockReturnValue({
      protocols: [makeProtocolRow()],
      isLoaded: true,
    });
    const { rerender } = renderPanel();

    useProtocolLibraryMock.mockReturnValue({ protocols: [], isLoaded: true });
    rerenderPanel(rerender);

    expect(screen.getByRole('tab', { name: 'Recent' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

const makeLegacyRow = (
  overrides: Partial<LegacyStoredProtocolRow> = {},
): LegacyStoredProtocolRow =>
  ({
    id: '0b6c1f8e-6c0e-4d2a-9a51-2f7d3c9e8a10',
    name: 'Schema 8 Study',
    schemaVersion: 8,
    createdAt: 1_000,
    updatedAt: 2_000,
    protocol: {
      schemaVersion: 8,
      description: 'Kept in Architect 8',
      stages: [{}, {}],
      codebook: { node: { person: {} }, edge: {} },
    },
    ...overrides,
  }) as LegacyStoredProtocolRow;

describe('<LibraryPanel /> Architect 8 protocols', () => {
  const callbacks = {
    onOpenProtocol: vi.fn(),
    onOpenLegacyProtocol: vi.fn(),
    onUpgradeLegacyProtocol: vi.fn(),
    onOpenInLegacyArchitect: vi.fn(),
  };

  const renderWithCallbacks = () =>
    render(
      <LibraryPanel
        {...callbacks}
        onOpenSample={vi.fn()}
        onOpenDevProtocol={vi.fn()}
        templates={[]}
        onOpenTemplate={vi.fn()}
      />,
      { wrapper: wrap },
    );

  const withLibrary = ({
    protocols = [],
    legacyProtocols = [makeLegacyRow()],
    legacyChoices = [],
  }: {
    protocols?: StoredProtocolRow[];
    legacyProtocols?: LegacyStoredProtocolRow[];
    legacyChoices?: LegacyProtocolChoice[];
  } = {}) =>
    useProtocolLibraryMock.mockReturnValue({
      protocols,
      legacyProtocols,
      legacyChoices,
      isLoaded: true,
    });

  const openActions = async () => {
    fireEvent.click(screen.getByRole('button', { name: /actions for/i }));
    return await screen.findByRole('menu');
  };

  beforeEach(() => {
    bundledLegacyArchitect.current = null;
    openDialogMock.mockClear();
    downloadLegacyProtocolAsNetcanvasMock.mockReset();
    countLegacyAssetsMock.mockReset();
    for (const callback of Object.values(callbacks)) callback.mockReset();
  });

  it('lists them on the Recent tab, marked with their schema version', () => {
    withLibrary({
      legacyProtocols: [makeLegacyRow({ schemaVersion: 7 })],
    });
    renderWithCallbacks();

    // Only Architect 8 protocols: still Recent, not Templates.
    expect(screen.getByRole('tab', { name: 'Recent' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const row = screen.getByRole('option', { name: /Schema 8 Study/ });
    expect(within(row).getByText('Schema 7')).toBeInTheDocument();
    expect(
      within(row).queryByText('Has an upgraded copy'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 protocol')).toBeInTheDocument();
  });

  it('marks one whose upgraded copy is in this library', () => {
    const legacy = makeLegacyRow();
    withLibrary({
      protocols: [makeProtocolRow({ id: 'copy-1', updatedAt: 1_500 })],
      legacyProtocols: [legacy],
      legacyChoices: [
        {
          legacyId: legacy.id,
          choice: 'upgraded',
          upgradedId: 'copy-1',
          updatedAt: 1_500,
        },
      ],
    });
    renderWithCallbacks();

    const row = screen.getByRole('option', { name: /Schema 8 Study/ });
    expect(within(row).getByText('Has an upgraded copy')).toBeInTheDocument();
    expect(screen.getByText('2 protocols')).toBeInTheDocument();
  });

  it('does not claim an upgrade whose copy has since been deleted', () => {
    const legacy = makeLegacyRow();
    withLibrary({
      legacyProtocols: [legacy],
      legacyChoices: [
        {
          legacyId: legacy.id,
          choice: 'upgraded',
          upgradedId: 'deleted-copy',
          updatedAt: 1_500,
        },
      ],
    });
    renderWithCallbacks();

    expect(screen.queryByText('Has an upgraded copy')).not.toBeInTheDocument();
  });

  it('merges both libraries, most recently edited first', () => {
    withLibrary({
      protocols: [
        makeProtocolRow({ id: 'newest', name: 'Newest', updatedAt: 3_000 }),
        makeProtocolRow({ id: 'oldest', name: 'Oldest', updatedAt: 1_000 }),
      ],
      legacyProtocols: [makeLegacyRow({ updatedAt: 2_000 })],
    });
    renderWithCallbacks();

    expect(
      screen
        .getAllByRole('option')
        .map((option) => option.querySelector('[title]')?.textContent),
    ).toEqual(['Newest', 'Schema 8 Study', 'Oldest']);
  });

  it('opens through the choice, with a focus fallback, when the row is clicked', () => {
    withLibrary();
    renderWithCallbacks();

    const row = screen.getByRole('option', { name: /Schema 8 Study/ });
    fireEvent.click(row);

    expect(callbacks.onOpenLegacyProtocol).toHaveBeenCalledExactlyOnceWith(
      makeLegacyRow().id,
      expect.any(Function),
    );
    const resolveFocus = callbacks.onOpenLegacyProtocol.mock
      .calls[0]![1] as () => HTMLElement | null;
    expect(resolveFocus()).toBe(row);
    expect(callbacks.onOpenProtocol).not.toHaveBeenCalled();
  });

  it('offers Upgrade, Download and info, but never Delete or Architect 8 when it is not bundled', async () => {
    withLibrary();
    renderWithCallbacks();

    const menu = await openActions();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Upgrade to schema 9', 'See more info', 'Download']);
  });

  it('offers to open it in Architect 8 when Architect 8 is bundled', async () => {
    bundledLegacyArchitect.current = { version: '8.5.0', path: '/v8/' };
    withLibrary();
    renderWithCallbacks();

    const menu = await openActions();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Open in Architect 8',
      'Upgrade to schema 9',
      'See more info',
      'Download',
    ]);

    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Open in Architect 8' }),
    );
    await waitFor(() =>
      expect(callbacks.onOpenInLegacyArchitect).toHaveBeenCalledWith(
        makeLegacyRow().id,
      ),
    );
    expect(callbacks.onOpenLegacyProtocol).not.toHaveBeenCalled();
  });

  it('asks to upgrade from the menu, returning focus to the Actions trigger', async () => {
    withLibrary();
    renderWithCallbacks();

    await openMenuItem(/upgrade to schema 9/i);

    await waitFor(() =>
      expect(callbacks.onUpgradeLegacyProtocol).toHaveBeenCalled(),
    );
    const [id, resolveFocus] = callbacks.onUpgradeLegacyProtocol.mock
      .calls[0] as [string, () => HTMLElement | null];
    expect(id).toBe(makeLegacyRow().id);
    expect(resolveFocus()).toBe(
      screen.getByRole('button', { name: /actions for/i }),
    );
  });

  it('downloads it from Architect 8’s library, not this one', async () => {
    downloadLegacyProtocolAsNetcanvasMock.mockResolvedValueOnce(undefined);
    const legacy = makeLegacyRow();
    withLibrary({ legacyProtocols: [legacy] });
    renderWithCallbacks();

    await openMenuItem(/download/i);

    await waitFor(() =>
      expect(downloadLegacyProtocolAsNetcanvasMock).toHaveBeenCalledWith(
        legacy,
      ),
    );
    expect(downloadProtocolAsNetcanvasMock).not.toHaveBeenCalled();
  });

  it('names the resources it could not read when its download is refused', async () => {
    downloadLegacyProtocolAsNetcanvasMock.mockRejectedValueOnce(
      new UnresolvedAssetsError(['old-map.png']),
    );
    withLibrary();
    renderWithCallbacks();

    await openMenuItem(/download/i);

    await waitFor(() =>
      expect(
        dialogCallWithTitle('Some resources could not be read'),
      ).toBeDefined(),
    );
  });

  it('counts its resources in Architect 8’s library for the info dialog', async () => {
    countLegacyAssetsMock.mockResolvedValueOnce(4);
    withLibrary();
    renderWithCallbacks();

    await openMenuItem(/see more info/i);

    const dialog = await screen.findByRole('dialog');
    expect(countLegacyAssetsMock).toHaveBeenCalledWith(makeLegacyRow().id);
    expect(within(dialog).getByText('Kept in Architect 8')).toBeInTheDocument();
    const cells = within(dialog)
      .getAllByRole('row')
      .map((tableRow) => tableRow.textContent);
    expect(cells).toContain('Stages2');
    expect(cells).toContain('Node types1');
    expect(cells).toContain('Assets4');
  });
});

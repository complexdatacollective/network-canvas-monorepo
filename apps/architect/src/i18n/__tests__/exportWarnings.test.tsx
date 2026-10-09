import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import LibraryPanel from '~/components/Home/LibraryPanel';
import StorageUnavailableBanner from '~/components/StorageUnavailableBanner';
import { useAppDispatch } from '~/ducks/hooks';
import { downloadActiveProtocol } from '~/utils/downloadActiveProtocol';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

const fixture = vi.hoisted(() => ({
  files: [
    { id: 'first', name: 'Research_Á1.png' },
    { id: 'second', name: 'Research_2.png' },
    { id: 'third', name: 'Research_3.png' },
  ],
  exported: vi.fn(),
  downloaded: vi.fn(),
  // What the export is refused for.
  refusal: 'assets' as 'assets' | 'finish-stage-text',
  finishStageTextProblem: {
    stageId: 'finish',
    stageIndex: 0,
    locale: 'ja',
    missing: ['title', 'content'],
  } as const,
  protocol: {
    id: 'research_protocol',
    name: 'Research_Protocol',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    protocol: {
      name: 'Research_Protocol',
      schemaVersion: 9,
      stages: [],
      codebook: {},
    },
  },
}));

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');
vi.mock('~/ducks/modules/userActions/userActions', async () => {
  const { createAsyncThunk } = await import('@reduxjs/toolkit');
  return {
    exportNetcanvas: createAsyncThunk('fixture/export', async () => {
      fixture.exported();
      return fixture.refusal === 'finish-stage-text'
        ? {
            status: 'missing-finish-stage-text',
            problem: fixture.finishStageTextProblem,
          }
        : {
            status: 'unresolved-assets',
            assetNames: fixture.files.map((file) => file.name),
          };
    }),
    deleteLibraryProtocol: vi.fn(),
  };
});
vi.mock('~/hooks/useProtocolLibrary', () => ({
  useProtocolLibrary: () => ({ protocols: [fixture.protocol], isLoaded: true }),
}));
vi.mock('~/utils/bundleProtocol', async (importOriginal) => {
  // The real error class, because LibraryPanel narrows on `instanceof` — a
  // look-alike defined here would take the generic failure branch and the
  // dialog under test would never open.
  const { MissingFinishStageTextError, UnresolvedAssetsError } =
    await importOriginal<typeof import('~/utils/bundleProtocol')>();
  return {
    MissingFinishStageTextError,
    UnresolvedAssetsError,
    downloadProtocolAsNetcanvas: async () => {
      fixture.downloaded();
      if (fixture.refusal === 'finish-stage-text') {
        throw new MissingFinishStageTextError(fixture.finishStageTextProblem);
      }
      throw new UnresolvedAssetsError(fixture.files.map((file) => file.name));
    },
  };
});

beforeEach(() => {
  fixture.refusal = 'assets';
  localStorage.clear();
  fixture.exported.mockClear();
  fixture.downloaded.mockClear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function ActiveDownload() {
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  return (
    <button
      onClick={() => {
        void downloadActiveProtocol(dispatch, openDialog);
      }}
    >
      Download active protocol
    </button>
  );
}

type Surface = 'active' | 'library' | 'unsaved';

const renderSurface = (surface: Surface) => {
  const store = configureStore({
    reducer: { app: () => ({ storageUnavailable: true }) },
  });
  render(
    <Provider store={store}>
      <ArchitectI18nProvider>
        <DialogProvider>
          {surface === 'active' ? (
            <ActiveDownload />
          ) : surface === 'unsaved' ? (
            <StorageUnavailableBanner />
          ) : (
            <LibraryPanel
              onOpenProtocol={vi.fn()}
              onOpenSample={vi.fn()}
              onOpenDevProtocol={vi.fn()}
              templates={[]}
              onOpenTemplate={vi.fn()}
            />
          )}
        </DialogProvider>
      </ArchitectI18nProvider>
    </Provider>,
  );
};

const requestDownload = async (surface: Surface) => {
  if (surface === 'library') {
    fireEvent.click(screen.getByRole('button', { name: /actions for/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /download/i }));
  } else {
    fireEvent.click(
      screen.getByRole('button', {
        name:
          surface === 'active'
            ? 'Download active protocol'
            : 'Download .netcanvas',
      }),
    );
  }
};

it.each(['active', 'library', 'unsaved'] as const)(
  'keeps the %s refused-export filename list reactive without altering files or exporting twice',
  async (surface) => {
    const original = structuredClone({
      files: fixture.files,
      protocol: fixture.protocol,
    });
    renderSurface(surface);
    await requestDownload(surface);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        'Research_Á1.png, Research_2.png, and Research_3.png',
      ),
    );
    act(() => {
      localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: ARCHITECT_LOCALE_KEY,
          newValue: 'es',
        }),
      );
    });
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        'Research_Á1.png, Research_2.png y Research_3.png',
      ),
    );
    expect(dialog).not.toHaveTextContent('and Research_3.png');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aceptar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      surface === 'library' ? fixture.downloaded : fixture.exported,
    ).toHaveBeenCalledTimes(1);
    expect({ files: fixture.files, protocol: fixture.protocol }).toEqual(
      original,
    );
  },
);

it.each(['active', 'library', 'unsaved'] as const)(
  'refuses the %s download while the finish stage has no heading or text in the default language',
  async (surface) => {
    fixture.refusal = 'finish-stage-text';
    renderSurface(surface);
    await requestDownload(surface);
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('This protocol can’t be downloaded yet'),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'The stage that ends the interview has no heading or text in Japanese. The protocol can’t be downloaded until they’re added.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  },
);

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

import { ToolbarButton } from '@codaco/fresco-ui/SegmentedToolbar';
import type { CurrentProtocol } from '@codaco/protocol-validation';

import { ActionToolbarProvider } from '../ProjectNav/ActionToolbar';
import ProjectActions from '../ProjectNav/ProjectActions';

const mockNavigate = vi.fn();
const mockLocation = vi.fn(() => '/protocol');

vi.mock('wouter', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wouter');
  return {
    ...actual,
    useLocation: () => [mockLocation(), mockNavigate],
  };
});

const openDialogMock = globalThis.__architectDialogMocks.openDialog;

// The real thunks return what the activation did, which useProtocolUndoRedo
// turns into its polite announcement — so the mocks are thunks returning an
// outcome, not plain actions.
const undoMock = vi.fn(() => ({ applied: true, navigatedTo: null }));
const redoMock = vi.fn(() => ({ applied: true, navigatedTo: null }));
const clearActiveProtocolMock = vi.fn(() => ({
  type: 'activeProtocol/clearActiveProtocol',
}));

vi.mock('~/ducks/modules/activeProtocol', () => ({
  // useProtocolUndoRedo dispatches the navigation-aware variants on the main timeline.
  undoWithNavigation: () => () => undoMock(),
  redoWithNavigation: () => () => redoMock(),
  clearActiveProtocol: () => clearActiveProtocolMock(),
  updateProtocolName: vi.fn((args: unknown) => ({
    type: 'activeProtocol/updateProtocolName',
    payload: args,
  })),
  updateProtocolDescription: vi.fn((args: unknown) => ({
    type: 'activeProtocol/updateProtocolDescription',
    payload: args,
  })),
}));

const exportUnwrap = vi.fn();
const exportNetcanvasMock = vi.fn(() => ({
  type: 'webUserActions/exportNetcanvas',
  unwrap: exportUnwrap,
}));

vi.mock('~/ducks/modules/userActions/userActions', () => ({
  exportNetcanvas: () => exportNetcanvasMock(),
}));

const sourceAuthoringMock = vi.hoisted(() => ({
  enabled: false,
  saveProtocolSource: vi.fn(),
}));

vi.mock('~/templates/source-authoring', () => ({
  get isProtocolSourceAuthoringEnabled() {
    return sourceAuthoringMock.enabled;
  },
  saveProtocolSource: (...args: unknown[]) =>
    sourceAuthoringMock.saveProtocolSource(...args),
}));

const protocolLibraryMock = vi.hoisted(() => ({
  getStoredProtocol: vi.fn(),
}));

vi.mock('~/utils/protocolLibrary', () => ({
  getStoredProtocol: (...args: unknown[]) =>
    protocolLibraryMock.getStoredProtocol(...args),
}));

const protocol: CurrentProtocol = {
  name: 'Test',
  schemaVersion: 8,
  stages: [],
  codebook: {
    node: {},
    edge: {},
    ego: {},
  },
  assetManifest: {},
};

const createTestStore = ({
  activeProtocolId = 'protocol-1',
  canUndo = true,
  canRedo = true,
} = {}) =>
  configureStore({
    reducer: {
      app: (
        state = {
          activeProtocolId,
        },
      ) => state,
      activeProtocol: (
        state = {
          past: canUndo ? [{}] : [],
          present: protocol,
          future: canRedo ? [{}] : [],
        },
      ) => state,
      // ProjectActions now reads draft undo/redo state via useProtocolUndoRedo.
      // On the '/protocol' route the draft scope is inactive, but the hook
      // still reads these selectors unconditionally, so the slice must exist.
      stageEditorDraft: (
        state = {
          history: { past: [], present: null, timeline: [], future: [] },
          ui: { restoring: false, initialValues: null },
        },
      ) => state,
    },
  });

type TestStore = ReturnType<typeof createTestStore>;

const wrap = (store: TestStore) => {
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <ActionToolbarProvider>{children}</ActionToolbarProvider>
    </Provider>
  );
};

describe('<ProjectActions />', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockLocation.mockReturnValue('/protocol');
    undoMock.mockClear();
    redoMock.mockClear();
    clearActiveProtocolMock.mockClear();
    exportNetcanvasMock.mockClear();
    exportUnwrap.mockReset();
    openDialogMock.mockClear();
    sourceAuthoringMock.enabled = false;
    sourceAuthoringMock.saveProtocolSource.mockReset();
    protocolLibraryMock.getStoredProtocol.mockReset();
    protocolLibraryMock.getStoredProtocol.mockResolvedValue(undefined);
  });

  it('dispatches undo when the Undo button is clicked', () => {
    const store = createTestStore();
    render(<ProjectActions />, { wrapper: wrap(store) });

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(undoMock).toHaveBeenCalledTimes(1);
  });

  it('dispatches redo when the Redo button is clicked', () => {
    const store = createTestStore();
    render(<ProjectActions />, { wrapper: wrap(store) });

    fireEvent.click(screen.getByRole('button', { name: /redo/i }));
    expect(redoMock).toHaveBeenCalledTimes(1);
  });

  it('hides history actions when neither undo nor redo is available', () => {
    const store = createTestStore({ canUndo: false, canRedo: false });
    render(<ProjectActions />, { wrapper: wrap(store) });

    expect(
      screen.queryByRole('toolbar', { name: 'History actions' }),
    ).not.toBeInTheDocument();
  });

  it('keeps both history controls visible and disables only the unavailable action', () => {
    const store = createTestStore({ canUndo: true, canRedo: false });
    render(<ProjectActions />, { wrapper: wrap(store) });

    const historyActions = screen.getByRole('toolbar', {
      name: 'History actions',
    });
    expect(
      within(historyActions).getByRole('button', { name: /undo/i }),
    ).not.toHaveAttribute('aria-disabled', 'true');
    expect(
      within(historyActions).getByRole('button', { name: /redo/i }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(within(historyActions).getAllByRole('separator')).toHaveLength(1);
  });

  it('renders Return-to-start in its own page-action segment', () => {
    const store = createTestStore();
    render(<ProjectActions />, { wrapper: wrap(store) });

    const pageActions = screen.getByRole('toolbar', { name: 'Page actions' });
    const historyActions = screen.getByRole('toolbar', {
      name: 'History actions',
    });
    expect(within(pageActions).getAllByRole('separator')).toHaveLength(1);
    expect(within(historyActions).getAllByRole('separator')).toHaveLength(1);
  });

  // The `report` mode gates authoring only. History recovery is not authoring,
  // and #1389 requires undo/redo to work identically on every page carrying the
  // toolbar — Summary included.
  it('keeps undo/redo available on a report page', () => {
    const store = createTestStore();
    render(<ProjectActions mode="report" />, { wrapper: wrap(store) });

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(undoMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /redo/i }));
    expect(redoMock).toHaveBeenCalledTimes(1);
  });

  it('hides save-to-source on a report page', async () => {
    sourceAuthoringMock.enabled = true;
    protocolLibraryMock.getStoredProtocol.mockResolvedValueOnce({
      id: 'protocol-1',
      name: 'Test',
      protocol,
      schemaVersion: 8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceRef: { kind: 'sample', id: 'sample' },
    });
    const store = createTestStore();

    render(<ProjectActions mode="report" />, { wrapper: wrap(store) });

    // The source ref resolves asynchronously; wait for the point at which a
    // writable page would have shown the action.
    await waitFor(() => {
      expect(protocolLibraryMock.getStoredProtocol).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole('button', { name: /save to source/i }),
    ).toBeNull();
  });

  // The other kind of read-only: another tab owns the saved copy, so a history
  // operation would rewind the screen and be dropped on the way to disk.
  it('offers no undo or redo when the protocol cannot be saved from here', () => {
    const store = createTestStore();
    render(<ProjectActions mode="locked" />, { wrapper: wrap(store) });

    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /redo/i })).toBeNull();
    expect(
      screen.getByRole('button', { name: /^download$/i }),
    ).toBeInTheDocument();
  });

  it('announces an applied undo in a live region', () => {
    const store = createTestStore();
    render(<ProjectActions />, { wrapper: wrap(store) });

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));

    expect(screen.getByRole('status')).toHaveTextContent('Change undone.');
  });

  it('says nothing when the timeline refused the operation', () => {
    undoMock.mockReturnValueOnce({ applied: false, navigatedTo: null });
    const store = createTestStore();
    render(<ProjectActions />, { wrapper: wrap(store) });

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('renders additional page actions separately from Undo/Redo', () => {
    const store = createTestStore();
    render(
      <ProjectActions
        additionalActions={
          <ToolbarButton onClick={vi.fn()}>Print</ToolbarButton>
        }
      />,
      { wrapper: wrap(store) },
    );

    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
    expect(
      screen.getByRole('toolbar', { name: 'Page actions' }),
    ).toContainElement(screen.getByRole('button', { name: /print/i }));
    expect(
      screen.getByRole('toolbar', { name: 'History actions' }),
    ).toContainElement(screen.getByRole('button', { name: /undo/i }));
  });

  it('keeps the Download action filled on hover', () => {
    const store = createTestStore();
    render(<ProjectActions />, { wrapper: wrap(store) });

    const downloadButton = screen.getByRole('button', { name: /^download$/i });
    expect(downloadButton).toHaveClass('bg-sea-green');
    expect(downloadButton).toHaveClass('text-white');
    expect(downloadButton).not.toHaveClass(
      'hover:enabled:bg-(--component-text)',
    );
  });

  it('transitions Download → Downloading... → Downloaded during export flow', async () => {
    const store = createTestStore();
    exportUnwrap.mockResolvedValueOnce({ skippedAssets: [] });

    render(<ProjectActions />, { wrapper: wrap(store) });

    const downloadButton = screen.getByRole('button', { name: /^download$/i });
    expect(downloadButton).toHaveTextContent(/download/i);

    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /downloaded/i }),
      ).toBeInTheDocument();
    });
    expect(exportNetcanvasMock).toHaveBeenCalled();
  });

  it('navigates to the start screen when Return-to-start is clicked', () => {
    const store = createTestStore();
    render(<ProjectActions />, { wrapper: wrap(store) });

    fireEvent.click(
      screen.getByRole('button', { name: /return to start screen/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it.each(['/protocol/assets', '/protocol/codebook', '/protocol/summary'])(
    'returns from %s to the timeline',
    (route) => {
      mockLocation.mockReturnValue(route);
      const store = createTestStore();
      render(<ProjectActions />, { wrapper: wrap(store) });

      fireEvent.click(
        screen.getByRole('button', { name: /Return to Stages/i }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/protocol');
      expect(
        screen.queryByRole('button', { name: /return to start screen/i }),
      ).toBeNull();
    },
  );

  it('hides save-to-source outside source authoring mode', () => {
    const store = createTestStore();
    render(<ProjectActions />, { wrapper: wrap(store) });

    expect(
      screen.queryByRole('button', { name: /save to source/i }),
    ).toBeNull();
  });

  it('saves the active source-linked protocol when authoring mode is enabled', async () => {
    sourceAuthoringMock.enabled = true;
    protocolLibraryMock.getStoredProtocol.mockResolvedValueOnce({
      id: 'protocol-1',
      name: 'Test',
      protocol,
      schemaVersion: 8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceRef: { kind: 'sample', id: 'sample' },
    });
    sourceAuthoringMock.saveProtocolSource.mockResolvedValueOnce({
      ok: true,
      writtenProtocolPath: 'sample/protocol.json',
      writtenAssets: [],
      removedAssets: [],
    });
    const store = createTestStore();

    render(<ProjectActions />, { wrapper: wrap(store) });

    const saveButton = await screen.findByRole('button', {
      name: /save to source/i,
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(sourceAuthoringMock.saveProtocolSource).toHaveBeenCalledWith({
        sourceRef: { kind: 'sample', id: 'sample' },
        protocol,
        protocolId: 'protocol-1',
      });
    });

    const successCall = openDialogMock.mock.calls.find(
      ([config]) =>
        (config as { type?: string; title?: string }).type === 'acknowledge' &&
        (config as { type?: string; title?: string }).title ===
          'Protocol source saved',
    );
    expect(successCall).toBeDefined();
  });
});

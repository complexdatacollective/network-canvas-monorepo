import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const openFileDialogMock = vi.hoisted(() => vi.fn());
type DropHandler = (
  files: File[],
  fileRejections: { file: File; errors: { code: string; message: string }[] }[],
) => void;

const dropzoneRef = vi.hoisted(() => ({
  onDrop: undefined as DropHandler | undefined,
}));

vi.mock('react-dropzone', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDropzone: (options: { onDrop: DropHandler }) => {
    dropzoneRef.onDrop = options.onDrop;
    return {
      getRootProps: () => ({}),
      getInputProps: () => ({}),
      isDragActive: false,
      open: openFileDialogMock,
    };
  },
}));

vi.mock('~/components/AppUpdate/AppUpdatePill', () => ({
  default: () => null,
}));

vi.mock('~/components/NewProtocolDialog', () => ({
  default: () => null,
}));

// The items are `NavLink`s, which need the navigation menu around them.
vi.mock('~/components/ProjectNav/NavShell', async () => {
  const { NavigationMenu } = await import('@base-ui/react/navigation-menu');
  return {
    default: ({ items }: { items: ReactElement[] }) => (
      <NavigationMenu.Root>
        <NavigationMenu.List>
          {items.map((item) => (
            <NavigationMenu.Item key={item.key}>{item}</NavigationMenu.Item>
          ))}
        </NavigationMenu.List>
      </NavigationMenu.Root>
    ),
  };
});

const showProtocolOpenResultDialogMock = vi.hoisted(() => vi.fn());

vi.mock('~/components/protocolOpenDialogs', () => ({
  showProtocolOpenResultDialog: showProtocolOpenResultDialogMock,
}));

const dispatchMock = vi.hoisted(() => vi.fn());

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatchMock,
}));

vi.mock('~/ducks/modules/userActions/userActions', () => ({
  createNetcanvas: vi.fn(),
  openBundledTemplate: vi.fn(),
  openLibraryProtocol: vi.fn(),
  openLocalNetcanvas: vi.fn(),
  planLegacyProtocolOpen: vi.fn(),
  upgradeLegacyProtocol: vi.fn(),
}));

// The shared open flow asks the editor whether leaving needs confirming; Home
// is never in the editor, so the real store is not needed.
vi.mock('~/ducks/store', () => ({ store: { getState: () => ({}) } }));
vi.mock('~/hooks/useProtocolNavGuard', () => ({
  getLeavePersistence: () => 'no-protocol',
  isProtocolPath: (path: string) => path.startsWith('/protocol'),
  promptLeaveEditor: vi.fn(),
}));

vi.mock('~/templates', () => ({
  BUNDLED_TEMPLATES: [],
}));

vi.mock('~/templates/sample-protocol', () => ({
  loadSampleAssets: vi.fn(),
  sampleProtocol: {},
}));

type LegacyHandler = (
  id: string,
  finalFocus?: () => HTMLElement | null,
) => void;
const libraryProps = vi.hoisted(() => ({
  current: undefined as
    | {
        onOpenLegacyProtocol: LegacyHandler;
        onUpgradeLegacyProtocol: LegacyHandler;
        onOpenInLegacyArchitect: (id: string) => void;
      }
    | undefined,
}));
vi.mock('../LibraryPanel', () => ({
  default: (props: NonNullable<typeof libraryProps.current>) => {
    libraryProps.current = props;
    return null;
  },
}));

const bundledLegacyArchitect = vi.hoisted(() => ({
  current: null as { version: string; path: '/v8/' } | null,
}));
const goToLegacyArchitectMock = vi.hoisted(() => vi.fn());
vi.mock('~/utils/legacyArchitect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/legacyArchitect')>()),
  getBundledLegacyArchitect: () => bundledLegacyArchitect.current,
  goToLegacyArchitect: goToLegacyArchitectMock,
}));
vi.mock('../ProtocolLoadingOverlay', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="protocol-loading-overlay" /> : null,
}));
vi.mock('../TransitMap', () => ({ default: () => null }));

import Home from '../Home';

describe('<Home />', () => {
  it('uses medium call-to-action buttons colored by role', () => {
    render(<Home />);

    const createButton = screen.getByRole('button', {
      name: 'Create a new protocol',
    });
    const openButton = screen.getByRole('button', {
      name: 'Open existing protocol',
    });

    expect(createButton).toHaveClass('h-12', 'text-base');
    expect(createButton).toHaveClass(
      '[--component-bg:var(--primary-contrast)]',
      '[--component-text:var(--primary)]',
      'focus:outline-primary',
    );
    expect(openButton).toHaveClass('h-12', 'text-base');
    expect(openButton).toHaveClass(
      'control-glass',
      '[--component-bg:var(--neutral-contrast)]',
      '[--component-text:var(--neutral-contrast)]',
    );
  });

  it('reopens a protocol after migration is approved', async () => {
    const { openLocalNetcanvas } =
      await import('~/ducks/modules/userActions/userActions');
    vi.mocked(openLocalNetcanvas).mockClear();
    const statuses = [{ status: 'migration-required' }, { status: 'opened' }];
    dispatchMock.mockImplementation(() => ({
      unwrap: () => Promise.resolve(statuses.shift()),
    }));
    // Approve exactly what the current result asks for, as a researcher would.
    showProtocolOpenResultDialogMock.mockImplementation(
      async ({
        result,
        onApproveMigration,
      }: {
        result: { status: string };
        onApproveMigration?: () => Promise<void>;
      }) => {
        if (result.status === 'migration-required')
          await onApproveMigration?.();
      },
    );

    render(<Home />);

    await act(async () => {
      dropzoneRef.onDrop?.([new File(['{}'], 'protocol.netcanvas')], []);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      vi.mocked(openLocalNetcanvas).mock.calls.map(([arg]) => arg),
    ).toEqual([
      { file: expect.any(File), migrationApproved: false },
      { file: expect.any(File), migrationApproved: true },
    ]);
  });

  it('opens nothing when several protocols are dropped at once', async () => {
    const { openLocalNetcanvas } =
      await import('~/ducks/modules/userActions/userActions');
    vi.mocked(openLocalNetcanvas).mockClear();
    dispatchMock.mockReset();

    render(<Home />);

    // The shape react-dropzone (>= 19) reports for a two-file drop with
    // `multiple: false`: the first file accepted, the surplus rejected.
    const surplus = new File(['{}'], 'second.netcanvas');
    await act(async () => {
      dropzoneRef.onDrop?.(
        [new File(['{}'], 'first.netcanvas')],
        [
          {
            file: surplus,
            errors: [{ code: 'too-many-files', message: 'Too many files' }],
          },
        ],
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(openLocalNetcanvas).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('keeps the loading overlay off while a protocol-open dialog is awaited', async () => {
    dispatchMock.mockReset();
    showProtocolOpenResultDialogMock.mockReset();
    dispatchMock.mockReturnValue({
      unwrap: () => Promise.resolve({ status: 'migration-required' }),
    });
    // Leave the dialog pending to represent the user reading it and deciding.
    let resolveDialog: (() => void) | undefined;
    showProtocolOpenResultDialogMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDialog = resolve;
        }),
    );

    render(<Home />);

    await act(async () => {
      dropzoneRef.onDrop?.([new File(['{}'], 'protocol.netcanvas')], []);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(showProtocolOpenResultDialogMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId('protocol-loading-overlay'),
    ).not.toBeInTheDocument();

    resolveDialog?.();
  });

  it('offers to keep a dropped file in Architect 8 only when Architect 8 is bundled', async () => {
    dispatchMock.mockReset();
    showProtocolOpenResultDialogMock.mockReset();
    dispatchMock.mockReturnValue({
      unwrap: () => Promise.resolve({ status: 'migration-required' }),
    });
    render(<Home />);

    const drop = async () =>
      act(async () => {
        dropzoneRef.onDrop?.([new File(['{}'], 'protocol.netcanvas')], []);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

    bundledLegacyArchitect.current = null;
    await drop();
    bundledLegacyArchitect.current = { version: '8.5.0', path: '/v8/' };
    await drop();

    const offers = showProtocolOpenResultDialogMock.mock.calls.map(
      ([args]) => (args as { onKeepLegacy?: unknown }).onKeepLegacy,
    );
    expect(offers).toEqual([undefined, expect.any(Function)]);
    bundledLegacyArchitect.current = null;
  });

  it('opens an Architect 8 protocol through the choice, with the overlay off while it is shown', async () => {
    const { planLegacyProtocolOpen } =
      await import('~/ducks/modules/userActions/userActions');
    const offer = {
      status: 'migration-required',
      protocolSchemaVersion: 8,
      targetSchemaVersion: 9,
      migrationNotes: [],
    };
    vi.mocked(planLegacyProtocolOpen).mockResolvedValue({
      status: 'ready',
      choice: undefined,
      result: offer as never,
    });
    showProtocolOpenResultDialogMock.mockReset();
    let resolveDialog: (() => void) | undefined;
    showProtocolOpenResultDialogMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDialog = resolve;
        }),
    );
    render(<Home />);
    const finalFocus = () => null;

    await act(async () => {
      libraryProps.current?.onOpenLegacyProtocol('legacy-1', finalFocus);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(planLegacyProtocolOpen).toHaveBeenCalledWith('legacy-1');
    expect(showProtocolOpenResultDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({ result: offer, finalFocus }),
    );
    expect(
      screen.queryByTestId('protocol-loading-overlay'),
    ).not.toBeInTheDocument();
    resolveDialog?.();
  });

  it('opens an Architect 8 protocol in Architect 8 from its menu', async () => {
    bundledLegacyArchitect.current = { version: '8.5.0', path: '/v8/' };
    goToLegacyArchitectMock.mockReset();
    render(<Home />);

    await act(async () => {
      libraryProps.current?.onOpenInLegacyArchitect('legacy-1');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(goToLegacyArchitectMock).toHaveBeenCalledExactlyOnceWith(
      '/v8/?open=legacy-1',
    );
    bundledLegacyArchitect.current = null;
  });
});

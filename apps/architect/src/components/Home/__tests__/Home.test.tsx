import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const openFileDialogMock = vi.hoisted(() => vi.fn());
const dropzoneRef = vi.hoisted(() => ({
  onDrop: undefined as ((files: File[]) => void) | undefined,
}));

vi.mock('react-dropzone', () => ({
  useDropzone: (options: { onDrop: (files: File[]) => void }) => {
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

vi.mock('~/components/ProjectNav/NavShell', () => ({
  default: ({ trailing }: { trailing: ReactNode }) => <nav>{trailing}</nav>,
}));

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
}));

vi.mock('~/templates', () => ({
  BUNDLED_TEMPLATES: [],
}));

vi.mock('~/templates/sample-protocol', () => ({
  loadSampleAssets: vi.fn(),
  sampleProtocol: {},
}));

vi.mock('../LibraryPanel', () => ({ default: () => null }));
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
      '[--component-bg:var(--neutral-contrast)]',
      '[--component-text:var(--neutral)]',
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
      dropzoneRef.onDrop?.([new File(['{}'], 'protocol.netcanvas')]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      vi.mocked(openLocalNetcanvas).mock.calls.map(([arg]) => arg),
    ).toEqual([
      { file: expect.any(File), migrationApproved: false },
      { file: expect.any(File), migrationApproved: true },
    ]);
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
      dropzoneRef.onDrop?.([new File(['{}'], 'protocol.netcanvas')]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(showProtocolOpenResultDialogMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId('protocol-loading-overlay'),
    ).not.toBeInTheDocument();

    resolveDialog?.();
  });
});

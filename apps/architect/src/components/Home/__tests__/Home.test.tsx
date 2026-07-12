import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const openFileDialogMock = vi.hoisted(() => vi.fn());

vi.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
    open: openFileDialogMock,
  }),
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

vi.mock('~/components/protocolOpenDialogs', () => ({
  showProtocolOpenResultDialog: vi.fn(),
}));

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => vi.fn(),
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
vi.mock('../ProtocolLoadingOverlay', () => ({ default: () => null }));
vi.mock('../TransitMap', () => ({ default: () => null }));

import Home from '../Home';

describe('<Home />', () => {
  it('uses medium brand-colored call-to-action buttons', () => {
    render(<Home />);

    const createButton = screen.getByRole('button', {
      name: 'Create a new protocol',
    });
    const openButton = screen.getByRole('button', {
      name: 'Open existing protocol',
    });

    expect(createButton).toHaveClass('h-12', 'text-base');
    expect(openButton).toHaveClass('h-12', 'text-base');
    expect(openButton).toHaveClass(
      '[--component-bg:var(--accent-contrast)]',
      '[--component-text:var(--accent)]',
      'focus:outline-accent',
    );
  });
});

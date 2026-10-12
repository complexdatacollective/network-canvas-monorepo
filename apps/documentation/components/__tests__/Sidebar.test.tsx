import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => '/en/design-protocols/interface-documentation'),
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}));

// The search box is an Algolia client; it only needs to be present so the
// assertions can tell "sidebar could not be built" from "nothing rendered".
vi.mock('../DocSearchComponent', () => ({
  default: () => <div data-testid="doc-search" />,
}));

import { Sidebar } from '../Sidebar';

const sidebarJson = {
  en: {
    'design-protocols': {
      sourceFile: '/docs/design-protocols.en.mdx',
      children: {
        'key-concepts': {
          type: 'file',
          label: 'Key concepts',
          navOrder: null,
          sourceFile: '/docs/design-protocols/key-concepts.en.mdx',
        },
      },
    },
  },
};

function mockSidebarFetch(response: Partial<Response>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response as Response));
}

describe('Sidebar', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/en/design-protocols');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the section it finds in the sidebar data', async () => {
    mockSidebarFetch({ json: () => Promise.resolve(sidebarJson) });

    render(<Sidebar />);

    expect(await screen.findByText('Key concepts')).toBeInTheDocument();
  });

  it('renders search only when the path names no known section', async () => {
    // A legacy, non-locale-prefixed URL that reached the app without being
    // redirected puts a page slug where the section belongs. Indexing the
    // sidebar tree with it used to throw a TypeError and take the page down.
    mockUsePathname.mockReturnValue('/interface-documentation/information');
    mockSidebarFetch({ json: () => Promise.resolve(sidebarJson) });

    expect(() => render(<Sidebar />)).not.toThrow();

    expect(await screen.findByTestId('doc-search')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Key concepts')).not.toBeInTheDocument();
  });

  it('stops showing a loading state once the sidebar data fails to load', async () => {
    const error = new SyntaxError('Unexpected end of JSON input');
    mockSidebarFetch({ json: () => Promise.reject(error) });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    render(<Sidebar />);

    // Without this the sidebar promises a tree that is never coming.
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('doc-search')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to load sidebar data:',
      error,
    );
  });
});

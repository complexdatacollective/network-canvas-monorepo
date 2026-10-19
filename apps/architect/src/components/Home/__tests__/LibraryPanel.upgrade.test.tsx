import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredProtocolRow } from '~/utils/assetDB';

import LibraryPanel from '../LibraryPanel';

const mocks = vi.hoisted(() => ({
  isSubpath: true,
  navigate: vi.fn(() => Promise.resolve(true)),
  protocols: [] as StoredProtocolRow[],
}));

vi.mock('~/utils/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/appBase')>()),
  get IS_SUBPATH_BUILD() {
    return mocks.isSubpath;
  },
}));

vi.mock('~/hooks/useNavigateToArchitect9', () => ({
  useNavigateToArchitect9: () => mocks.navigate,
}));

vi.mock('~/hooks/useProtocolLibrary', () => ({
  useProtocolLibrary: () => ({ protocols: mocks.protocols, isLoaded: true }),
}));

const row = (id: string, schemaVersion: number) =>
  ({
    id,
    name: `Protocol ${id}`,
    schemaVersion,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    protocol: { stages: [], codebook: { node: {}, edge: {} } },
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

const openMenu = async () => {
  fireEvent.click(screen.getByRole('button', { name: /actions for/i }));
  await screen.findByRole('menuitem', { name: 'Open' });
};

beforeEach(() => {
  mocks.isSubpath = true;
  mocks.navigate.mockClear();
  mocks.protocols = [row('3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f', 8)];
});

describe('<LibraryPanel /> Upgrade to schema 9', () => {
  it('sends the row to Architect 9’s upgrade confirmation', async () => {
    renderPanel();
    await openMenu();

    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Upgrade to schema 9' }),
    );

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith(
        '/?upgrade=3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f',
      );
    });
  });

  it('offers it for a schema 7 row as well', async () => {
    mocks.protocols = [row('older', 7)];
    renderPanel();
    await openMenu();

    expect(
      screen.getByRole('menuitem', { name: 'Upgrade to schema 9' }),
    ).toBeInTheDocument();
  });

  it('is not offered by the root build', async () => {
    mocks.isSubpath = false;
    renderPanel();
    await openMenu();

    expect(
      screen.queryByRole('menuitem', { name: 'Upgrade to schema 9' }),
    ).not.toBeInTheDocument();
  });
});

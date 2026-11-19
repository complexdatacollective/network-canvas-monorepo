import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import Codebook from '~/components/Codebook/Codebook';
import VariableRoleConflictsAlert from '~/components/VariableRoleConflictsAlert';
import { architectCatalogSource } from '~/locales/catalogs';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

// Supply large counts without rendering thousands of unrelated entity editors.
// Sparse arrays retain their actual length and native map behavior.
const largeCounts = vi.hoisted(() => {
  const sparseCount = (count: number) => {
    const entries: never[] = [];
    entries.length = count;
    return entries;
  };
  return {
    nodes: sparseCount(12345),
    edges: sparseCount(23456),
    processedNetworkAssets: sparseCount(34567),
    conflicts: sparseCount(45678),
  };
});
vi.mock('~/components/Codebook/useCodebookData', () => ({
  useCodebookData: () => ({
    ...largeCounts,
    hasEgoVariables: false,
    hasNodes: true,
    hasEdges: true,
    hasNetworkAssets: true,
  }),
}));
vi.mock('~/components/Codebook/EgoType', () => ({ default: () => null }));
vi.mock('~/selectors/issues', () => ({
  getVariableRoleConflicts: () => largeCounts.conflicts,
}));

// The provider shows a language once its catalog has loaded. Loading
// Spanish up front lets a switch to it render synchronously, as the
// assertions below expect.
beforeAll(() => architectCatalogSource.load('es'));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('formats every Codebook count and the sibling conflict count in the active locale', () => {
  const state = {
    activeProtocol: {
      present: { codebook: {}, stages: [], assetManifest: {} },
    },
  };
  const store = configureStore({ reducer: () => state });
  render(
    <Provider store={store}>
      <ArchitectI18nProvider>
        <Codebook />
        <VariableRoleConflictsAlert />
      </ArchitectI18nProvider>
    </Provider>,
  );
  expect
    .soft(screen.queryByRole('heading', { name: 'Node Types (12,345)' }))
    .toBeInTheDocument();
  expect
    .soft(screen.queryByRole('heading', { name: 'Edge Types (23,456)' }))
    .toBeInTheDocument();
  expect
    .soft(screen.queryByRole('heading', { name: 'Network Assets (34,567)' }))
    .toBeInTheDocument();
  expect
    .soft(
      screen.queryByText(
        '45,678 attributes are written both with and without validation',
      ),
    )
    .toBeInTheDocument();
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', { key: ARCHITECT_LOCALE_KEY }),
    );
  });
  expect(
    screen.getByRole('heading', { name: 'Tipos de nodo (12.345)' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Tipos de vínculo (23.456)' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Recursos de red (34.567)' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      '45.678 atributos se escriben tanto con validación como sin ella',
    ),
  ).toBeInTheDocument();
  expect(store.getState()).toBe(state);
});

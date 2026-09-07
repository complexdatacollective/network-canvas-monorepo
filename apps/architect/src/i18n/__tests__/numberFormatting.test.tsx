import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useDragControls } from 'motion/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Codebook from '~/components/Codebook/Codebook';
import Option, { OptionsContext } from '~/components/Form/arrayFields/Option';
import VariableRoleConflictsAlert from '~/components/VariableRoleConflictsAlert';

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

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});

it('localizes option positions while leaving the authored option value and action identity intact', () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const item = { label: 'Research_label', value: 12345 };
  function Row() {
    const dragControls = useDragControls();
    return (
      <Option
        item={item}
        index={12344}
        itemCount={12345}
        isNewItem={false}
        onCancel={vi.fn()}
        onMove={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
        isSortable={false}
        isBeingEdited={false}
        disabled={false}
        readOnly={false}
        dragControls={dragControls}
        getAddTrigger={() => null}
      />
    );
  }
  render(
    <ArchitectI18nProvider>
      <OptionsContext.Provider
        value={{ arrayName: 'options', allValues: {}, showArrayError: false }}
      >
        <Row />
      </OptionsContext.Provider>
    </ArchitectI18nProvider>,
  );
  expect
    .soft(screen.queryByRole('button', { name: 'Edit option 12,345' }))
    .toBeInTheDocument();
  expect
    .soft(screen.queryByRole('button', { name: 'Remove option 12,345' }))
    .toBeInTheDocument();
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', { key: ARCHITECT_LOCALE_KEY }),
    );
  });
  fireEvent.click(screen.getByRole('button', { name: 'Editar opción 12.345' }));
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Eliminar opción 12.345' }),
  ).toBeInTheDocument();
  expect(screen.getByText('12345')).toBeInTheDocument();
  expect(item).toEqual({ label: 'Research_label', value: 12345 });
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
    screen.getByRole('heading', { name: 'Tipos de nodos (12.345)' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Tipos de vínculos (23.456)' }),
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

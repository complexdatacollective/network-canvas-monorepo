import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { sortByLabel } from '~/components/Codebook/helpers';
import Variables from '~/components/Codebook/Variables';
import NativeSelect from '~/components/Form/Fields/NativeSelect';
import { toSelectOptions } from '~/components/sections/Form/helpers';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

it('reorders alphabetical native selects live while preserving authored option order when sorting is disabled', () => {
  const options = [
    { label: 'Zulu', value: 'z' },
    { label: 'ño', value: 'enye' },
    { label: 'nz', value: 'nz', disabled: true },
    { label: 'Árbol', value: 'tree' },
  ];
  const original = structuredClone(options);
  const onChange = vi.fn();
  render(
    <ArchitectI18nProvider>
      <label htmlFor="sorted">Sorted</label>
      <NativeSelect
        id="sorted"
        options={options}
        value="enye"
        onChange={onChange}
      />
      <label htmlFor="authored">Authored</label>
      <NativeSelect
        id="authored"
        options={options}
        value="z"
        sortOptionsByLabel={false}
      />
    </ArchitectI18nProvider>,
  );
  const sorted = screen.getByRole('combobox', { name: 'Sorted' });
  const authored = screen.getByRole('combobox', { name: 'Authored' });
  const values = (select: HTMLElement) =>
    within(select)
      .getAllByRole('option')
      .slice(1)
      .map((option) => option.getAttribute('value'));
  expect(values(sorted)).toEqual(['tree', 'enye', 'nz', 'z']);
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', { key: ARCHITECT_LOCALE_KEY }),
    );
  });
  expect(values(sorted)).toEqual(['tree', 'nz', 'enye', 'z']);
  expect(values(authored)).toEqual(['z', 'enye', 'nz', 'tree']);
  expect(sorted).toHaveValue('enye');
  expect(within(sorted).getByRole('option', { name: 'nz' })).toBeDisabled();
  fireEvent.change(sorted, { target: { value: 'tree' } });
  expect(onChange).toHaveBeenCalledWith('tree');
  expect(options).toEqual(original);
});

const labels = vi.hoisted(() => ({
  first: 'ñandú2',
  second: 'nz1',
  third: 'ño10',
}));
// Keep the real DataTable and row model; the pill's Redux name lookup is unrelated.
vi.mock('~/components/VariablePill', () => ({
  ConnectedVariablePill: ({ uuid }: { uuid: keyof typeof labels }) => (
    <span>{labels[uuid]}</span>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('recomputes an already-sorted codebook in the selected locale while preserving its rows and sort state', async () => {
  const variables = Object.entries(labels).map(([id, name]) => ({
    id,
    name,
    component: 'Text',
    inUse: false,
    usage: [],
  }));
  const original = structuredClone(variables);
  const store = configureStore({ reducer: { fixture: () => ({}) } });
  render(
    <Provider store={store}>
      <ArchitectI18nProvider>
        <Variables entity="ego" variables={variables} />
      </ArchitectI18nProvider>
    </Provider>,
  );
  const names = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]?.textContent);
  expect(names()).toEqual(['ñandú2', 'ño10', 'nz1']);
  fireEvent.click(screen.getByRole('button', { name: 'Name' }));
  fireEvent.click(
    await screen.findByRole('menuitemradio', { name: 'Sort descending' }),
  );
  expect(names()).toEqual(['nz1', 'ño10', 'ñandú2']);
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: 'es',
      }),
    );
  });
  expect(names()).toEqual(['ño10', 'ñandú2', 'nz1']);
  expect(variables).toEqual(original);
});

it('sorts translated usage labels and within-group input controls by the supplied locale', () => {
  const options = [
    {
      label: 'ño',
      value: 'first',
      description: 'Authored description',
      image: 'Authored_First.svg',
    },
    {
      label: 'nz',
      value: 'second',
      description: 'Authored description',
      image: 'Authored_Second.svg',
    },
  ];
  const original = structuredClone(options);
  for (const [locale, expectedOrder] of [
    ['en', ['first', 'second']],
    ['es', ['second', 'first']],
  ] as const) {
    const intl = createAppIntl({ locale });
    expect(
      options
        .toSorted((a, b) => sortByLabel(a, b, intl))
        .map((option) => option.value),
    ).toEqual(expectedOrder);
    const [group] = toSelectOptions(
      [{ label: 'Authored_Group', options }],
      { sorted: true },
      intl,
    );
    expect(group?.label).toBe('Authored_Group');
    expect(
      group &&
        'options' in group &&
        group.options.map((option) => option.value),
    ).toEqual(expectedOrder);
    expect(
      toSelectOptions(options, { sorted: true }, intl).map(
        (option) => 'value' in option && option.value,
      ),
    ).toEqual(expectedOrder);
    expect(
      toSelectOptions(options, { sorted: false }, intl).map(
        (option) => 'value' in option && option.value,
      ),
    ).toEqual(['first', 'second']);
  }
  expect(options).toEqual(original);
});

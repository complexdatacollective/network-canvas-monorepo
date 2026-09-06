import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import Stage from '~/lib/ProtocolSummary/components/Stage/Stage';
import SummaryContext from '~/lib/ProtocolSummary/components/SummaryContext';
import Variables from '~/lib/ProtocolSummary/components/Variables';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

const protocol = {
  name: 'Authored protocol',
  schemaVersion: 8,
  codebook: {},
  assetManifest: {},
  stages: [
    {
      id: 'authored-stage',
      label: 'Authored stage',
      type: 'Information',
      title: 'Authored title',
      items: [],
    },
  ],
} satisfies CurrentProtocol;

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const selectSpanish = () => {
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', { key: ARCHITECT_LOCALE_KEY }),
    );
  });
};

it('reorders both printed attribute surfaces after a locale change without changing names or link targets', () => {
  const index = ['Árbol', 'Zulu', 'ño', 'nz'].map((name, position) => ({
    id: `attribute-${position}`,
    name,
    type: 'text',
    stages: ['authored-stage'],
  }));
  const variables = Object.fromEntries(
    index.map(({ id, name }) => [id, { name, type: 'text' }]),
  );
  const original = structuredClone({ index, variables });
  const { container } = render(
    <ArchitectI18nProvider>
      <SummaryContext.Provider
        value={{ protocol, protocolName: 'Authored protocol', index }}
      >
        <Stage
          id="authored-stage"
          label="Authored stage"
          type="Information"
          stageNumber={12345}
          configuration={{}}
        />
        <Variables variables={variables} />
      </SummaryContext.Provider>
    </ArchitectI18nProvider>,
  );
  const links = () =>
    screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('#variable-'))
      .map((link) => [link.textContent, link.getAttribute('href')]);
  const rows = () =>
    [...container.querySelectorAll('tr[id^="variable-"]')].map((row) => row.id);
  const expected = (order: number[]) =>
    order.map((position) => [
      index[position]?.name,
      `#variable-attribute-${position}`,
    ]);
  expect.soft(links()).toEqual(expected([0, 2, 3, 1]));
  expect
    .soft(rows())
    .toEqual([0, 2, 3, 1].map((position) => `variable-attribute-${position}`));
  expect
    .soft(container.querySelector('[data-number]'))
    .toHaveAttribute('data-number', '12,345');

  selectSpanish();

  expect(links()).toEqual(expected([0, 3, 2, 1]));
  expect(rows()).toEqual(
    [0, 3, 2, 1].map((position) => `variable-attribute-${position}`),
  );
  expect(container.querySelector('[data-number]')).toHaveAttribute(
    'data-number',
    '12.345',
  );
  expect(
    screen.getByRole('heading', { name: 'Authored stage' }),
  ).toBeInTheDocument();
  expect({ index, variables }).toEqual(original);
});

it('formats a whole linked list using the literal names, including Spanish e before an i sound and duplicate names', () => {
  const index = ['Bravo', 'Bravo', 'Isabel'].map((name, position) => ({
    id: `attribute-${position}`,
    name,
    type: 'text',
    stages: ['authored-stage'],
  }));
  render(
    <ArchitectI18nProvider>
      <SummaryContext.Provider
        value={{ protocol, protocolName: 'Authored protocol', index }}
      >
        <Stage
          id="authored-stage"
          label="Authored stage"
          type="Information"
          stageNumber={1}
          configuration={{}}
        />
      </SummaryContext.Provider>
    </ArchitectI18nProvider>,
  );
  const cell = screen.getByRole('link', { name: 'Isabel' }).closest('td');
  if (!cell) throw new Error('Printed attribute list is absent');
  expect.soft(cell.textContent).toBe('Bravo, Bravo, and Isabel');
  selectSpanish();
  expect(cell.textContent).toBe('Bravo, Bravo e Isabel');
  expect(
    within(cell)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href')),
  ).toEqual([
    '#variable-attribute-0',
    '#variable-attribute-1',
    '#variable-attribute-2',
  ]);
});

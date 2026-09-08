import 'fake-indexeddb/auto';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { interviewerProductionLocales } from '~/i18n/locales';
import { db } from '~/lib/db/db';
import type { StoredSessionRow } from '~/lib/db/recordCrypto';
import type { ProtocolWithCounts } from '~/lib/db/types';
import { interviewerCatalogs } from '~/locales/catalogs';

import { DataView } from '../DataView';

// Render the actual option labels/values supplied by DataView. The toolbar's
// popup mechanics are unrelated to the parent's memoized ordering.
vi.mock('../DataViewToolbar', () => ({
  DataViewToolbar: ({
    protocolOptions,
  }: {
    protocolOptions: { label: string; value: string }[];
  }) => (
    <select aria-label="Protocol filter">
      {protocolOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

// Sorting is read-only; exporting/deleting and their authentication providers
// are deliberately outside this table/query integration test.
vi.mock('../useSessionMutations', () => ({
  useSessionMutations: () => ({
    exportFlow: { phase: 'idle' },
    preparingExport: false,
    deleting: false,
    markingUnfinishedId: null,
    handleExport: vi.fn(),
    handleCancelBuild: vi.fn(),
    handleDismissExport: vi.fn(),
    handleDelete: vi.fn(),
    handleMarkUnfinished: vi.fn(),
    handleShareReady: vi.fn(),
  }),
}));

const protocols: ProtocolWithCounts[] = ['Ñandú', 'Nube'].map((name) => ({
  id: name,
  hash: name,
  name,
  schemaVersion: 8,
  importedAt: '2026-09-05T00:00:00.000Z',
  codebook: {},
  sessionCount: 1,
  protocol: {
    name,
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  },
}));
const sessions: StoredSessionRow[] = protocols.map((protocol) => ({
  id: protocol.id,
  protocolHash: protocol.hash,
  protocolName: protocol.name,
  caseId: protocol.name,
  startedAt: '2026-09-05T00:00:00.000Z',
  lastUpdatedAt: '2026-09-05T00:00:00.000Z',
  finishedAt: null,
  exportedAt: null,
  currentStep: 0,
}));
const reload = async () => {};

function Harness({ locale }: { locale: 'en' | 'es' }) {
  return (
    <AppI18nProvider
      locale={locale}
      locales={interviewerProductionLocales}
      messages={interviewerCatalogs[locale]}
    >
      <DataView protocols={protocols} onReload={reload} />
    </AppI18nProvider>
  );
}

function caseCells() {
  return screen
    .getAllByRole('row')
    .flatMap((row) => within(row).queryAllByRole('cell').slice(1, 2));
}

beforeEach(async () => {
  window.history.replaceState({}, '', '/data?sort=caseId&dir=asc');
  await db.sessions.clear();
  await db.sessions.bulkPut(sessions);
});
afterEach(async () => {
  cleanup();
  await db.sessions.clear();
});

describe('DataView active-locale sorting', () => {
  it('reorders protocol filter options on locale change with the same protocol array', async () => {
    const view = render(<Harness locale="en" />);
    const labels = () =>
      within(screen.getByRole('combobox', { name: 'Protocol filter' }))
        .getAllByRole('option')
        .map((option) => option.textContent);
    expect(labels()).toEqual(['Ñandú', 'Nube']);
    view.rerender(<Harness locale="es" />);
    await waitFor(() => expect(labels()).toEqual(['Nube', 'Ñandú']));
    view.rerender(<Harness locale="en" />);
    await waitFor(() => expect(labels()).toEqual(['Ñandú', 'Nube']));
    expect(
      within(screen.getByRole('combobox', { name: 'Protocol filter' }))
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['Ñandú', 'Nube']);
  });

  it('requeries actual table rows on locale change without losing selection or changing stored data', async () => {
    const user = userEvent.setup();
    const view = render(<Harness locale="en" />);
    await waitFor(() =>
      expect(caseCells().map((cell) => cell.textContent)).toEqual([
        'Ñandú',
        'Nube',
      ]),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Select Ñandú' }));
    expect(
      screen.getByRole('checkbox', { name: 'Select Ñandú' }),
    ).toBeChecked();
    view.rerender(<Harness locale="es" />);
    await waitFor(() =>
      expect(caseCells().map((cell) => cell.textContent)).toEqual([
        'Nube',
        'Ñandú',
      ]),
    );
    expect(
      screen.getByRole('checkbox', { name: 'Seleccionar Ñandú' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Seleccionar Nube' }),
    ).not.toBeChecked();
    view.rerender(<Harness locale="en" />);
    await waitFor(() =>
      expect(caseCells().map((cell) => cell.textContent)).toEqual([
        'Ñandú',
        'Nube',
      ]),
    );
    expect(
      screen.getByRole('checkbox', { name: 'Select Ñandú' }),
    ).toBeChecked();
    expect(
      await db.sessions.bulkGet(sessions.map((session) => session.id)),
    ).toEqual(sessions);
  });
});

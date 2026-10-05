import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import Table from '~/components/Assets/Table';
import Asset from '~/lib/ProtocolSummary/components/Asset';
import AssetBadge from '~/lib/ProtocolSummary/components/AssetBadge';
import AssetManifest from '~/lib/ProtocolSummary/components/AssetManifest';
import Contents from '~/lib/ProtocolSummary/components/Contents';
import MapOptions from '~/lib/ProtocolSummary/components/Stage/MapOptions';
import SummaryContext from '~/lib/ProtocolSummary/components/SummaryContext';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

// The print headings and reference tables are real; blob I/O is unrelated.
vi.mock('~/utils/assetUtils', () => ({
  getAssetBlobUrl: vi.fn(async () => null),
  revokeBlobUrl: vi.fn(),
}));
const networkAttributes = vi.hoisted(() => [
  'Authored_Á1',
  'Authored_ß2',
  'Authored_Ω3',
]);
vi.mock('~/utils/protocols/assetTools', () => ({
  getNetworkVariables: vi.fn(async () => networkAttributes),
}));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('updates resource types in all three print presenters and preserves authored resource metadata', () => {
  const protocol: CurrentProtocol = {
    name: 'Research_Protocol',
    schemaVersion: 8,
    stages: [],
    codebook: {},
    assetManifest: {
      research_api: {
        type: 'apikey',
        name: 'Research_Map_Á1',
        value: 'Authored_API_Value',
      },
      research_video: {
        type: 'video',
        name: 'Research_Video.mp4',
        source: 'video.mp4',
      },
    },
  };
  const before = structuredClone(protocol);
  render(
    <ArchitectI18nProvider>
      <SummaryContext.Provider
        value={{ protocol, protocolName: 'Research_Protocol', index: [] }}
      >
        <section aria-label="Contents fixture">
          <Contents />
        </section>
        <section aria-label="Resource reference fixture">
          <AssetBadge id="research_api" />
        </section>
        <section aria-label="Resource library fixture">
          <AssetManifest />
        </section>
      </SummaryContext.Provider>
    </ArchitectI18nProvider>,
  );
  const contents = within(
    screen.getByRole('region', { name: 'Contents fixture' }),
  );
  const reference = within(
    screen.getByRole('region', { name: 'Resource reference fixture' }),
  );
  const library = within(
    screen.getByRole('region', { name: 'Resource library fixture' }),
  );
  expect(contents.getByText('API key')).toBeVisible();
  expect(reference.getByRole('cell', { name: 'API key' })).toBeVisible();
  expect(library.getByRole('heading', { name: 'API key' })).toBeVisible();
  const video = library.getByLabelText('Research_Video.mp4');
  Object.defineProperty(video, 'duration', { value: 12.5, configurable: true });
  fireEvent.loadedMetadata(video);
  expect(library.getByRole('cell', { name: '12.5s' })).toBeVisible();
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: 'es',
      }),
    );
  });
  expect(contents.getByText('Clave de API')).toBeVisible();
  expect(reference.getByRole('cell', { name: 'Clave de API' })).toBeVisible();
  expect(library.getByRole('heading', { name: 'Clave de API' })).toBeVisible();
  expect(library.getByRole('cell', { name: '12,5s' })).toBeVisible();
  for (const presenter of [contents, reference, library]) {
    expect(presenter.getByText('Research_Map_Á1')).toBeVisible();
  }
  expect(protocol).toEqual(before);
});

it('formats map numbers in the selected language without changing geographic values or precision', () => {
  const mapOptions = {
    center: [12.3456, -6.789] as [number, number],
    initialZoom: 12.5,
  };
  const original = structuredClone(mapOptions);
  render(
    <ArchitectI18nProvider>
      <MapOptions mapOptions={mapOptions} />
    </ArchitectI18nProvider>,
  );
  expect(screen.getByRole('cell', { name: '-6.7890, 12.3456' })).toBeVisible();
  expect(screen.getByRole('cell', { name: '12.5' })).toBeVisible();
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: 'es',
      }),
    );
  });
  expect(screen.getByRole('cell', { name: '-6,7890; 12,3456' })).toBeVisible();
  expect(screen.getByRole('cell', { name: '12,5' })).toBeVisible();
  expect(mapOptions).toEqual(original);
});

it('re-sorts existing resource rows for Spanish while preserving sort direction and raw data', () => {
  const data = [
    { name: 'ñandú2' },
    { name: 'nz1' },
    { name: 'ño10' },
    { name: 'ñandú10' },
  ];
  const original = structuredClone(data);
  render(
    <ArchitectI18nProvider>
      <Table
        data={data}
        columns={[{ Header: 'Research_Name', accessor: 'name' }]}
      />
    </ArchitectI18nProvider>,
  );
  const header = screen.getByRole('columnheader', { name: 'Research_Name' });
  fireEvent.click(header);
  const names = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getByRole('cell').textContent);
  expect(names()).toEqual(['ñandú2', 'ñandú10', 'ño10', 'nz1']);
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: 'es',
      }),
    );
  });
  expect(header).toHaveAttribute('aria-sort', 'ascending');
  expect(names()).toEqual(['nz1', 'ñandú2', 'ñandú10', 'ño10']);
  fireEvent.keyDown(header, { key: 'Enter' });
  expect(header).toHaveAttribute('aria-sort', 'descending');
  expect(names()).toEqual(['ño10', 'ñandú10', 'ñandú2', 'nz1']);
  expect(data).toEqual(original);
});

it('formats the loaded network attribute list in the selected language without altering CSV headers', async () => {
  const protocol: CurrentProtocol = {
    name: 'Research_Protocol',
    schemaVersion: 8,
    stages: [],
    codebook: {},
    assetManifest: {
      network: {
        type: 'network',
        name: 'Research_Data.csv',
        source: 'Research_Data.csv',
      },
    },
  };
  const original = structuredClone(protocol);
  render(
    <ArchitectI18nProvider>
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <Asset id="network" />
      </SummaryContext.Provider>
    </ArchitectI18nProvider>,
  );
  expect(
    await screen.findByRole('cell', {
      name: 'Authored_Á1, Authored_ß2, and Authored_Ω3',
    }),
  ).toBeVisible();
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: 'es',
      }),
    );
  });
  expect(
    screen.getByRole('cell', {
      name: 'Authored_Á1, Authored_ß2 y Authored_Ω3',
    }),
  ).toBeVisible();
  expect(networkAttributes).toEqual([
    'Authored_Á1',
    'Authored_ß2',
    'Authored_Ω3',
  ]);
  expect(protocol).toEqual(original);
});

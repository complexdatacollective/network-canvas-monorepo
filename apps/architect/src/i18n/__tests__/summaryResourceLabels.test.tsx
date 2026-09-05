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
import AssetBadge from '~/lib/ProtocolSummary/components/AssetBadge';
import AssetManifest from '~/lib/ProtocolSummary/components/AssetManifest';
import Contents from '~/lib/ProtocolSummary/components/Contents';
import SummaryContext from '~/lib/ProtocolSummary/components/SummaryContext';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

// The print headings and reference tables are real; blob I/O is unrelated.
vi.mock('~/utils/assetUtils', () => ({
  getAssetBlobUrl: vi.fn(async () => null),
  revokeBlobUrl: vi.fn(),
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

import type { Page } from '@playwright/test';

import { DB_NAME } from '../../src/lib/db/storageNames.js';
import { expect, test } from '../fixtures/test.js';
import {
  dumpDatabase,
  INTERVIEWER_8_NATIVE_VERSION,
  seedAsInterviewer8,
} from '../helpers/legacy-database.js';

// One database, `interviewer`, for both majors. An 8.x device already has it,
// at Interviewer 8's version 3 (native 30); booting Interviewer 9 must upgrade
// it in place to a version above that, keep every store and index Interviewer
// 8 declares, and leave every row exactly as Interviewer 8 wrote it, Blobs
// included. These tests seed that database for real (see
// helpers/legacy-database.ts).
//
// The unit-level counterparts are src/lib/db/__tests__/db.schema.test.ts and
// interviewer8RowFormat.test.ts; this spec covers what jsdom cannot: the full
// boot path in a real browser, including plaintext Blob assets, which jsdom's
// fake-indexeddb cannot round-trip.
const LEGACY_HASH = 'legacy-e2e-protocol-hash';
const PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10];

const LEGACY_SEED = {
  protocol: {
    id: LEGACY_HASH,
    hash: LEGACY_HASH,
    name: 'Legacy Study',
    schemaVersion: 8,
    importedAt: '2026-01-01T00:00:00.000Z',
    codebook: { node: {}, edge: {}, ego: {} },
    protocol: {
      schemaVersion: 8,
      name: 'Legacy Study',
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [],
    },
  },
  session: {
    id: 'legacy-session',
    protocolHash: LEGACY_HASH,
    protocolName: 'Legacy Study',
    caseId: 'legacy-case',
    startedAt: '2026-01-07T10:00:00.000Z',
    lastUpdatedAt: '2026-01-07T10:30:00.000Z',
    finishedAt: null,
    exportedAt: null,
    currentStep: 0,
    network: { ego: { _uid: 'ego', attributes: {} }, nodes: [], edges: [] },
    isSynthetic: false,
  },
  imageAsset: {
    id: `${LEGACY_HASH}::legacy-image`,
    protocolHash: LEGACY_HASH,
    assetId: 'legacy-image',
    name: 'Background',
    type: 'image',
  },
  settings: {
    id: 'device',
    exportGraphML: false,
    idleTimeoutMinutes: 30,
  },
};

// Every store and index Interviewer 8's version 3 declares.
const INTERVIEWER_8_STORES: Record<
  string,
  { keyPath: string; indexes: string[] }
> = {
  assets: { keyPath: 'id', indexes: ['assetId', 'protocolHash'] },
  protocolMigrations: { keyPath: 'previousHash', indexes: [] },
  protocols: { keyPath: 'id', indexes: ['hash', 'importedAt', 'name'] },
  sessions: {
    keyPath: 'id',
    indexes: [
      'caseId',
      'exportedAt',
      'finishedAt',
      'isSynthetic',
      'lastUpdatedAt',
      'protocolHash',
      'startedAt',
    ],
  },
  settings: { keyPath: 'id', indexes: [] },
};

const seedDevice = (page: Page) =>
  seedAsInterviewer8(page, {
    protocols: [LEGACY_SEED.protocol],
    sessions: [LEGACY_SEED.session],
    assets: [
      { ...LEGACY_SEED.imageAsset, mimeType: 'image/png', bytes: PNG_BYTES },
    ],
    settings: [LEGACY_SEED.settings],
  });

test.describe('booting on an 8.x device’s database', () => {
  test('upgrades it in place, keeping every store, index and row', async ({
    page,
  }) => {
    await seedDevice(page);
    const before = await dumpDatabase(page);
    expect(before?.version).toBe(INTERVIEWER_8_NATIVE_VERSION);

    await page.goto('/');
    // The schema 8 protocol is on the deck, read from the same database.
    await expect(
      page.getByRole('heading', { name: 'Legacy Study' }),
    ).toBeVisible();

    await expect
      .poll(async () => (await dumpDatabase(page))?.version)
      .toBeGreaterThan(INTERVIEWER_8_NATIVE_VERSION);
    const after = await dumpDatabase(page);
    for (const [name, expected] of Object.entries(INTERVIEWER_8_STORES)) {
      expect(after?.stores[name]?.keyPath).toBe(expected.keyPath);
      expect(after?.stores[name]?.indexes).toEqual(
        expect.arrayContaining(expected.indexes),
      );
    }

    // Byte for byte as Interviewer 8 wrote them, Blob included.
    for (const store of ['protocols', 'sessions', 'assets']) {
      expect(after?.stores[store]?.rows).toEqual(before?.stores[store]?.rows);
    }
    // The settings row is the one Interviewer 8 wrote, under the same id.
    expect(after?.stores.settings?.rows).toEqual([
      expect.objectContaining(LEGACY_SEED.settings),
    ]);
  });

  test('makes only the one database on a device that never had one', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible();
    // The app's own databases (a service worker may keep one of its own, such
    // as Workbox's expiration store, which is not the app's).
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await indexedDB.databases())
            .map(({ name }) => name ?? '')
            .filter((name) => name.startsWith('interviewer')),
        ),
      )
      .toEqual([DB_NAME]);
  });
});

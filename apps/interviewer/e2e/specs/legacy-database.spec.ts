import type { Page } from '@playwright/test';

import { DB_NAME } from '../../src/lib/db/storageNames.js';
import { expect, test } from '../fixtures/test.js';
import {
  dumpDatabase,
  LEGACY_DB_NAME,
  seedLegacyDatabase,
} from '../helpers/legacy-database.js';

// Interviewer 8's database, `interviewer`, belongs to Interviewer 8 (served at
// /v8/). Booting Interviewer 9 beside it must leave it byte for byte as it
// was, keep Interviewer 9's data in a database of its own, and carry the
// device's settings over once. These tests seed that database for real (see
// helpers/legacy-database.ts).
//
// The unit-level counterparts are src/lib/db/__tests__/legacyLibrary.test.ts,
// settingsCarryOver.test.ts and db.schema.test.ts; this spec covers what
// jsdom cannot: the full boot path in a real browser, including plaintext Blob
// assets, which jsdom's fake-indexeddb cannot round-trip.
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
    sampleProtocolDismissed: true,
  },
};

const seedLegacy = (page: Page) =>
  seedLegacyDatabase(page, {
    protocols: [LEGACY_SEED.protocol],
    sessions: [LEGACY_SEED.session],
    assets: [
      { ...LEGACY_SEED.imageAsset, mimeType: 'image/png', bytes: PNG_BYTES },
    ],
    settings: [LEGACY_SEED.settings],
  });

test.describe('booting beside Interviewer 8’s database', () => {
  test('leaves it untouched, keeps its own database and carries the settings over', async ({
    page,
  }) => {
    await seedLegacy(page);
    const before = await dumpDatabase(page, LEGACY_DB_NAME);
    expect(before?.version).toBe(30);

    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible();

    // Interviewer 9's own database, at its own first version.
    await expect
      .poll(async () => (await dumpDatabase(page, DB_NAME))?.stores.settings)
      .toBeDefined();
    const own = await dumpDatabase(page, DB_NAME);
    expect(own?.version).toBe(10);
    expect(Object.keys(own?.stores ?? {})).toEqual([
      'assets',
      'legacyUpgrades',
      'protocols',
      'sessions',
      'settings',
    ]);
    // None of Interviewer 8's protocols or interviews were copied in.
    expect(own?.stores.sessions?.rows).toEqual([]);
    expect(
      own?.stores.protocols?.rows.some(
        (row) => (row as { hash?: string }).hash === LEGACY_HASH,
      ),
    ).toBe(false);

    // The device's preferences came across; what names Interviewer 8's own
    // library did not (the sample card above is this app's own).
    const settings = own?.stores.settings?.rows.find(
      (row) => (row as { id?: string }).id === 'device',
    );
    expect(settings).toMatchObject({
      exportGraphML: false,
      idleTimeoutMinutes: 30,
      sampleProtocolDismissed: false,
    });

    // Byte for byte as it was, Blob included.
    expect(await dumpDatabase(page, LEGACY_DB_NAME)).toEqual(before);
  });

  test('creates no Interviewer 8 database on a device that never had one', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible();
    expect(await dumpDatabase(page, LEGACY_DB_NAME)).toBeNull();
  });
});

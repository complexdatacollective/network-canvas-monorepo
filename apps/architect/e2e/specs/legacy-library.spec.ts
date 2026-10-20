import { existsSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import {
  LEGACY_LIBRARIES,
  PROTOCOL_DB_NAME,
} from '../../src/utils/storageNames.js';
import { expect, test } from '../fixtures/architect-test.js';
import {
  legacyNetcanvas,
  legacyProtocol,
  legacyProtocolAssets,
} from '../fixtures/legacy-protocol.js';
import { seedLegacyProtocols } from '../fixtures/seed.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import {
  readDatabaseNames,
  readLegacyLibraryFingerprint,
  readLibraryRows,
  readStoreCounts,
} from '../helpers/read-store.js';

/**
 * Architect 8's protocols, as Architect 9 shows them (spec item 13).
 *
 * Architect 8 keeps its library in `ArchitectProtocolDB` on this same origin,
 * and Architect 9 must only ever read it. Every spec that acts on a schema 8
 * protocol therefore fingerprints that library before and after
 * (`readLegacyLibraryFingerprint`: native version, stores, indexes and every
 * row and resource byte) and requires the two to be identical.
 *
 * These run against the suite's own build. The specs that follow a protocol
 * out to Architect 8 need a build that bundles it, and live in
 * `legacy-architect-handoff.spec.ts`.
 */

const [{ dbName: LEGACY_DB_NAME }] = LEGACY_LIBRARIES;
const LEGACY_ID = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';
const LEGACY_NAME = 'Legacy Study';

// Whether the build under test bundles Architect 8 (build.mjs extracts it into
// dist/v8). Today nothing is pinned, so it does not, and production builds
// made before Architect 8.5.0 is pinned look exactly like it.
const SUITE_BUILD_BUNDLES_ARCHITECT_8 = existsSync(
  path.resolve(import.meta.dirname, '../../dist/v8/index.html'),
);

const seedLegacyStudy = (page: Page) =>
  seedLegacyProtocols(page, [
    {
      id: LEGACY_ID,
      protocol: legacyProtocol(LEGACY_NAME),
      assets: legacyProtocolAssets,
    },
  ]);

const libraryRow = (page: Page, name: string) =>
  page.getByRole('option').filter({ hasText: name });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

test('lists an Architect 8 protocol in Recent with a badge naming its schema', async ({
  architectPage,
  seed,
}) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'Current Study' });
  await seedLegacyStudy(architectPage);

  await expect(
    architectPage.getByRole('tab', { name: 'Recent' }),
  ).toHaveAttribute('aria-selected', 'true');
  const row = libraryRow(architectPage, LEGACY_NAME);
  await expect(row).toBeVisible();
  await expect(row).toContainText('Schema 8');
  // Beside this app's own protocols, in one list; only the legacy row is
  // badged.
  await expect(libraryRow(architectPage, 'Current Study')).toBeVisible();
  await expect(libraryRow(architectPage, 'Current Study')).not.toContainText(
    'Schema 8',
  );

  // This app never writes Architect 8's library, so the row has no Delete.
  await row.getByRole('button', { name: `Actions for ${LEGACY_NAME}` }).click();
  const menu = architectPage.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveText([
    ...(SUITE_BUILD_BUNDLES_ARCHITECT_8 ? ['Open in Architect 8'] : []),
    'Upgrade to schema 9',
    'See more info',
    'Download',
  ]);
});

test('upgrading makes a copy in this library and leaves Architect 8’s library byte-for-byte untouched', async ({
  architectPage,
}) => {
  await seedLegacyStudy(architectPage);
  const before = await readLegacyLibraryFingerprint(architectPage);
  expect(before).not.toBeNull();
  expect(await readStoreCounts(architectPage)).toEqual({
    protocols: 0,
    assets: 0,
  });

  await libraryRow(architectPage, LEGACY_NAME).click();
  const dialog = architectPage.getByRole('dialog');
  const upgrade = dialog.getByRole('button', { name: 'Upgrade to schema 9' });
  await expect(upgrade).toBeFocused();
  await expect(dialog).toContainText('Changes in schema version 9:');
  await upgrade.click();

  await expect(architectPage).toHaveURL(/\/protocol$/);
  await expect(
    architectPage.getByRole('textbox', { name: 'Protocol name' }),
  ).toHaveValue(LEGACY_NAME);

  // One new row, under an id of its own, at this app's schema, with the
  // resource copied under that id, and the choice remembered against the
  // Architect 8 row.
  const protocols = await readLibraryRows(architectPage, 'protocols');
  expect(protocols).toHaveLength(1);
  const [copy] = protocols;
  if (!isRecord(copy) || typeof copy.id !== 'string') {
    throw new Error(`unexpected library row: ${JSON.stringify(copy)}`);
  }
  expect(copy.id).not.toBe(LEGACY_ID);
  expect(copy).toMatchObject({ name: LEGACY_NAME, schemaVersion: 9 });
  const assets = await readLibraryRows(architectPage, 'assets');
  expect(assets).toEqual([
    expect.objectContaining({
      id: `${copy.id}::map`,
      assetId: 'map',
      protocolId: copy.id,
      name: 'map.svg',
    }),
  ]);
  expect(await readLibraryRows(architectPage, 'legacyProtocolChoices')).toEqual(
    [
      expect.objectContaining({
        legacyId: LEGACY_ID,
        choice: 'upgraded',
        upgradedId: copy.id,
      }),
    ],
  );

  expect(await readLegacyLibraryFingerprint(architectPage)).toBe(before);

  // Back home, both are listed: the original, still schema 8, and the copy.
  await architectPage.goto('/');
  await expect(
    libraryRow(architectPage, LEGACY_NAME).filter({ hasText: 'Schema 8' }),
  ).toHaveCount(1);
  await expect(libraryRow(architectPage, LEGACY_NAME)).toHaveCount(2);
});

test('offers to keep an older file in Architect 8 only when this build bundles it', async ({
  architectPage,
}) => {
  await architectPage.goto('/');
  await architectPage.locator('input[type="file"]').setInputFiles({
    name: 'legacy-study.netcanvas',
    mimeType: 'application/octet-stream',
    buffer: await legacyNetcanvas(LEGACY_NAME),
  });

  const dialog = architectPage.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: 'Upgrade to schema 9' }),
  ).toBeFocused();
  // legacy-architect-handoff.spec.ts finds this same button by this same
  // name in a build that bundles Architect 8, so its absence here is not a
  // locator that can never match.
  await expect(
    dialog.getByRole('button', { name: 'Keep editing as schema 8' }),
  ).toHaveCount(SUITE_BUILD_BUNDLES_ARCHITECT_8 ? 1 : 0);
  await expect(dialog).toHaveAccessibleName(
    SUITE_BUILD_BUNDLES_ARCHITECT_8
      ? 'How do you want to open this protocol?'
      : 'Upgrade to continue',
  );

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(architectPage).toHaveURL(/\/$/);
  expect(await readStoreCounts(architectPage)).toEqual({
    protocols: 0,
    assets: 0,
  });
});

test('Clear all removes this library and leaves Architect 8’s alone', async ({
  architectPage,
  seed,
}) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'To Be Cleared' });
  await seedLegacyStudy(architectPage);
  const before = await readLegacyLibraryFingerprint(architectPage);
  expect(before).not.toBeNull();
  expect(await readStoreCounts(architectPage)).toEqual({
    protocols: 1,
    assets: 0,
  });
  await expect(libraryRow(architectPage, 'To Be Cleared')).toBeVisible();

  await architectPage
    .getByRole('button', { name: 'Clear all locally saved protocols' })
    .click();
  const dialog = architectPage.getByRole('dialog', {
    name: 'Remove all data?',
  });
  await expect(dialog).toContainText(
    'Schema 8 protocols stay in Architect 8 and are not removed.',
  );
  await dialog.getByTestId('dialog-primary').click();

  // Clearing reloads the page; the legacy row is still listed afterwards.
  await expect(libraryRow(architectPage, 'To Be Cleared')).toHaveCount(0);
  await expect(libraryRow(architectPage, LEGACY_NAME)).toContainText(
    'Schema 8',
  );
  expect(await readStoreCounts(architectPage)).toEqual({
    protocols: 0,
    assets: 0,
  });
  expect(await readLegacyLibraryFingerprint(architectPage)).toBe(before);
});

test('never opens Architect 8’s library when there is none', async ({
  architectPage,
}) => {
  // Opening a missing database creates it. Dexie deletes a database it
  // created by mistake again, so its absence afterwards alone would not show
  // that it was never opened: record every open the page makes as well.
  await architectPage.addInitScript(() => {
    const opens: string[] = [];
    window.__indexedDbOpens = opens;
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name: string, version?: number) => {
      opens.push(name);
      return open(name, version);
    };
  });
  await architectPage.goto('/');
  // The library view lists both libraries as it mounts; by the time it shows
  // its empty Recent tab, the Architect 8 read has run.
  await architectPage.getByRole('tab', { name: 'Recent' }).click();
  await expect(
    architectPage.getByText('No recent protocols yet.'),
  ).toBeVisible();

  const opens = await architectPage.evaluate(() => window.__indexedDbOpens);
  // The recorder works: this app opened its own library through it.
  expect(opens).toContain(PROTOCOL_DB_NAME);
  expect(opens).not.toContain(LEGACY_DB_NAME);
  expect(await readDatabaseNames(architectPage)).not.toContain(LEGACY_DB_NAME);
});

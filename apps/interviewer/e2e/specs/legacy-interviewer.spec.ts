import type { Page } from '@playwright/test';

import { DB_NAME } from '../../src/lib/db/storageNames.js';
import { HANDOFF_DB_NAME } from '../../src/lib/handoff/handoffStore.js';
import {
  expect,
  LEGACY_INTERVIEWER_STUB_HEADING,
  test,
} from '../fixtures/legacy-interviewer.js';
import {
  LEGACY_PROTOCOL_HASH,
  LEGACY_PROTOCOL_NAME,
  legacyLibrarySeed,
  legacyNetcanvas,
} from '../fixtures/legacy-protocol.js';
import { clickWhenDeckSettles } from '../helpers/deck.js';
import {
  type DatabaseDump,
  dumpDatabase,
  LEGACY_DB_NAME,
  seedLegacyDatabase,
} from '../helpers/legacy-database.js';

/**
 * Interviewer 8 beside Interviewer 9: its protocols on the deck, starting an
 * interview with one, keeping a schema 8 file on schema 8, upgrading a
 * protocol and resetting the device.
 *
 * These need a build that offers Interviewer 8, which the suite's own build
 * does not while nothing is pinned, so they run against a build of their own
 * with a stub page at /v8/ (see `fixtures/legacy-interviewer.ts`). The stub is
 * enough: what Interviewer 9 owes Interviewer 8 is the URL it goes to and what
 * it stored (or left alone) before going, and both are asserted here.
 * Interviewer 8's side of `?start=` and `?import=` is tested on its own branch.
 *
 * The tests share one build per worker, so they run in order in one worker.
 */
test.describe.configure({ mode: 'default' });

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const legacyCard = (page: Page) =>
  page.getByRole('heading', { name: LEGACY_PROTOCOL_NAME });

/** Seed Interviewer 8's library and open Interviewer 9 beside it. */
const openBesideLegacyLibrary = async (page: Page) => {
  await seedLegacyDatabase(page, legacyLibrarySeed());
  const before = await dumpDatabase(page, LEGACY_DB_NAME);
  expect(before?.version).toBe(30);
  await page.goto('/');
  await expect(legacyCard(page)).toBeVisible();
  return before;
};

// force: true, as for the delete control (see ProtocolFixture.delete): the
// menu button sits in the active card's top-right corner, under the next
// card's bounding box in the deck's fanned 3D layout, which defeats
// Playwright's actionability pre-check though a real click there lands.
const openActionsMenu = (page: Page) =>
  clickWhenDeckSettles(
    page.getByRole('button', { name: `Actions for ${LEGACY_PROTOCOL_NAME}` }),
    { force: true },
  );

/** Rows across every store of a dumped database; 0 when it is absent. */
const rowCount = (dump: DatabaseDump | null): number =>
  Object.values(dump?.stores ?? {}).reduce(
    (total, store) => total + store.rows.length,
    0,
  );

const expectOnStub = async (page: Page) => {
  await expect(
    page.getByRole('heading', { name: LEGACY_INTERVIEWER_STUB_HEADING }),
  ).toBeVisible();
};

test('shows Interviewer 8’s protocols as schema 8 cards', async ({ page }) => {
  const before = await openBesideLegacyLibrary(page);

  // Sorted by name, the schema 8 protocol is the first card; the deck starts
  // on the import card.
  await page.getByRole('button', { name: 'Go to card 1' }).click();
  await expect(page.getByText('Schema 8', { exact: true })).toBeVisible();
  // This build bundles Interviewer 8, so the card can start an interview.
  await expect(page.getByText('Not available')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Start new interview' }),
  ).toBeVisible();

  await openActionsMenu(page);
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
    'Open in Interviewer 8',
    'Upgrade to schema 9',
    'Info',
  ]);
  await page.keyboard.press('Escape');

  expect(await dumpDatabase(page, LEGACY_DB_NAME)).toEqual(before);
});

test('starting an interview with a schema 8 protocol opens /v8/?start=', async ({
  page,
}) => {
  const before = await openBesideLegacyLibrary(page);

  await page.getByRole('button', { name: 'Go to card 1' }).click();
  await clickWhenDeckSettles(
    page.getByRole('button', { name: 'Start new interview' }),
  );

  await expect(page).toHaveURL(`/v8/?start=${LEGACY_PROTOCOL_HASH}`);
  await expectOnStub(page);
  // Interviewer 8 makes the interview; nothing was written for it here.
  expect(await dumpDatabase(page, LEGACY_DB_NAME)).toEqual(before);
  expect((await dumpDatabase(page, DB_NAME))?.stores.sessions?.rows).toEqual(
    [],
  );
});

test('keeping a schema 8 file on schema 8 stages it and opens /v8/?import=', async ({
  page,
}) => {
  const file = await legacyNetcanvas();
  await page.goto('/');
  await page.getByTestId('protocol-import-input').setInputFiles({
    name: 'legacy-study.netcanvas',
    mimeType: 'application/octet-stream',
    buffer: file,
  });

  const dialog = page.getByRole('dialog', {
    name: 'This protocol uses schema 8',
  });
  await dialog.getByRole('button', { name: 'Keep on schema 8' }).click();

  await expect(page).toHaveURL(new RegExp(`/v8/\\?import=(${UUID})$`));
  await expectOnStub(page);
  const key = new URL(page.url()).searchParams.get('import');

  // The record Interviewer 8 will take: for it, under the key in the URL,
  // with the file's own name and every byte of it.
  const handoffs = await dumpDatabase(page, HANDOFF_DB_NAME);
  expect(handoffs?.stores.handoffs?.rows).toEqual([
    {
      key,
      kind: 'import',
      targetMajor: 8,
      fileName: 'legacy-study.netcanvas',
      createdAt: expect.any(Number),
      file: {
        blob: expect.any(String),
        bytes: Array.from(file),
      },
    },
  ]);

  // Nothing went into this app's library, and Interviewer 8's was not made.
  const own = await dumpDatabase(page, DB_NAME);
  expect(
    own?.stores.protocols?.rows.some(
      (row) => (row as { name?: string }).name === LEGACY_PROTOCOL_NAME,
    ),
  ).toBe(false);
  expect(await dumpDatabase(page, LEGACY_DB_NAME)).toBeNull();
});

test('upgrading makes a schema 9 copy without interviews and leaves Interviewer 8’s database alone', async ({
  page,
}) => {
  const before = await openBesideLegacyLibrary(page);

  await page.getByRole('button', { name: 'Go to card 1' }).click();
  await openActionsMenu(page);
  await page.getByRole('menuitem', { name: 'Upgrade to schema 9' }).click();
  const confirm = page.getByRole('dialog', { name: 'Upgrade to schema 9?' });
  await confirm.getByRole('button', { name: 'Upgrade to schema 9' }).click();
  await expect(page.getByText('Upgraded copy created')).toBeVisible({
    timeout: 15_000,
  });

  // Both cards now: the copy, and the original saying it has one.
  await expect(legacyCard(page)).toHaveCount(2);
  await expect(page.getByText('Has an upgraded copy')).toBeVisible();

  const own = await dumpDatabase(page, DB_NAME);
  const upgraded = own?.stores.protocols?.rows.filter(
    (row) => (row as { name?: string }).name === LEGACY_PROTOCOL_NAME,
  );
  expect(upgraded).toHaveLength(1);
  expect(upgraded?.[0]).toMatchObject({
    protocol: { schemaVersion: 9, name: LEGACY_PROTOCOL_NAME },
  });
  expect(own?.stores.legacyUpgrades?.rows).toEqual([
    expect.objectContaining({ legacyHash: LEGACY_PROTOCOL_HASH }),
  ]);
  // No interview is carried over.
  expect(own?.stores.sessions?.rows).toEqual([]);

  // Byte for byte as it was, Blob included.
  expect(await dumpDatabase(page, LEGACY_DB_NAME)).toEqual(before);
});

test('resetting the device deletes both databases', async ({ page }) => {
  await openBesideLegacyLibrary(page);
  // This app's own database exists, holding the settings carried over.
  await expect
    .poll(async () => rowCount(await dumpDatabase(page, DB_NAME)))
    .toBeGreaterThan(0);

  await page.getByTestId('settings-trigger').click();
  await page.getByRole('tab', { name: 'Security' }).click();
  await page.getByRole('button', { name: 'Reset device' }).click();
  await page
    .getByRole('dialog', { name: 'Reset device and wipe data?' })
    .getByRole('button', { name: 'Destroy device data' })
    .click();

  await expect.poll(() => dumpDatabase(page, LEGACY_DB_NAME)).toBeNull();
  // Deleted; this app may open it again, empty, straight away.
  await expect
    .poll(async () => rowCount(await dumpDatabase(page, DB_NAME)))
    .toBe(0);

  await page.goto('/');
  await expect(page.getByTestId('protocol-import-input')).toBeAttached();
  await expect(legacyCard(page)).toHaveCount(0);
  // Opening the app again does not bring Interviewer 8's database back.
  expect(await dumpDatabase(page, LEGACY_DB_NAME)).toBeNull();
});

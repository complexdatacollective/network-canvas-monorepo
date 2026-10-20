import type { Page } from '@playwright/test';

import { LEGACY_LIBRARIES } from '../../src/utils/storageNames.js';
import {
  expect,
  LEGACY_ARCHITECT_STUB_HEADING,
  test,
} from '../fixtures/legacy-architect.js';
import {
  legacyNetcanvas,
  legacyProtocol,
  legacyProtocolAssets,
} from '../fixtures/legacy-protocol.js';
import { seedLegacyProtocols } from '../fixtures/seed.js';
import {
  readDatabaseNames,
  readHandoffRecords,
  readLegacyLibraryFingerprint,
  readLibraryRows,
  readStoreCounts,
} from '../helpers/read-store.js';

/**
 * Following a protocol out to Architect 8 (spec item 13).
 *
 * These need a build that offers Architect 8, which the suite's own build does
 * not while nothing is pinned, so they run against a build of their own with a
 * stub page at /v8/ (see `fixtures/legacy-architect.ts`). The stub is enough:
 * what Architect 9 owes Architect 8 is the URL it goes to and what it stored
 * before going, and both are asserted here. Architect 8's side of `?open=` and
 * `?import=` is tested on its own branch. Architect 8 never sends a protocol
 * back, so nothing here comes the other way.
 *
 * The tests share one build per worker, so they run in order in one worker.
 */
test.describe.configure({ mode: 'default' });

const [{ dbName: LEGACY_DB_NAME }] = LEGACY_LIBRARIES;
const LEGACY_ID = '0b9e7d52-3c41-4f6a-8e2d-7a5b6c4d3e2f';
const LEGACY_NAME = 'Legacy Study';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const seedLegacyStudy = (page: Page) =>
  seedLegacyProtocols(page, [
    {
      id: LEGACY_ID,
      protocol: legacyProtocol(LEGACY_NAME),
      assets: legacyProtocolAssets,
    },
  ]);

const libraryRow = (page: Page) =>
  page.getByRole('option').filter({ hasText: LEGACY_NAME });

const expectOnStub = async (page: Page) => {
  await expect(
    page.getByRole('heading', { name: LEGACY_ARCHITECT_STUB_HEADING }),
  ).toBeVisible();
};

test('keeping a file in Architect 8 stages it unchanged and opens /v8/?import=', async ({
  architectPage,
}) => {
  const file = await legacyNetcanvas(LEGACY_NAME);
  await architectPage.goto('/');
  await architectPage.locator('input[type="file"]').setInputFiles({
    name: 'legacy-study.netcanvas',
    mimeType: 'application/octet-stream',
    buffer: file,
  });

  const dialog = architectPage.getByRole('dialog', {
    name: 'How do you want to open this protocol?',
  });
  // Upgrading stays the lead action even when keeping is offered.
  await expect(
    dialog.getByRole('button', { name: 'Upgrade to schema 9' }),
  ).toBeFocused();
  await dialog
    .getByRole('button', { name: 'Keep editing as schema 8' })
    .click();

  await expect(architectPage).toHaveURL(new RegExp(`/v8/\\?import=(${UUID})$`));
  await expectOnStub(architectPage);
  const key = new URL(architectPage.url()).searchParams.get('import');

  // The record Architect 8 will take: for it, under the key in the URL, with
  // the file's own name and every byte of it.
  const records = await readHandoffRecords(architectPage);
  expect(records).toEqual([
    {
      key,
      kind: 'import',
      targetMajor: 8,
      fileName: 'legacy-study.netcanvas',
      createdAt: expect.any(Number),
      fileBase64: file.toString('base64'),
    },
  ]);

  // Nothing went into this app's library, and Architect 8's was not made.
  expect(await readStoreCounts(architectPage)).toEqual({
    protocols: 0,
    assets: 0,
  });
  expect(await readDatabaseNames(architectPage)).not.toContain(LEGACY_DB_NAME);
});

test('keeping a library protocol in Architect 8 opens it there and is remembered', async ({
  architectPage,
}) => {
  await seedLegacyStudy(architectPage);
  const before = await readLegacyLibraryFingerprint(architectPage);
  expect(before).not.toBeNull();

  const row = libraryRow(architectPage);
  await row.getByRole('button', { name: `Actions for ${LEGACY_NAME}` }).click();
  await expect(
    architectPage.getByRole('menu').getByRole('menuitem'),
  ).toHaveText([
    'Open in Architect 8',
    'Upgrade to schema 9',
    'See more info',
    'Download',
  ]);
  await architectPage.keyboard.press('Escape');

  await row.click();
  const dialog = architectPage.getByRole('dialog', {
    name: 'How do you want to open this protocol?',
  });
  await dialog
    .getByRole('button', { name: 'Keep editing as schema 8' })
    .click();

  await expect(architectPage).toHaveURL(`/v8/?open=${LEGACY_ID}`);
  await expectOnStub(architectPage);
  expect(await readLibraryRows(architectPage, 'legacyProtocolChoices')).toEqual(
    [
      {
        legacyId: LEGACY_ID,
        choice: 'legacy',
        updatedAt: expect.any(Number),
      },
    ],
  );
  expect(await readLegacyLibraryFingerprint(architectPage)).toBe(before);

  // Next time the row goes straight to Architect 8, without asking.
  await architectPage.goto('/');
  await libraryRow(architectPage).click();
  await expect(architectPage).toHaveURL(`/v8/?open=${LEGACY_ID}`);
  await expectOnStub(architectPage);
  expect(await readLegacyLibraryFingerprint(architectPage)).toBe(before);
});

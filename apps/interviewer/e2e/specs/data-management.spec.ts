import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test.js';
import { graphmlNodeCount, readEntries } from '../helpers/export-archive.js';
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';

// Import + seed once per test (fresh context). Synthetic sessions carry real
// generated networks (complete + dropped-out mix), so they populate the table
// AND are exportable with real content.
//
// Deviation from the brief: seeded 20 sessions rather than 6. The lean e2e
// protocol has 4 stages, and generateNetwork's per-stage drop-out check
// (((i+1)/totalStages) * 0.15, checked at every stage) only guarantees a
// *minimum* of ceil(count * 0.1) COMPLETE sessions when simulateDropOut is on
// — it never guarantees a minimum number of IN-PROGRESS ones. With 6 sessions
// there is a ~9% chance every session finishes naturally (0 in-progress
// rows), which would flake the "In progress" chip and resume tests. At 20
// sessions that chance drops to ~0.03%, and 20 still fits inside the table's
// single default page (25 rows), so "select all on this page" still selects
// everything.
const SYNTHETIC_SESSION_COUNT = 20;

// Deviation from the brief: the brief's importAndSeed calls seed.synthetic()
// immediately after protocol.import() resolves. That races a real bug in
// the deck: a pending import's card shows the protocol's (peeked-from-file)
// name and satisfies ProtocolFixture.import()'s heading-visible wait well
// before the underlying `saveProtocol` DB write actually commits — see
// useProtocolImport.ts's IMPORT_START_DELAY_MS/MIN_PENDING_VISIBLE_MS
// padding and deckEntries.ts's pending-shadows-protocol slot merge, which
// renders the peeked name inside a real `<h2>` (DeckCard.tsx) while
// `loading: true`. Opening Settings → Synthetic data in that window hits
// `listProtocols()` before the save lands: the tab shows "Import a protocol
// first.", the Generate button stays disabled, and — because
// SettingsDialog's protocol list only reloads when the dialog transitions
// open, not on later data changes — it never recovers within that dialog
// session. This reproduced 100% of the time, including single-worker runs,
// so it is a real race, not CPU contention. Fixed here (not in
// ProtocolFixture, which Task 3 owns) by waiting for the "Protocol
// imported" toast — fired only after the save and Home's protocol-list
// reload both complete — before opening Settings.
async function importAndSeed(
  protocol: { import: (p: string, n?: string) => Promise<void> },
  seed: { synthetic: (n: number) => Promise<void> },
  page: Page,
): Promise<void> {
  await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
  await expect(page.getByText('Protocol imported')).toBeVisible({
    timeout: 15_000,
  });
  await seed.synthetic(SYNTHETIC_SESSION_COUNT);
}

// The case ids of the rows the table shows, in display order, read from each
// row's selection checkbox ("Select <caseId>").
async function readCaseIds(page: Page): Promise<string[]> {
  const labels = await page
    .getByRole('checkbox', { name: /^Select synthetic-/ })
    .evaluateAll((boxes) =>
      boxes.map((box) => {
        const label = box.getAttribute('aria-label');
        if (label === null) throw new Error('row checkbox has no aria-label');
        return label;
      }),
    );
  return labels.map((label) => label.replace(/^Select /, ''));
}

// The N in a status chip's "Label · N".
async function chipCount(page: Page, label: string): Promise<number> {
  const name = await page
    .getByRole('button', { name: new RegExp(`^${label} ·`) })
    .textContent();
  const count = /·\s*(\d+)/.exec(name ?? '')?.[1];
  if (count === undefined) throw new Error(`no count on the ${label} chip`);
  return Number(count);
}

// Waits until every seeded session is listed, so later reads see the full
// table rather than a partial first load.
async function waitForAllRows(page: Page): Promise<string[]> {
  await expect
    .poll(async () => (await readCaseIds(page)).length)
    .toBe(SYNTHETIC_SESSION_COUNT);
  await expect.poll(() => chipCount(page, 'All')).toBe(SYNTHETIC_SESSION_COUNT);
  return readCaseIds(page);
}

const collator = new Intl.Collator('en');
const sortedCaseIds = (ids: string[], dir: 'asc' | 'desc') => {
  const sorted = ids.toSorted((a, b) => collator.compare(a, b));
  return dir === 'asc' ? sorted : sorted.toReversed();
};

test.describe('interview data management', () => {
  test('status chips filter the table by completion state', async ({
    protocol,
    seed,
    page,
  }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    await waitForAllRows(page);
    // The seed's complete/in-progress split is random, but both are present.
    const complete = await chipCount(page, 'Complete');
    const inProgress = await chipCount(page, 'In progress');
    expect(complete).toBeGreaterThan(0);
    expect(inProgress).toBeGreaterThan(0);
    expect(complete + inProgress).toBe(SYNTHETIC_SESSION_COUNT);

    await page.getByRole('button', { name: /^Complete ·/ }).click();
    await expect(page).toHaveURL(/status=complete/);
    await expect
      .poll(async () => (await readCaseIds(page)).length)
      .toBe(complete);
    await expect(page.getByTestId('data-review')).toHaveCount(complete);
    await expect(page.getByTestId('data-resume')).toHaveCount(0);

    await page.getByRole('button', { name: /^In progress ·/ }).click();
    await expect
      .poll(async () => (await readCaseIds(page)).length)
      .toBe(inProgress);
    await expect(page.getByTestId('data-resume')).toHaveCount(inProgress);
    await expect(page.getByTestId('data-review')).toHaveCount(0);
    // No visual snapshot here: the /data table shows random synthetic case ids
    // and a Math.random-driven complete/in-progress split, so the status-chip
    // counts ("Complete · N") are non-deterministic between seeds.
  });

  test('search narrows rows by case id', async ({ protocol, seed, page }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    const ids = await waitForAllRows(page);
    const target = ids[ids.length - 1];
    if (target === undefined) throw new Error('no rows to search for');

    // A fragment from the middle of the id, so search must match substrings.
    const fragment = target.slice(-12, -4);
    await page.getByTestId('data-search').fill(fragment);
    await expect(page).toHaveURL(new RegExp(`q=${fragment}`));
    await expect.poll(() => readCaseIds(page)).toEqual([target]);
  });

  test('column headers toggle sort and reflect it in the URL', async ({
    protocol,
    seed,
    page,
  }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    const ids = await waitForAllRows(page);

    await page.getByRole('button', { name: 'Case ID' }).click();
    await expect(page).toHaveURL(/sort=caseId&dir=asc/);
    await expect
      .poll(() => readCaseIds(page))
      .toEqual(sortedCaseIds(ids, 'asc'));

    await page.getByRole('button', { name: 'Case ID' }).click();
    await expect(page).toHaveURL(/sort=caseId&dir=desc/);
    await expect
      .poll(() => readCaseIds(page))
      .toEqual(sortedCaseIds(ids, 'desc'));
  });

  test('a deep link restores filter + sort state', async ({
    protocol,
    seed,
    page,
  }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data?status=complete&sort=caseId&dir=asc');
    await expect(
      page.getByRole('button', { name: /^Complete ·/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => chipCount(page, 'All'))
      .toBe(SYNTHETIC_SESSION_COUNT);
    const complete = await chipCount(page, 'Complete');
    // Order only means something with at least two rows; the seed guarantees
    // two complete sessions.
    expect(complete).toBeGreaterThan(1);
    await expect
      .poll(async () => (await readCaseIds(page)).length)
      .toBe(complete);
    const ids = await readCaseIds(page);
    expect(ids).toEqual(sortedCaseIds(ids, 'asc'));
    await expect(page.getByTestId('data-resume')).toHaveCount(0);
  });

  test('exports selected sessions and the archive contains GraphML + CSV', async ({
    protocol,
    seed,
    download,
    page,
  }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    // Filter to complete sessions (guaranteed exportable networks).
    await page.getByRole('button', { name: /^Complete ·/ }).click();
    // Select all on page.
    await page
      .getByRole('checkbox', { name: 'Select all interviews on this page' })
      .check();

    const { fileName, files } = await download.captureExport(async () => {
      await page.getByTestId('data-export').click();
      // The export dialog's ready state; role-scoped because its sr-only live
      // region announces the same text.
      await expect(
        page.getByRole('heading', { name: 'Archive ready' }),
      ).toBeVisible();
      await page.getByTestId('data-save-export').click();
    });

    expect(fileName).toMatch(/^networkCanvasExport-\d+\.zip$/);
    // Deviation from the brief: the archive's GraphML entry ends in plain
    // `.graphml`, not `_graphml.graphml`. network-exporters' assignFileNames
    // only appends `_${exportFormat}` when the format name differs from its
    // extension's own name (true for `ego` → `.csv`, false for `graphml` →
    // `.graphml`, since `.graphml`/`graphml` collide) — verified directly
    // against packages/network-exporters/src/utils/fileNames.ts's
    // assignFileNames and utils/general.ts's getFileExtension.
    const graphmls = readEntries(files, '.graphml');
    expect(graphmls.length).toBeGreaterThan(0);
    // Every exported (complete) session's GraphML must contain nodes — validate
    // the whole batch, not just the first entry.
    for (const graphml of graphmls) {
      expect(graphmlNodeCount(graphml)).toBeGreaterThan(0);
    }
    // One GraphML and one ego CSV per exported session.
    const egoCsvs = readEntries(files, '_ego.csv');
    expect(egoCsvs).toHaveLength(graphmls.length);

    // Export-complete toast, and the Exported facet now flips.
    await expect(page.getByText('Export complete')).toBeVisible();
  });

  test('bulk-deletes selected sessions', async ({ protocol, seed, page }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    await page
      .getByRole('checkbox', { name: 'Select all interviews on this page' })
      .check();
    await page.getByTestId('data-delete').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('dialog-primary').click();
    // Deviation from the brief: the table body never drops to zero <tr>
    // elements — DataTable renders its `emptyText` inside its own row, so
    // "empty" is the header row plus that one placeholder row. Assert on the
    // placeholder text directly instead of a brittle row-count assumption
    // that doesn't match how the DataTable primitive renders "no data".
    await expect(page.getByText('No interviews recorded yet.')).toBeVisible();
  });

  test('resumes an in-progress session', async ({ protocol, seed, page }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    await page.getByRole('button', { name: /^In progress ·/ }).click();
    await page.getByTestId('data-resume').first().click();
    await expect(page).toHaveURL(/\/interview\//);
  });

  test('reviews a completed session read-only and marks it unfinished', async ({
    protocol,
    seed,
    page,
  }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    await page.getByRole('button', { name: /^Complete ·/ }).click();

    await page.getByTestId('data-review').first().click();
    await expect(page).toHaveURL(/\/interview\/.+\?mode=review$/);
    await expect(page.getByText('Read-only review')).toBeVisible();
    await expect(page.locator('[data-stage-step]')).toHaveAttribute(
      'data-stage-step',
      '3',
    );
    await expect(
      page.getByRole('heading', { name: 'Finish Interview' }),
    ).not.toBeVisible();
    await expect(
      page.getByText(
        'Changes made while reviewing this interview will not be saved.',
      ),
    ).toBeVisible();

    await page.goto('/data?status=complete');
    await page.getByTestId('data-mark-unfinished').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Mark unfinished' }).click();

    await expect(page.getByText('Interview marked unfinished')).toBeVisible();
    await expect(page.getByTestId('data-resume')).toHaveCount(0);
    await page.getByRole('button', { name: /^In progress ·/ }).click();
    await expect(page.getByTestId('data-resume').first()).toBeVisible();
    await page.getByTestId('data-resume').first().click();
    await expect(page).toHaveURL(/\/interview\//);
    await expect(page.locator('[data-stage-step]')).toHaveAttribute(
      'data-stage-step',
      '3',
    );
    await expect(
      page.getByRole('heading', { name: 'Finish Interview' }),
    ).not.toBeVisible();
  });
});

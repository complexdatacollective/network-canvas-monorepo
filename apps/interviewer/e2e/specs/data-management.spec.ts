import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test.js';
import { graphmlNodeCount, readEntry } from '../helpers/export-archive.js';
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';
import { dataRowMasks, statusMasks } from '../helpers/visual.js';

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

test.describe('interview data management', () => {
  test('status chips filter the table by completion state', async ({
    protocol,
    seed,
    page,
    capture,
  }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    // Chips read "All · N", "In progress · N", "Complete · N".
    await expect(page.getByRole('button', { name: /^All ·/ })).toBeVisible();
    await page.getByRole('button', { name: /^Complete ·/ }).click();
    await expect(page).toHaveURL(/status=complete/);
    await capture('data-populated', {
      mask: [...statusMasks(page), ...dataRowMasks(page)],
    });
  });

  test('search narrows rows by case id', async ({ protocol, seed, page }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    const search = page.getByTestId('data-search');
    await search.fill('synthetic-');
    await expect(page).toHaveURL(/q=synthetic/);
    // Every synthetic case id begins with "synthetic-", so rows remain.
    await expect(page.getByRole('row')).not.toHaveCount(1); // header + rows
  });

  test('column headers toggle sort and reflect it in the URL', async ({
    protocol,
    seed,
    page,
  }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    await page.getByRole('button', { name: 'Case ID' }).click();
    await expect(page).toHaveURL(/sort=caseId/);
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
      await expect(page.getByText('Archive ready')).toBeVisible();
      await page.getByTestId('data-save-export').click();
    });

    expect(fileName).toMatch(/^networkCanvasExport-\d+\.zip$/);
    // Deviation from the brief: the archive's GraphML entry ends in plain
    // `.graphml`, not `_graphml.graphml`. network-exporters' makeFilename
    // only appends `_${exportFormat}` when the format name differs from its
    // extension's own name (true for `ego` → `.csv`, false for `graphml` →
    // `.graphml`, since `.graphml`/`graphml` collide) — verified directly
    // against packages/network-exporters/src/utils/general.ts's
    // makeFilename/getFileExtension.
    const graphml = readEntry(files, '.graphml');
    expect(graphml).toBeDefined();
    expect(graphmlNodeCount(graphml ?? '')).toBeGreaterThan(0);
    const egoCsv = readEntry(files, '_ego.csv');
    expect(egoCsv).toBeDefined();

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
});

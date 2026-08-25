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
// The batch is PINNED to a seed, because generation is a pure function of it:
// the same seed always produces the same split and the same networks, so this
// file asserts counts rather than ranges.
//
// Which counts, and why this seed. Drop-out is a hazard on accumulated
// response burden — `1 - exp(-DROPOUT_HAZARD_RATE * burden)` rolled after
// each stage — and this fixture's four stages carry 0 (Information) + 0.4
// (EgoForm) + 0.2 (NameGeneratorQuickAdd) + 0.6 (Sociogram), so a session
// survives to the end with probability ~99.8%. Dropping out is therefore
// RARE here, and an unpinned batch of any practical size would usually
// contain no in-progress rows at all — the "In progress" chip and resume
// tests would have nothing to find. Seed 228 over 6 sessions yields exactly
// one in-progress session (abandoned before the Sociogram, carrying 4 people)
// and five complete ones, every complete session holding at least 5 nodes and
// 4 edges, so the export assertions have real content to check. 6 rows also
// sit inside the table's single default page (25), so "select all on this
// page" still selects the whole batch.
const SYNTHETIC_SESSION_COUNT = 6;
const SYNTHETIC_SEED = 228;
const COMPLETE_COUNT = 5;
const IN_PROGRESS_COUNT = 1;

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
  seed: { synthetic: (n: number, seed?: number) => Promise<void> },
  page: Page,
): Promise<void> {
  await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
  await expect(page.getByText('Protocol imported')).toBeVisible({
    timeout: 15_000,
  });
  await seed.synthetic(SYNTHETIC_SESSION_COUNT, SYNTHETIC_SEED);
}

test.describe('interview data management', () => {
  test('status chips filter the table by completion state', async ({
    protocol,
    seed,
    page,
  }) => {
    await importAndSeed(protocol, seed, page);
    await page.goto('/data');
    // Chips read "All · N", "In progress · N", "Complete · N". The seed fixes
    // the split, so these are exact — a change in the generator that shifts
    // who finishes is a change this spec should notice.
    await expect(
      page.getByRole('button', { name: `All · ${SYNTHETIC_SESSION_COUNT}` }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: `In progress · ${IN_PROGRESS_COUNT}` }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Complete · ${COMPLETE_COUNT}` }),
    ).toBeVisible();

    await page.getByRole('button', { name: /^Complete ·/ }).click();
    await expect(page).toHaveURL(/status=complete/);
    await expect(page.getByTestId('data-review')).toHaveCount(COMPLETE_COUNT);
    // No visual snapshot here: case ids and generated attribute values still
    // vary with the session's own date, so the rendered table is not
    // byte-stable even under a pinned seed. The table is covered functionally
    // by the tests in this file.
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
      // The export dialog's ready state; role-scoped because its sr-only live
      // region announces the same text.
      await expect(
        page.getByRole('heading', { name: 'Archive ready' }),
      ).toBeVisible();
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
    const graphmls = readEntries(files, '.graphml');
    // One per complete session, and the seed says how many that is.
    expect(graphmls).toHaveLength(COMPLETE_COUNT);
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
    // The seeded batch abandons exactly one session, so there is exactly one
    // interview to resume.
    await expect(page.getByTestId('data-resume')).toHaveCount(
      IN_PROGRESS_COUNT,
    );
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

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: data-management.spec.ts >> interview data management >> status chips filter the table by completion state
- Location: e2e/specs/data-management.spec.ts:67:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'In progress · 1' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: 'In progress · 1' })

```

```yaml
- status "Install Interviewer":
  - text: "Low data-loss risk: Chromium rarely removes Network Canvas data automatically, but interview data stored in a browser tab is not guaranteed. Before collecting data, use the install icon in the browser's address bar to install Interviewer and protect your interview data from being deleted."
  - button "Dismiss"
- banner:
  - heading "Interviewer" [level=1]
  - group "Home view":
    - button "Protocols"
    - button "Data" [pressed]
  - button "Settings"
- group "Status filter":
  - button "All · 6" [pressed]
  - button "In progress · 0"
  - button "Complete · 6"
- searchbox "Search case ID or protocol"
- button "Filter"
- table:
  - rowgroup:
    - row "Select all interviews on this page Case ID Protocol Started Updated Progress Export status Interview actions":
      - columnheader "Select all interviews on this page":
        - checkbox "Select all interviews on this page"
      - columnheader "Case ID":
        - button "Case ID"
      - columnheader "Protocol":
        - button "Protocol"
      - columnheader "Started":
        - button "Started"
      - columnheader "Updated":
        - button "Updated"
      - columnheader "Progress":
        - button "Progress"
      - columnheader "Export status":
        - button "Export status"
      - columnheader "Interview actions"
  - rowgroup:
    - row "Select synthetic-1dda833c-e43f-4564-8c83-f758b5679c58 synthetic-1dda833c-e43f-4564-8c83-f758b5679c58 E2E Fixture 8/18/2026, 1:15 AM just now 100% 100% Not exported Review Mark synthetic-1dda833c-e43f-4564-8c83-f758b5679c58 unfinished":
      - cell "Select synthetic-1dda833c-e43f-4564-8c83-f758b5679c58":
        - checkbox "Select synthetic-1dda833c-e43f-4564-8c83-f758b5679c58"
      - cell "synthetic-1dda833c-e43f-4564-8c83-f758b5679c58"
      - cell "E2E Fixture"
      - cell "8/18/2026, 1:15 AM":
        - button "8/18/2026, 1:15 AM":
          - time: 8/18/2026, 1:15 AM
      - cell "just now":
        - button "just now":
          - time: just now
      - cell "100% 100%":
        - progressbar "step 5 of 5": x
        - text: 100%
      - cell "Not exported"
      - cell "Review Mark synthetic-1dda833c-e43f-4564-8c83-f758b5679c58 unfinished":
        - button "Review"
        - button "Mark synthetic-1dda833c-e43f-4564-8c83-f758b5679c58 unfinished": Mark unfinished
    - row "Select synthetic-da1635a8-adc9-4df8-bbff-50d19d85d1ea synthetic-da1635a8-adc9-4df8-bbff-50d19d85d1ea E2E Fixture 6 days ago just now 100% 100% Not exported Review Mark synthetic-da1635a8-adc9-4df8-bbff-50d19d85d1ea unfinished":
      - cell "Select synthetic-da1635a8-adc9-4df8-bbff-50d19d85d1ea":
        - checkbox "Select synthetic-da1635a8-adc9-4df8-bbff-50d19d85d1ea"
      - cell "synthetic-da1635a8-adc9-4df8-bbff-50d19d85d1ea"
      - cell "E2E Fixture"
      - cell "6 days ago":
        - button "6 days ago":
          - time: 6 days ago
      - cell "just now":
        - button "just now":
          - time: just now
      - cell "100% 100%":
        - progressbar "step 5 of 5": x
        - text: 100%
      - cell "Not exported"
      - cell "Review Mark synthetic-da1635a8-adc9-4df8-bbff-50d19d85d1ea unfinished":
        - button "Review"
        - button "Mark synthetic-da1635a8-adc9-4df8-bbff-50d19d85d1ea unfinished": Mark unfinished
    - row "Select synthetic-c9f82b07-3994-4652-8324-698df4e018bf synthetic-c9f82b07-3994-4652-8324-698df4e018bf E2E Fixture 8/18/2026, 12:45 AM just now 100% 100% Not exported Review Mark synthetic-c9f82b07-3994-4652-8324-698df4e018bf unfinished":
      - cell "Select synthetic-c9f82b07-3994-4652-8324-698df4e018bf":
        - checkbox "Select synthetic-c9f82b07-3994-4652-8324-698df4e018bf"
      - cell "synthetic-c9f82b07-3994-4652-8324-698df4e018bf"
      - cell "E2E Fixture"
      - cell "8/18/2026, 12:45 AM":
        - button "8/18/2026, 12:45 AM":
          - time: 8/18/2026, 12:45 AM
      - cell "just now":
        - button "just now":
          - time: just now
      - cell "100% 100%":
        - progressbar "step 5 of 5": x
        - text: 100%
      - cell "Not exported"
      - cell "Review Mark synthetic-c9f82b07-3994-4652-8324-698df4e018bf unfinished":
        - button "Review"
        - button "Mark synthetic-c9f82b07-3994-4652-8324-698df4e018bf unfinished": Mark unfinished
    - row "Select synthetic-5d84303a-56c3-4fad-bca9-be10bc82fd14 synthetic-5d84303a-56c3-4fad-bca9-be10bc82fd14 E2E Fixture 4 days ago just now 100% 100% Not exported Review Mark synthetic-5d84303a-56c3-4fad-bca9-be10bc82fd14 unfinished":
      - cell "Select synthetic-5d84303a-56c3-4fad-bca9-be10bc82fd14":
        - checkbox "Select synthetic-5d84303a-56c3-4fad-bca9-be10bc82fd14"
      - cell "synthetic-5d84303a-56c3-4fad-bca9-be10bc82fd14"
      - cell "E2E Fixture"
      - cell "4 days ago":
        - button "4 days ago":
          - time: 4 days ago
      - cell "just now":
        - button "just now":
          - time: just now
      - cell "100% 100%":
        - progressbar "step 5 of 5": x
        - text: 100%
      - cell "Not exported"
      - cell "Review Mark synthetic-5d84303a-56c3-4fad-bca9-be10bc82fd14 unfinished":
        - button "Review"
        - button "Mark synthetic-5d84303a-56c3-4fad-bca9-be10bc82fd14 unfinished": Mark unfinished
    - row "Select synthetic-551f63cf-19c1-4db7-9fc4-5cae5d7e525e synthetic-551f63cf-19c1-4db7-9fc4-5cae5d7e525e E2E Fixture 16 hours ago just now 100% 100% Not exported Review Mark synthetic-551f63cf-19c1-4db7-9fc4-5cae5d7e525e unfinished":
      - cell "Select synthetic-551f63cf-19c1-4db7-9fc4-5cae5d7e525e":
        - checkbox "Select synthetic-551f63cf-19c1-4db7-9fc4-5cae5d7e525e"
      - cell "synthetic-551f63cf-19c1-4db7-9fc4-5cae5d7e525e"
      - cell "E2E Fixture"
      - cell "16 hours ago":
        - button "16 hours ago":
          - time: 16 hours ago
      - cell "just now":
        - button "just now":
          - time: just now
      - cell "100% 100%":
        - progressbar "step 5 of 5": x
        - text: 100%
      - cell "Not exported"
      - cell "Review Mark synthetic-551f63cf-19c1-4db7-9fc4-5cae5d7e525e unfinished":
        - button "Review"
        - button "Mark synthetic-551f63cf-19c1-4db7-9fc4-5cae5d7e525e unfinished": Mark unfinished
    - row "Select synthetic-d1663ddd-1004-4025-a7e8-dba6b0abd0f1 synthetic-d1663ddd-1004-4025-a7e8-dba6b0abd0f1 E2E Fixture 3 days ago just now 100% 100% Not exported Review Mark synthetic-d1663ddd-1004-4025-a7e8-dba6b0abd0f1 unfinished":
      - cell "Select synthetic-d1663ddd-1004-4025-a7e8-dba6b0abd0f1":
        - checkbox "Select synthetic-d1663ddd-1004-4025-a7e8-dba6b0abd0f1"
      - cell "synthetic-d1663ddd-1004-4025-a7e8-dba6b0abd0f1"
      - cell "E2E Fixture"
      - cell "3 days ago":
        - button "3 days ago":
          - time: 3 days ago
      - cell "just now":
        - button "just now":
          - time: just now
      - cell "100% 100%":
        - progressbar "step 5 of 5": x
        - text: 100%
      - cell "Not exported"
      - cell "Review Mark synthetic-d1663ddd-1004-4025-a7e8-dba6b0abd0f1 unfinished":
        - button "Review"
        - button "Mark synthetic-d1663ddd-1004-4025-a7e8-dba6b0abd0f1 unfinished": Mark unfinished
- paragraph: Rows per page
- combobox:
  - option "25"
  - option "10"
  - option "25" [selected]
  - option "50"
  - option "100"
- text: Page 1 of 1
- button "Go to first page" [disabled]
- button "Go to previous page" [disabled]
- button "Go to next page" [disabled]
- button "Go to last page" [disabled]
- region "Notifications"
```

# Test source

```ts
  1   | import type { Page } from '@playwright/test';
  2   | 
  3   | import { expect, test } from '../fixtures/test.js';
  4   | import { graphmlNodeCount, readEntries } from '../helpers/export-archive.js';
  5   | import {
  6   |   LEAN_E2E_PROTOCOL_NAME,
  7   |   LEAN_E2E_PROTOCOL_PATH,
  8   | } from '../helpers/protocol-paths.js';
  9   | 
  10  | // Import + seed once per test (fresh context). Synthetic sessions carry real
  11  | // generated networks (complete + dropped-out mix), so they populate the table
  12  | // AND are exportable with real content.
  13  | //
  14  | // The batch is PINNED to a seed, because generation is a pure function of it:
  15  | // the same seed always produces the same split and the same networks, so this
  16  | // file asserts counts rather than ranges.
  17  | //
  18  | // Which counts, and why this seed. Drop-out is a hazard on accumulated
  19  | // response burden — `1 - exp(-DROPOUT_HAZARD_RATE * burden)` rolled after
  20  | // each stage — and this fixture's four stages carry 0 (Information) + 0.4
  21  | // (EgoForm) + 0.2 (NameGeneratorQuickAdd) + 0.6 (Sociogram), so a session
  22  | // survives to the end with probability ~99.8%. Dropping out is therefore
  23  | // RARE here, and an unpinned batch of any practical size would usually
  24  | // contain no in-progress rows at all — the "In progress" chip and resume
  25  | // tests would have nothing to find. Seed 228 over 6 sessions yields exactly
  26  | // one in-progress session (abandoned before the Sociogram, carrying 4 people)
  27  | // and five complete ones, every complete session holding at least 5 nodes and
  28  | // 4 edges, so the export assertions have real content to check. 6 rows also
  29  | // sit inside the table's single default page (25), so "select all on this
  30  | // page" still selects the whole batch.
  31  | const SYNTHETIC_SESSION_COUNT = 6;
  32  | const SYNTHETIC_SEED = 228;
  33  | const COMPLETE_COUNT = 5;
  34  | const IN_PROGRESS_COUNT = 1;
  35  | 
  36  | // Deviation from the brief: the brief's importAndSeed calls seed.synthetic()
  37  | // immediately after protocol.import() resolves. That races a real bug in
  38  | // the deck: a pending import's card shows the protocol's (peeked-from-file)
  39  | // name and satisfies ProtocolFixture.import()'s heading-visible wait well
  40  | // before the underlying `saveProtocol` DB write actually commits — see
  41  | // useProtocolImport.ts's IMPORT_START_DELAY_MS/MIN_PENDING_VISIBLE_MS
  42  | // padding and deckEntries.ts's pending-shadows-protocol slot merge, which
  43  | // renders the peeked name inside a real `<h2>` (DeckCard.tsx) while
  44  | // `loading: true`. Opening Settings → Synthetic data in that window hits
  45  | // `listProtocols()` before the save lands: the tab shows "Import a protocol
  46  | // first.", the Generate button stays disabled, and — because
  47  | // SettingsDialog's protocol list only reloads when the dialog transitions
  48  | // open, not on later data changes — it never recovers within that dialog
  49  | // session. This reproduced 100% of the time, including single-worker runs,
  50  | // so it is a real race, not CPU contention. Fixed here (not in
  51  | // ProtocolFixture, which Task 3 owns) by waiting for the "Protocol
  52  | // imported" toast — fired only after the save and Home's protocol-list
  53  | // reload both complete — before opening Settings.
  54  | async function importAndSeed(
  55  |   protocol: { import: (p: string, n?: string) => Promise<void> },
  56  |   seed: { synthetic: (n: number, seed?: number) => Promise<void> },
  57  |   page: Page,
  58  | ): Promise<void> {
  59  |   await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
  60  |   await expect(page.getByText('Protocol imported')).toBeVisible({
  61  |     timeout: 15_000,
  62  |   });
  63  |   await seed.synthetic(SYNTHETIC_SESSION_COUNT, SYNTHETIC_SEED);
  64  | }
  65  | 
  66  | test.describe('interview data management', () => {
  67  |   test('status chips filter the table by completion state', async ({
  68  |     protocol,
  69  |     seed,
  70  |     page,
  71  |   }) => {
  72  |     await importAndSeed(protocol, seed, page);
  73  |     await page.goto('/data');
  74  |     // Chips read "All · N", "In progress · N", "Complete · N". The seed fixes
  75  |     // the split, so these are exact — a change in the generator that shifts
  76  |     // who finishes is a change this spec should notice.
  77  |     await expect(
  78  |       page.getByRole('button', { name: `All · ${SYNTHETIC_SESSION_COUNT}` }),
  79  |     ).toBeVisible();
  80  |     await expect(
  81  |       page.getByRole('button', { name: `In progress · ${IN_PROGRESS_COUNT}` }),
> 82  |     ).toBeVisible();
      |       ^ Error: expect(locator).toBeVisible() failed
  83  |     await expect(
  84  |       page.getByRole('button', { name: `Complete · ${COMPLETE_COUNT}` }),
  85  |     ).toBeVisible();
  86  | 
  87  |     await page.getByRole('button', { name: /^Complete ·/ }).click();
  88  |     await expect(page).toHaveURL(/status=complete/);
  89  |     await expect(page.getByTestId('data-review')).toHaveCount(COMPLETE_COUNT);
  90  |     // No visual snapshot here: case ids and generated attribute values still
  91  |     // vary with the session's own date, so the rendered table is not
  92  |     // byte-stable even under a pinned seed. The table is covered functionally
  93  |     // by the tests in this file.
  94  |   });
  95  | 
  96  |   test('search narrows rows by case id', async ({ protocol, seed, page }) => {
  97  |     await importAndSeed(protocol, seed, page);
  98  |     await page.goto('/data');
  99  |     const search = page.getByTestId('data-search');
  100 |     await search.fill('synthetic-');
  101 |     await expect(page).toHaveURL(/q=synthetic/);
  102 |     // Every synthetic case id begins with "synthetic-", so rows remain.
  103 |     await expect(page.getByRole('row')).not.toHaveCount(1); // header + rows
  104 |   });
  105 | 
  106 |   test('column headers toggle sort and reflect it in the URL', async ({
  107 |     protocol,
  108 |     seed,
  109 |     page,
  110 |   }) => {
  111 |     await importAndSeed(protocol, seed, page);
  112 |     await page.goto('/data');
  113 |     await page.getByRole('button', { name: 'Case ID' }).click();
  114 |     await expect(page).toHaveURL(/sort=caseId/);
  115 |   });
  116 | 
  117 |   test('a deep link restores filter + sort state', async ({
  118 |     protocol,
  119 |     seed,
  120 |     page,
  121 |   }) => {
  122 |     await importAndSeed(protocol, seed, page);
  123 |     await page.goto('/data?status=complete&sort=caseId&dir=asc');
  124 |     await expect(
  125 |       page.getByRole('button', { name: /^Complete ·/ }),
  126 |     ).toHaveAttribute('aria-pressed', 'true');
  127 |   });
  128 | 
  129 |   test('exports selected sessions and the archive contains GraphML + CSV', async ({
  130 |     protocol,
  131 |     seed,
  132 |     download,
  133 |     page,
  134 |   }) => {
  135 |     await importAndSeed(protocol, seed, page);
  136 |     await page.goto('/data');
  137 |     // Filter to complete sessions (guaranteed exportable networks).
  138 |     await page.getByRole('button', { name: /^Complete ·/ }).click();
  139 |     // Select all on page.
  140 |     await page
  141 |       .getByRole('checkbox', { name: 'Select all interviews on this page' })
  142 |       .check();
  143 | 
  144 |     const { fileName, files } = await download.captureExport(async () => {
  145 |       await page.getByTestId('data-export').click();
  146 |       // The export dialog's ready state; role-scoped because its sr-only live
  147 |       // region announces the same text.
  148 |       await expect(
  149 |         page.getByRole('heading', { name: 'Archive ready' }),
  150 |       ).toBeVisible();
  151 |       await page.getByTestId('data-save-export').click();
  152 |     });
  153 | 
  154 |     expect(fileName).toMatch(/^networkCanvasExport-\d+\.zip$/);
  155 |     // Deviation from the brief: the archive's GraphML entry ends in plain
  156 |     // `.graphml`, not `_graphml.graphml`. network-exporters' makeFilename
  157 |     // only appends `_${exportFormat}` when the format name differs from its
  158 |     // extension's own name (true for `ego` → `.csv`, false for `graphml` →
  159 |     // `.graphml`, since `.graphml`/`graphml` collide) — verified directly
  160 |     // against packages/network-exporters/src/utils/general.ts's
  161 |     // makeFilename/getFileExtension.
  162 |     const graphmls = readEntries(files, '.graphml');
  163 |     // One per complete session, and the seed says how many that is.
  164 |     expect(graphmls).toHaveLength(COMPLETE_COUNT);
  165 |     // Every exported (complete) session's GraphML must contain nodes — validate
  166 |     // the whole batch, not just the first entry.
  167 |     for (const graphml of graphmls) {
  168 |       expect(graphmlNodeCount(graphml)).toBeGreaterThan(0);
  169 |     }
  170 |     // One GraphML and one ego CSV per exported session.
  171 |     const egoCsvs = readEntries(files, '_ego.csv');
  172 |     expect(egoCsvs).toHaveLength(graphmls.length);
  173 | 
  174 |     // Export-complete toast, and the Exported facet now flips.
  175 |     await expect(page.getByText('Export complete')).toBeVisible();
  176 |   });
  177 | 
  178 |   test('bulk-deletes selected sessions', async ({ protocol, seed, page }) => {
  179 |     await importAndSeed(protocol, seed, page);
  180 |     await page.goto('/data');
  181 |     await page
  182 |       .getByRole('checkbox', { name: 'Select all interviews on this page' })
```
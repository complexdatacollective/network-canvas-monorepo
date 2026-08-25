import { readFile } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import {
  CurrentProtocolSchema,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { Toolbar } from '../pageobjects/toolbar.js';

/**
 * "Generate synthetic data…": the researcher's own end-to-end path from an open
 * protocol to an export archive on disk.
 *
 * Everything under this button is real — the schema parse, the generation
 * engine, the CSV/GraphML exporter, the browser download — so the only oracle
 * worth having is the file itself. A test that asserted the dialog said
 * "Generated 1 interview" would pass on an app that produced no archive at all,
 * which is the whole feature.
 *
 * The refusal half is asserted against the engine's own sentence, quoted rather
 * than paraphrased (design spec, governing rule 3).
 */

const PROTOCOL_NAME = 'Lean Synthetic';
const SEED = 4242;

async function waitForBoot(page: Page): Promise<void> {
  await page
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

/**
 * The smallest protocol that generates anything at all: one quick-add name
 * generator writing one text attribute. Deliberately lean — this spec is about
 * the plumbing between the engine and the file system, and a protocol with more
 * in it would only make the run slower without making the assertion stronger.
 */
function leanProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    name: PROTOCOL_NAME,
    schemaVersion: 8,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            'name-variable': { name: 'name', type: 'text', component: 'Text' },
          },
        },
      },
    },
    stages: [
      {
        id: 'quick-add',
        type: 'NameGeneratorQuickAdd',
        label: 'Name some people',
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name-variable',
        prompts: [{ id: 'prompt-1', text: 'Who do you spend time with?' }],
      },
    ],
  });
}

async function openGenerationDialog(page: Page) {
  await new Toolbar(page).generateSyntheticData();
  const dialog = page.getByRole('dialog', { name: 'Generate synthetic data' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('generates a seeded batch and saves it as a synthetic export archive', async ({
  architectPage,
  seed,
}) => {
  await seed(leanProtocol(), { name: PROTOCOL_NAME });
  await gotoProtocol(architectPage);

  const dialog = await openGenerationDialog(architectPage);

  await dialog
    .getByRole('spinbutton', { name: 'Number of sessions' })
    .fill('1');
  // Pinned, so the confirmation below has a value this spec can predict — and
  // so a rerun of this test draws the same interview. A bare seed is a legal
  // token: it pins the draws and dates the sessions around the day of the run.
  await dialog.getByRole('textbox', { name: 'Batch token' }).fill(String(SEED));

  // Generation saves nothing on its own. `downloadBlob` is dropped by Safari
  // when it runs outside a user gesture, and the gesture that started the run
  // is spent by the time the archive exists — so the run has to end with the
  // archive waiting, and the researcher's own click is what saves it.
  let savedBeforeAsking = false;
  architectPage.on('download', () => {
    savedBeforeAsking = true;
  });

  await dialog.getByRole('button', { name: 'Generate' }).click();

  await expect(dialog.getByText('Generated 1 interview')).toBeVisible({
    timeout: 45_000,
  });
  expect(savedBeforeAsking).toBe(false);

  const [download] = await Promise.all([
    architectPage.waitForEvent('download', { timeout: 30_000 }),
    dialog.getByRole('button', { name: 'Download archive' }).click(),
  ]);

  // Named for the protocol it came from and marked synthetic, so it cannot be
  // mistaken for a real study's export in a downloads folder. Built by
  // `syntheticArchiveName` (src/lib/syntheticExport/generateSyntheticExport.ts).
  expect(download.suggestedFilename()).toMatch(
    /^Lean_Synthetic-synthetic-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.zip$/,
  );
  // The file is a real archive with both formats in it. Entry names are stored
  // uncompressed in a ZIP's local file headers, so they are readable straight
  // out of the bytes — which is what makes this an assertion about what the
  // exporter produced rather than about what the dialog claimed.
  const path = await download.path();
  const archive = await readFile(path);
  expect(archive.subarray(0, 2).toString('latin1')).toBe('PK');
  const entryNames = archive.toString('latin1');
  expect(entryNames).toContain('.csv');
  expect(entryNames).toContain('.graphml');

  // And the researcher is told which batch produced it, as the token that asks
  // for it again — the seed AND the day its sessions are dated against, since
  // the seed alone would redraw the same answers onto different dates.
  await expect(
    dialog.getByText(new RegExp(`${SEED}-\\d{4}-\\d{2}-\\d{2}`)),
  ).toBeVisible();
  await expect(
    dialog.getByText(new RegExp(download.suggestedFilename())),
  ).toBeVisible();
  // The batch is still there afterwards: saving into the wrong folder should
  // not cost the researcher the archive.
  await expect(
    dialog.getByRole('button', { name: 'Download archive' }),
  ).toBeEnabled();
});

/**
 * A roster whose pool cannot reach the stage's own `behaviours.minNodes` gate.
 *
 * Two rows against a floor of five: below the floor the live interface refuses
 * to advance and a roster interface fabricates nobody, so the protocol would
 * strand a real participant — exactly the session generation refuses to invent.
 */
const ROSTER_ROWS = 2;
const ROSTER_MIN_NODES = 5;
const ROSTER_STAGE_LABEL = 'Pick from the roster';

const ROSTER_DATA = JSON.stringify({
  nodes: [{ attributes: { name: 'Amara' } }, { attributes: { name: 'Beto' } }],
});

/**
 * The engine's own refusal (`constraints/feasibility.ts`, `rosterConflicts`),
 * quoted rather than paraphrased. The measured pool size is part of it on
 * purpose: a fixture whose asset never resolved would report "no rows were
 * resolved for it" and fail here, so this also proves the pool travelled
 * through Architect's asset store on the way to the engine.
 */
const ROSTER_REFUSAL =
  `stage "${ROSTER_STAGE_LABEL}" must nominate at least ${ROSTER_MIN_NODES} from its roster, ` +
  `and only ${ROSTER_ROWS} rows were resolved for it`;

function undersizedRosterProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    name: 'Refusing Synthetic',
    schemaVersion: 8,
    assetManifest: {
      roster_data: { name: 'Roster', type: 'network', source: 'roster.json' },
    },
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            'name-variable': { name: 'name', type: 'text', component: 'Text' },
          },
        },
      },
    },
    stages: [
      {
        id: 'roster-stage',
        type: 'NameGeneratorRoster',
        label: ROSTER_STAGE_LABEL,
        subject: { entity: 'node', type: 'person' },
        dataSource: 'roster_data',
        behaviours: { minNodes: ROSTER_MIN_NODES },
        prompts: [{ id: 'prompt-1', text: 'Choose someone you know' }],
      },
    ],
  });
}

test('a protocol that can never generate shows the engine’s refusal and saves nothing', async ({
  architectPage,
  seed,
}) => {
  await seed(undersizedRosterProtocol(), {
    name: 'Refusing Synthetic',
    assets: [
      { assetId: 'roster_data', name: 'roster.json', data: ROSTER_DATA },
    ],
  });
  await gotoProtocol(architectPage);
  await waitForBoot(architectPage);

  const dialog = await openGenerationDialog(architectPage);

  // A download would resolve this race first, so this also proves no archive
  // was produced: the refusal has to arrive with nothing saved.
  let downloaded = false;
  architectPage.on('download', () => {
    downloaded = true;
  });

  await dialog.getByRole('button', { name: 'Generate' }).click();

  await expect(
    dialog.getByText('Synthetic data could not be generated'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText(ROSTER_REFUSAL)).toBeVisible();

  expect(downloaded).toBe(false);
  // The dialog is usable again: a refusal is something to fix and retry, not a
  // dead end.
  await expect(dialog.getByRole('button', { name: 'Generate' })).toBeEnabled();
});

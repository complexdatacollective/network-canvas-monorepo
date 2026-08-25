import type { Locator, Page } from '@playwright/test';

import {
  CurrentProtocolSchema,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { readProtocolJson } from '../helpers/read-store.js';
import {
  expandSynthetic,
  syntheticDisclosure,
  syntheticReset,
} from '../pageobjects/editor-sections/synthetic.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

/**
 * Synthetic data in the Codebook (spec revision 2, item 6: the separate
 * "Synthetic data" screen is gone and the Codebook absorbed it).
 *
 * Three properties are at stake:
 *
 *  - what the screen SAYS. Each attribute's row summarises the values
 *    generation would produce, resolved by the schema from the protocol's own
 *    validation, and states in whole sentences what the protocol's interfaces
 *    have already decided;
 *  - what a researcher can DO there. The same sub-editor the type editor uses
 *    is in the row, and what it writes is asserted against the canonical
 *    protocol row in IndexedDB — the JSON a download bundles;
 *  - what the ENGINE says. The refusal below is `analyseSyntheticFeasibility`'s
 *    own sentence, reached through Architect's asset store — the roster is a
 *    real file in the `assets` object store, resolved by the same host contract
 *    the preview uses — so the assertion is on the engine's wording, verbatim,
 *    including the pool size it measured.
 */

const NODE_TYPE_ID = 'person';
const SUBJECT_KEY = `node:${NODE_TYPE_ID}`;
const NAME_ID = 'person-name';
const AGE_ID = 'person-age';
const CLOSENESS_ID = 'person-closeness';
const CONTACT_ID = 'person-contact';
const BIN_STAGE_LABEL = 'Contact types';

/** The window `age` declares, which is what its resolved draw must respect. */
const AGE_SUMMARY = 'uniform(min 18, max 90)';

/**
 * One of the sentences the bin's own rules produce. Quoted rather than
 * paraphrased: the same wording explains the disabled control inside the row's
 * sub-editor, so a researcher meets one explanation rather than two.
 */
const BIN_NOTE = `Single choice: “${BIN_STAGE_LABEL}” assigns exactly one option.`;

async function waitForBoot(page: Page): Promise<void> {
  await page
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

/**
 * The codebook row for one attribute, found through the marker its own deep
 * link lands on — so the locator and the link cannot disagree about which row
 * an attribute has.
 */
async function codebookRow(page: Page, variableId: string): Promise<Locator> {
  const marker = page.locator(
    `[data-codebook-variable="${SUBJECT_KEY}/${variableId}"]`,
  );
  await expect(marker).toBeVisible({ timeout: 20_000 });
  return marker.locator('xpath=ancestor::tr[1]');
}

/** The cell a header names, resolved from that row's own table. */
async function cellUnder(row: Locator, header: string): Promise<Locator> {
  const table = row.locator('xpath=ancestor::table[1]');
  const headers = await table.getByRole('columnheader').allInnerTexts();
  const index = headers.findIndex((text) => text.trim() === header);
  // The column list is data this assertion depends on: a renamed header would
  // otherwise silently return `nth(-1)` and every cell claim below would be
  // made about nothing.
  expect(
    index,
    `no "${header}" column among ${JSON.stringify(headers)}`,
  ).toBeGreaterThanOrEqual(0);
  return row.getByRole('cell').nth(index);
}

/**
 * One codebook attribute out of the canonical protocol row, refusing to answer
 * about anything else.
 *
 * Throws rather than returning a sentinel: an assertion built on an attribute
 * that resolved to `undefined` would compare undefined to undefined and pass
 * while measuring nothing.
 */
function savedVariable(
  protocol: CurrentProtocol,
  variableId: string,
): Record<string, unknown> {
  const variable =
    protocol.codebook.node?.[NODE_TYPE_ID]?.variables?.[variableId];
  if (variable === undefined) {
    throw new Error(`no attribute "${variableId}" in the saved codebook`);
  }
  return variable;
}

/**
 * A protocol whose codebook carries one attribute of each shape the synthetic
 * columns describe, and the two stages that decide part of the answer for them.
 *
 * Passed through `CurrentProtocolSchema.parse`: unlike a stage descriptor, a
 * variable's `synthetic` block has no prefault (`OrdinalSyntheticSchema.optional()`),
 * so parsing leaves every attribute here without one — which is what lets the
 * authoring assertion below claim the saved block is EXACTLY what was typed.
 */
function codebookProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    name: 'Synthetic Codebook E2E',
    schemaVersion: 8,
    codebook: {
      node: {
        [NODE_TYPE_ID]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [NAME_ID]: { name: 'name', type: 'text', component: 'Text' },
            [AGE_ID]: {
              name: 'age',
              type: 'number',
              component: 'Number',
              validation: { minValue: 18, maxValue: 90 },
            },
            [CLOSENESS_ID]: {
              name: 'closeness',
              type: 'ordinal',
              component: 'LikertScale',
              options: [
                { label: 'Distant', value: 1 },
                { label: 'Close', value: 2 },
              ],
            },
            [CONTACT_ID]: {
              name: 'contactType',
              type: 'categorical',
              component: 'CheckboxGroup',
              options: [
                { label: 'Family', value: 'family' },
                { label: 'Work', value: 'work' },
              ],
            },
          },
        },
      },
    },
    stages: [
      {
        id: 'friends',
        type: 'NameGenerator',
        label: 'Friends',
        subject: { entity: 'node', type: NODE_TYPE_ID },
        form: {
          title: 'About them',
          fields: [
            { variable: NAME_ID, prompt: 'Their name' },
            { variable: AGE_ID, prompt: 'How old are they?' },
            { variable: CLOSENESS_ID, prompt: 'How close are you?' },
          ],
        },
        prompts: [{ id: 'friends-p1', text: 'Who do you know?' }],
      },
      {
        id: 'contact-types',
        type: 'CategoricalBin',
        label: BIN_STAGE_LABEL,
        subject: { entity: 'node', type: NODE_TYPE_ID },
        prompts: [
          {
            id: 'contact-p1',
            text: 'Sort these people by how you know them.',
            variable: CONTACT_ID,
          },
        ],
      },
    ],
  });
}

test('the codebook states the protocol verdict and what generation would produce for each attribute', async ({
  architectPage,
  seed,
}) => {
  await seed(codebookProtocol());
  await gotoProtocol(architectPage);
  await architectPage.goto('/protocol/codebook');
  await waitForBoot(architectPage);

  // The protocol is generable, which is also what makes the refusal assertions
  // in the last test discriminating rather than trivially true.
  await expect(
    architectPage.getByText('Generation is possible', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  // The summary is the SCHEMA's resolution of this attribute's own validation,
  // not a default: an attribute with no declared window would not say this.
  const ageRow = await codebookRow(architectPage, AGE_ID);
  await expect(await cellUnder(ageRow, 'Synthetic data')).toContainText(
    AGE_SUMMARY,
  );

  // What the interviews have already decided, named by the stage that decided
  // it — the only thing the summary beside it cannot say.
  const contactRow = await codebookRow(architectPage, CONTACT_ID);
  await expect(await cellUnder(contactRow, 'Set by the interview')).toHaveText(
    new RegExp(BIN_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
  // An attribute no interface constrains says nothing rather than something
  // generic, so the sentence above is about this bin and not about every row.
  await expect(
    await cellUnder(ageRow, 'Set by the interview'),
  ).not.toContainText('Single choice');
});

test('a link naming an attribute opens the codebook at its row, with its generation settings open', async ({
  architectPage,
  seed,
}) => {
  await seed(codebookProtocol());
  await gotoProtocol(architectPage);
  await architectPage.goto(
    `/protocol/codebook?entity=${encodeURIComponent(SUBJECT_KEY)}&variable=${CONTACT_ID}`,
  );
  await waitForBoot(architectPage);

  const rowSelector = `[data-codebook-variable="${SUBJECT_KEY}/${CONTACT_ID}"]`;
  await expect(architectPage.locator(rowSelector)).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(async () =>
      // Read straight from the document and let a failure throw: a helper that
      // turned "no such row" into `false` would compare false to false and
      // pass while measuring nothing.
      architectPage.evaluate((selector: string) => {
        const row = document.querySelector(selector);
        if (!row) throw new Error(`no codebook row matching ${selector}`);
        return (
          document.activeElement !== null &&
          row.contains(document.activeElement)
        );
      }, rowSelector),
    )
    .toBe(true);

  // The link is a request to WORK on this attribute, so its sub-editor is open
  // rather than one click away.
  const contactRow = await codebookRow(architectPage, CONTACT_ID);
  const contactCell = await cellUnder(contactRow, 'Synthetic data');
  await expect(syntheticDisclosure(contactCell, 'contactType')).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  // Only the attribute the link named: a screen that opened everything would
  // pass the assertion above while meaning nothing by it.
  const ageRow = await codebookRow(architectPage, AGE_ID);
  const ageCell = await cellUnder(ageRow, 'Synthetic data');
  await expect(syntheticDisclosure(ageCell, 'age')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('an option weight authored in the codebook table is saved into the protocol, and reset removes it', async ({
  architectPage,
  seed,
}) => {
  await seed(codebookProtocol());
  await gotoProtocol(architectPage);
  await architectPage.goto('/protocol/codebook');
  await waitForBoot(architectPage);

  const row = await codebookRow(architectPage, CLOSENESS_ID);
  const cell = await cellUnder(row, 'Synthetic data');

  // Nothing authored yet: the reset affordance renders only for a block the
  // protocol actually carries, so its absence is the starting state.
  await expect(syntheticReset(cell, 'closeness')).toHaveCount(0);

  await expandSynthetic(cell, 'closeness');
  const weight = cell.getByRole('spinbutton', { name: 'Weight for 2' });
  await weight.fill('4');
  await weight.blur();

  const authored = await readProtocolJson(
    architectPage,
    (protocol) => savedVariable(protocol, CLOSENESS_ID).synthetic !== undefined,
  );
  // EXACTLY what was typed, keyed by the option's own value and living in the
  // attribute's `synthetic` block rather than on the option objects. A block
  // that gained a parameter nobody authored fails here.
  expect(savedVariable(authored, CLOSENESS_ID).synthetic).toEqual({
    optionWeights: [{ value: 2, weight: 4 }],
  });

  await syntheticReset(cell, 'closeness').click();

  const reset = await readProtocolJson(
    architectPage,
    (protocol) => savedVariable(protocol, CLOSENESS_ID).synthetic === undefined,
  );
  // Removed, not emptied: an empty block is a key the schema refuses, and would
  // read as authored to every surface that asks.
  expect(Object.keys(savedVariable(reset, CLOSENESS_ID))).not.toContain(
    'synthetic',
  );
});

/**
 * A roster whose pool cannot reach the stage's own `behaviours.minNodes` gate.
 *
 * Two rows against a floor of five: below the floor the live interface refuses
 * to advance and a roster interface fabricates nobody, so the protocol would
 * strand a real participant — which is exactly the session generation refuses
 * to invent.
 */
const ROSTER_ROWS = 2;
const ROSTER_MIN_NODES = 5;
const ROSTER_STAGE_ID = 'roster-stage';
const ROSTER_STAGE_LABEL = 'Pick from the roster';

const ROSTER_DATA = JSON.stringify({
  nodes: [{ attributes: { name: 'Amara' } }, { attributes: { name: 'Beto' } }],
});

/**
 * The engine's own refusal (`constraints/feasibility.ts`, `rosterConflicts`),
 * quoted rather than paraphrased — the spec's governing rule 3. The measured
 * pool size is part of it on purpose: a fixture whose asset never resolved
 * would report "no rows were resolved for it" and fail here, so this also
 * proves the pool travelled through Architect's asset store.
 */
const ROSTER_REFUSAL =
  `stage "${ROSTER_STAGE_LABEL}" must nominate at least ${ROSTER_MIN_NODES} from its roster, ` +
  `and only ${ROSTER_ROWS} rows were resolved for it`;

/**
 * Passed through `CurrentProtocolSchema.parse`: `dataSource` is a branded asset
 * reference a plain literal is not assignable to, and this fixture's subject is
 * the engine's verdict rather than which keys a human wrote.
 */
function undersizedRosterProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    name: 'Synthetic Feasibility E2E',
    schemaVersion: 8,
    assetManifest: {
      roster_data: { name: 'Roster', type: 'network', source: 'roster.json' },
    },
    codebook: {
      node: {
        [NODE_TYPE_ID]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [NAME_ID]: { name: 'name', type: 'text', component: 'Text' },
          },
        },
      },
    },
    stages: [
      {
        id: ROSTER_STAGE_ID,
        type: 'NameGeneratorRoster',
        label: ROSTER_STAGE_LABEL,
        subject: { entity: 'node', type: NODE_TYPE_ID },
        dataSource: 'roster_data',
        behaviours: { minNodes: ROSTER_MIN_NODES },
        prompts: [{ id: 'prompt-1', text: 'Choose someone you know' }],
      },
    ],
  });
}

test('a roster too small for its minimum shows the engine’s refusal in the stage editor and on the codebook', async ({
  architectPage,
  seed,
}) => {
  await seed(undersizedRosterProtocol(), {
    assets: [
      { assetId: 'roster_data', name: 'roster.json', data: ROSTER_DATA },
    ],
  });
  await gotoProtocol(architectPage);

  await architectPage.goto(`/protocol/stage/${ROSTER_STAGE_ID}`);
  await waitForBoot(architectPage);

  // Above the disclosure, not inside it: a refusal a researcher has to expand
  // a row to discover is one they would meet at save time instead.
  const editor = new StageEditor(architectPage);
  await expect(
    editor.section('Synthetic data').getByText(ROSTER_REFUSAL),
  ).toBeVisible({ timeout: 20_000 });

  await architectPage.goto('/protocol/codebook');
  await waitForBoot(architectPage);

  await expect(
    architectPage.getByText('Synthetic data cannot be generated', {
      exact: true,
    }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(architectPage.getByText(ROSTER_REFUSAL).first()).toBeVisible();
  await expect(
    architectPage.getByText('Generation is possible', { exact: true }),
  ).toHaveCount(0);
});

import type { Locator, Page } from '@playwright/test';

import {
  CurrentProtocolSchema,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { nodeTypeByName, variableIdByName } from '../helpers/codebook.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { selectOrCreateNodeType } from '../pageobjects/editor-sections/entity-types.js';
import { addFormField } from '../pageobjects/editor-sections/forms.js';
import { addPrompt } from '../pageobjects/editor-sections/prompts.js';
import {
  AUTHORED_BADGE,
  DEFAULT_BADGE,
  expandSynthetic,
  syntheticDisclosure,
} from '../pageobjects/editor-sections/synthetic.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

/**
 * The read-only "Synthetic data" overview (`/protocol/synthetic`), and the live
 * feasibility verdict it shares with every stage editor.
 *
 * Two properties are at stake, and each needs its own fixture:
 *
 *  - what the screen SAYS. Which parameters a human wrote and which the schema
 *    resolved is only observable in a document nothing has parsed, so that
 *    fixture is built through the editor from `emptyProtocol()` (see
 *    `synthetic-authoring.spec.ts` for why a parsed seed cannot show it);
 *  - what the ENGINE says. The refusal below is `analyseSyntheticFeasibility`'s
 *    own sentence, reached through Architect's asset store — the roster is a
 *    real file in the `assets` object store, resolved by the same host contract
 *    the preview uses — so the assertion is on the engine's wording, verbatim,
 *    including the pool size it measured.
 */

const NODE_TYPE = 'person';
const STAGE_LABEL = 'Friends';
const VARIABLE_NAME = 'age';

/** The column a header names, resolved from the table's own header row. */
async function cellUnder(
  table: Locator,
  row: Locator,
  header: string,
): Promise<Locator> {
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

async function waitForBoot(page: Page): Promise<void> {
  await page
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

/**
 * A NameGenerator built through the editor with exactly ONE parameter
 * authored: the count's distribution family.
 *
 * That single gesture is what makes the two badges observable on one row —
 * the count becomes a key the document states, while the response burden
 * beside it stays a key only the schema supplies.
 */
async function buildStageWithAuthoredCount(page: Page): Promise<void> {
  const editor = new StageEditor(page);
  await editor.createNew('NameGenerator');
  await editor.setStageName(STAGE_LABEL);

  await selectOrCreateNodeType(page, NODE_TYPE);
  await editor.field('form.title').getByRole('textbox').fill('Add a person');
  await addFormField(editor.section('Form'), {
    variableName: VARIABLE_NAME,
    promptText: 'How old are they?',
    inputControl: 'Number Input',
  });
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Name someone you know');
  });

  const synthetic = editor.section('Synthetic data');
  await expandSynthetic(synthetic);
  await editor
    .field('synthetic.count.distribution')
    .getByRole('combobox', { name: 'Distribution' })
    .click();
  await page.getByRole('option', { name: 'Poisson', exact: true }).click();
  await expect(syntheticDisclosure(synthetic)).toHaveAccessibleName(
    /Authored$/,
  );

  await editor.expectNoIssues();
  await editor.save();
}

test('the overview lists stages and attributes with authored and default badges, and links to their editors', async ({
  architectPage,
  seed,
}) => {
  test.slow();

  await seed(emptyProtocol());
  await gotoProtocol(architectPage);
  await buildStageWithAuthoredCount(architectPage);

  const protocol = await readProtocolJson(architectPage);
  const stage = protocol.stages[0];
  if (stage?.type !== 'NameGenerator') {
    throw new Error(`expected a NameGenerator, found ${String(stage?.type)}`);
  }
  // Both the type and the attribute were created through the editor, so both
  // are keyed by a generated uuid rather than by the names typed above.
  const { typeId, variables } = nodeTypeByName(protocol, NODE_TYPE);
  const variableId = variableIdByName(variables, VARIABLE_NAME);

  await architectPage.goto('/protocol/synthetic');
  await waitForBoot(architectPage);

  // The protocol is generable, which is also what makes the refusal assertions
  // in the next test discriminating rather than trivially true.
  await expect(
    architectPage.getByText('Generation is possible', { exact: true }),
  ).toBeVisible();

  const stageTable = architectPage.getByRole('table', { name: 'Stages' });
  // Anchored on the stage's own label, which opens the accessible name (WCAG
  // "Label in Name"); the rest names the destination.
  const stageLinkName = new RegExp(`^${STAGE_LABEL}\\b.*open this stage`);
  const stageLink = stageTable.getByRole('link', { name: stageLinkName });
  await expect(stageLink).toBeVisible();

  // The `has:` locator is queried FROM each row rather than from the document,
  // so it must be built on the page — a locator chained off `stageTable` would
  // look for a table inside the row and match nothing.
  const stageRow = stageTable
    .getByRole('row')
    .filter({ has: architectPage.getByRole('link', { name: stageLinkName }) })
    .first();
  await expect(
    await cellUnder(stageTable, stageRow, 'Node count'),
  ).toContainText(AUTHORED_BADGE);
  await expect(
    await cellUnder(stageTable, stageRow, 'Response burden'),
  ).toContainText(DEFAULT_BADGE);

  const variableTable = architectPage.getByRole('table', {
    name: 'Attributes',
  });
  const variableLinkName = new RegExp(`^${VARIABLE_NAME}\\b.*in the codebook`);
  const variableLink = variableTable.getByRole('link', {
    name: variableLinkName,
  });
  await expect(variableLink).toBeVisible();
  const variableRow = variableTable
    .getByRole('row')
    .filter({
      has: architectPage.getByRole('link', { name: variableLinkName }),
    })
    .first();
  await expect(
    await cellUnder(variableTable, variableRow, 'Status'),
  ).toContainText(DEFAULT_BADGE);

  // A stage row opens that stage's editor AT its Synthetic data section: the
  // deep link scrolls the section into view and lands focus on its disclosure,
  // which is where working on it starts.
  await stageLink.click();
  await architectPage.waitForURL(
    new RegExp(`/protocol/stage/${stage.id}\\?section=synthetic$`),
  );
  const editor = new StageEditor(architectPage);
  await expect(
    syntheticDisclosure(editor.section('Synthetic data')),
  ).toBeFocused();

  await architectPage.goto('/protocol/synthetic');
  await waitForBoot(architectPage);

  // An attribute row opens the Codebook at THAT attribute's row, not the top
  // of a page the researcher then has to search.
  await variableLink.click();
  await architectPage.waitForURL(
    new RegExp(
      `/protocol/codebook\\?entity=node%3A${typeId}&variable=${variableId}$`,
    ),
  );
  const rowSelector = `[data-codebook-variable="node:${typeId}/${variableId}"]`;
  await expect(architectPage.locator(rowSelector)).toBeVisible();
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
 * the engine's verdict rather than which keys a human wrote — so the parse's
 * own resolved descriptors are harmless here.
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
        [NODE_TYPE]: {
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
        id: ROSTER_STAGE_ID,
        type: 'NameGeneratorRoster',
        label: ROSTER_STAGE_LABEL,
        subject: { entity: 'node', type: NODE_TYPE },
        dataSource: 'roster_data',
        behaviours: { minNodes: ROSTER_MIN_NODES },
        prompts: [{ id: 'prompt-1', text: 'Choose someone you know' }],
      },
    ],
  });
}

test('a roster too small for its minimum shows the engine’s refusal in the stage editor and on the overview', async ({
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

  await architectPage.goto('/protocol/synthetic');
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

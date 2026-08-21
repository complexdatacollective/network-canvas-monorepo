import type { Page } from '@playwright/test';

import {
  MAX_SYNTHETIC_POPULATION,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { nodeTypeByName } from '../helpers/codebook.js';
import { readProtocolJson, readStageJson } from '../helpers/read-store.js';
import { selectOrCreateNodeType } from '../pageobjects/editor-sections/entity-types.js';
import { addFormField } from '../pageobjects/editor-sections/forms.js';
import { addExistingNetworkPanel } from '../pageobjects/editor-sections/panels.js';
import { addPrompt } from '../pageobjects/editor-sections/prompts.js';
import { addSociogramPrompt } from '../pageobjects/editor-sections/sociogram-prompts.js';
import {
  expandSynthetic,
  syntheticDisclosure,
  syntheticReset,
} from '../pageobjects/editor-sections/synthetic.js';
import { StagePreview } from '../pageobjects/preview.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

/**
 * Authoring synthetic-generation parameters THROUGH THE UI, and the document
 * that authoring leaves behind.
 *
 * Every fixture here starts from `emptyProtocol()` and builds its stages with
 * the real editor, because the property under test is the spec's rule 4 —
 * **authored = key present, default = key absent** — and only a document
 * nothing has parsed can show it. `CurrentProtocolSchema.parse` resolves every
 * stage's descriptor as it validates (that is what `withResolvedSyntheticCount`
 * and the `.prefault({})`s are for), so a seeded-and-parsed protocol arrives
 * with `synthetic` on every stage and could never tell a key a researcher wrote
 * from one the schema supplied.
 *
 * The oracle is therefore the canonical protocol row in IndexedDB
 * (`readProtocolJson`/`readStageJson`) — the same JSON a download bundles —
 * asserted with `toEqual` plus an explicit key list, so a block that gained a
 * parameter nobody authored fails here rather than shipping.
 */

const NODE_TYPE = 'person';
const STAGE_LABEL = 'Friends';
const PANEL_TITLE = 'People you named earlier';

/**
 * The count the stage below is left carrying. `min`/`max` are the schema's own
 * resolution of an unbounded Poisson (`withResolvedBounds`: the stage's
 * `behaviours` window, or the population ceiling where it declares none) —
 * read from the editor's resolved value the moment the mean is edited, which
 * is why they appear in the saved declaration.
 */
const AUTHORED_COUNT = {
  distribution: 'poisson',
  mean: 4,
  min: 0,
  max: MAX_SYNTHETIC_POPULATION,
};
const AUTHORED_BURDEN = 0.42;
const AUTHORED_NOMINATION_PROBABILITY = 0.6;

/**
 * Build a NameGenerator with one existing-network panel through the editor,
 * author a count, a response burden and the panel's nomination odds, and save.
 *
 * A NameGenerator is the stage type that reaches every stage-level surface at
 * once: its descriptor carries a count (`stageNodeSynthetic`), every stage
 * carries a burden, and it is one of the two interfaces with side panels.
 */
async function buildAuthoredNameGenerator(page: Page): Promise<void> {
  const editor = new StageEditor(page);
  await editor.createNew('NameGenerator');
  await editor.setStageName(STAGE_LABEL);

  await selectOrCreateNodeType(page, NODE_TYPE);
  await editor.field('form.title').getByRole('textbox').fill('Add a person');
  await addFormField(editor.section('Form'), {
    variableName: 'nickname',
    promptText: 'What do they go by?',
    inputControl: 'Text Input',
  });
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Name someone you know');
  });
  await addExistingNetworkPanel(editor, PANEL_TITLE);

  const synthetic = editor.section('Synthetic data');
  // Collapsed and unauthored on arrival — the badge is part of the trigger's
  // accessible name, so this is the "zero weight until customised" claim
  // (spec rule 4) made against what a screen reader would announce.
  await expect(syntheticDisclosure(synthetic)).toHaveAccessibleName(/Default$/);
  await expect(syntheticReset(synthetic)).toHaveCount(0);

  await expandSynthetic(synthetic);

  // The count's family select is a Base UI Select (`StyledSelectField`), so it
  // is a combobox trigger plus a listbox option, as elsewhere in this suite.
  await editor
    .field('synthetic.count.distribution')
    .getByRole('combobox', { name: 'Distribution' })
    .click();
  await page.getByRole('option', { name: 'Poisson', exact: true }).click();

  await editor
    .field('synthetic.count.mean')
    .getByRole('spinbutton')
    .fill(String(AUTHORED_COUNT.mean));
  await editor
    .field('synthetic.responseBurden')
    .getByRole('spinbutton')
    .fill(String(AUTHORED_BURDEN));

  // Authoring is what earns the badge and the reset affordance.
  await expect(syntheticDisclosure(synthetic)).toHaveAccessibleName(
    /Authored$/,
  );
  await expect(syntheticReset(synthetic)).toBeVisible();

  const panels = editor.section('Side Panels');
  await expandSynthetic(panels);
  await editor
    .field('panels[0].synthetic.nominationProbability')
    .getByRole('spinbutton')
    .fill(String(AUTHORED_NOMINATION_PROBABILITY));

  await editor.expectNoIssues();
  await editor.save();
}

function nameGeneratorAt(protocol: CurrentProtocol, index: number) {
  const stage = protocol.stages[index];
  if (stage?.type !== 'NameGenerator') {
    throw new Error(
      `expected a NameGenerator at index ${index}, found ${String(stage?.type)}`,
    );
  }
  return stage;
}

test('authors a stage count, a response burden and a panel nomination probability through the UI', async ({
  architectPage,
  seed,
}) => {
  // A whole stage built through the editor plus four authoring gestures.
  test.slow();

  await seed(emptyProtocol());
  await gotoProtocol(architectPage);
  await buildAuthoredNameGenerator(architectPage);

  const stage = await readStageJson(architectPage, 0);
  if (stage.type !== 'NameGenerator') {
    throw new Error(`expected a NameGenerator stage, found ${stage.type}`);
  }

  expect(stage.synthetic).toEqual({
    count: AUTHORED_COUNT,
    responseBurden: AUTHORED_BURDEN,
  });
  // `toEqual` treats an explicitly-`undefined` property as absent, so the key
  // list is what actually pins "and nothing else": a descriptor that gained a
  // topology, or wrote `generatesData` a researcher never touched, fails here.
  expect(Object.keys(stage.synthetic).toSorted()).toEqual([
    'count',
    'responseBurden',
  ]);

  expect(stage.panels).toHaveLength(1);
  expect(stage.panels?.[0]?.synthetic).toEqual({
    nominationProbability: AUTHORED_NOMINATION_PROBABILITY,
  });

  // Nothing this flow touched authors a VARIABLE, so the attribute the form
  // field created must still carry no block at all — the other half of
  // "exactly the authored blocks and nothing else".
  const protocol = await readProtocolJson(architectPage);
  const { variables } = nodeTypeByName(protocol, NODE_TYPE);
  const entries = Object.entries(variables);
  expect(entries.length).toBeGreaterThan(0);
  for (const [id, variable] of entries) {
    expect({ id, hasSynthetic: 'synthetic' in variable }).toEqual({
      id,
      hasSynthetic: false,
    });
  }
});

test('resetting a synthetic section removes the authored keys from the saved protocol', async ({
  architectPage,
  seed,
}) => {
  test.slow();

  await seed(emptyProtocol());
  await gotoProtocol(architectPage);
  await buildAuthoredNameGenerator(architectPage);

  const stageId = nameGeneratorAt(await readProtocolJson(architectPage), 0).id;

  await architectPage.goto(`/protocol/stage/${stageId}`);
  await architectPage
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  const editor = new StageEditor(architectPage);
  const synthetic = editor.section('Synthetic data');
  // The authored state actually reloaded — without this the reset below could
  // be resetting a section that was already at its default.
  await expect(syntheticDisclosure(synthetic)).toHaveAccessibleName(
    /Authored$/,
  );

  await syntheticReset(synthetic).click();
  await expect(syntheticDisclosure(synthetic)).toHaveAccessibleName(/Default$/);
  await expect(syntheticReset(synthetic)).toHaveCount(0);

  const panels = editor.section('Side Panels');
  await expect(syntheticDisclosure(panels)).toHaveAccessibleName(/Authored$/);
  await syntheticReset(panels).click();
  await expect(syntheticDisclosure(panels)).toHaveAccessibleName(/Default$/);

  await editor.expectNoIssues();
  await editor.save();

  // The row already exists from the first save, so the poll must wait for the
  // reset to land rather than being satisfied by the pre-reset JSON.
  const protocol = await readProtocolJson(
    architectPage,
    (candidate) => candidate.stages[0]?.synthetic === undefined,
  );
  const stage = nameGeneratorAt(protocol, 0);
  expect(stage.synthetic).toBeUndefined();
  expect(stage.panels?.[0]?.synthetic).toBeUndefined();
  // The panel itself survived the reset: a reset that dropped the panel would
  // satisfy the assertion above while destroying the researcher's work.
  expect(stage.panels?.[0]).toMatchObject({
    title: PANEL_TITLE,
    dataSource: 'existing',
  });
});

test('authors an edge topology, including a change of metric', async ({
  architectPage,
  seed,
}) => {
  test.slow();

  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Sociogram');
  await editor.setStageName('Draw Your Network');
  await selectOrCreateNodeType(architectPage, NODE_TYPE);
  // Background.tsx's concentric-circles count is a required field on every
  // Sociogram (see `interfaces/sociogram.spec.ts`), so the stage cannot be
  // committed — and therefore nothing about its topology could be asserted —
  // without it.
  await editor
    .field('background.concentricCircles')
    .getByRole('spinbutton')
    .fill('4');
  // A topology decides how densely a stage LINKS people, so the section only
  // offers it once something on the stage creates an edge (spec, "Sociogram
  // nuance") — hence an edge-creating prompt rather than a layout-only one.
  await addSociogramPrompt(editor, architectPage, {
    text: 'Link the people who know each other',
    layoutVariable: 'layout',
    interaction: {
      kind: 'createEdge',
      edgeName: 'knows',
      createNewEdgeType: true,
    },
  });

  const synthetic = editor.section('Synthetic data');
  await expandSynthetic(synthetic);

  // The two metrics name different quantities — a proportion of the available
  // pairs, and ties per person — so switching lands on the new metric's own
  // schema default rather than carrying the old numbers across.
  await editor
    .field('synthetic.topology.metric')
    .getByRole('combobox', { name: 'Topology measure' })
    .click();
  await architectPage
    .getByRole('option', { name: 'Density', exact: true })
    .click();

  await editor
    .field('synthetic.topology.distribution.value')
    .getByRole('spinbutton')
    .fill('0.25');

  await expect(syntheticDisclosure(synthetic)).toHaveAccessibleName(
    /Authored$/,
  );

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  if (stage.type !== 'Sociogram') {
    throw new Error(`expected a Sociogram stage, found ${stage.type}`);
  }
  expect(stage.synthetic).toEqual({
    topology: {
      metric: 'density',
      distribution: { distribution: 'constant', value: 0.25 },
    },
  });
  // A burden nobody touched stays unstated: authoring one parameter must not
  // silently write the whole descriptor down.
  expect(Object.keys(stage.synthetic).toSorted()).toEqual(['topology']);
});

test('authors a variable value distribution and an option weight in the codebook', async ({
  architectPage,
  seed,
}) => {
  test.slow();

  await seed(codebookProtocol());
  await gotoProtocol(architectPage);
  await architectPage.goto('/protocol/codebook');
  await architectPage
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  await architectPage
    .getByRole('button', { name: 'Edit entity', exact: true })
    .first()
    .click();

  // TypeEditor renders one disclosure per attribute inside its "Synthetic
  // data" field (`CodebookVariablesSynthetic`), each titled by the attribute's
  // own name so a screen-reader list of buttons can tell them apart.
  const variablesSection = architectPage.locator(
    '[data-field-name="variables"]',
  );
  await expect(variablesSection).toBeVisible();

  // The weight column is disclosure-driven: collapsed and unauthored, the
  // options editor is exactly what it was before this feature existed.
  const weightField = architectPage.getByRole('spinbutton', {
    name: 'Weight for daily',
    exact: true,
  });
  await expect(weightField).toHaveCount(0);

  await expandSynthetic(variablesSection, 'age');
  await architectPage
    .locator(
      '[data-field-name="variables.age-variable.synthetic.distribution"]',
    )
    .getByLabel('How values are spread')
    .selectOption({ label: 'Always the same value' });
  await architectPage
    .locator('[data-field-name="variables.age-variable.synthetic.value"]')
    .getByRole('spinbutton')
    .fill('42');

  await expandSynthetic(variablesSection, 'contact');
  await expect(weightField).toBeVisible();
  await weightField.fill('3');

  await architectPage
    .getByRole('button', { name: 'Save and Close', exact: true })
    .click();

  const protocol = await readProtocolJson(architectPage, (candidate) =>
    JSON.stringify(
      candidate.codebook.node?.[NODE_TYPE]?.variables ?? {},
    ).includes('optionWeights'),
  );
  const variables = protocol.codebook.node?.[NODE_TYPE]?.variables ?? {};

  expect(numberVariable(variables, 'age-variable').synthetic).toEqual({
    distribution: 'constant',
    value: 42,
  });
  expect(ordinalVariable(variables, 'contact-variable').synthetic).toEqual({
    optionWeights: [{ value: 'daily', weight: 3 }],
  });
  // The attribute nobody opened keeps no block, so the disclosure is doing the
  // authoring rather than the dialog's save.
  expect('synthetic' in textVariable(variables, 'name-variable')).toBe(false);
});

/**
 * The three attribute narrowings this spec asserts through. Narrowed on the
 * variable's own `type` rather than asserted: the codebook union spans nine
 * shapes, three of which carry no `synthetic` key at all, and a cast would
 * silently make an assertion about a variable of the wrong kind.
 */
type CodebookVariables = NonNullable<
  NonNullable<CurrentProtocol['codebook']['node']>[string]['variables']
>;

const wrongKind = (id: string, expected: string, found: unknown): Error =>
  new Error(
    `expected a ${expected} attribute at "${id}", found ${String(found)}`,
  );

function numberVariable(variables: CodebookVariables, id: string) {
  const variable = variables[id];
  if (variable?.type !== 'number') {
    throw wrongKind(id, 'number', variable?.type);
  }
  return variable;
}

function ordinalVariable(variables: CodebookVariables, id: string) {
  const variable = variables[id];
  if (variable?.type !== 'ordinal') {
    throw wrongKind(id, 'ordinal', variable?.type);
  }
  return variable;
}

function textVariable(variables: CodebookVariables, id: string) {
  const variable = variables[id];
  if (variable?.type !== 'text') {
    throw wrongKind(id, 'text', variable?.type);
  }
  return variable;
}

/**
 * A codebook with the three attribute kinds this spec authors against, and no
 * stages at all: the codebook editor needs none, and a stage would drag the
 * parse's own resolved descriptors into a document whose whole subject is
 * which keys a human wrote.
 *
 * Typed directly rather than parsed for the same reason — see the file header.
 * `emptyProtocol()` proves a literal satisfies `CurrentProtocol`; codebook
 * variables carry no schema-supplied `synthetic`, so they survive seeding with
 * the key genuinely absent.
 */
function codebookProtocol(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    codebook: {
      node: {
        [NODE_TYPE]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            'name-variable': {
              name: 'name',
              type: 'text',
              component: 'Text',
            },
            'age-variable': {
              name: 'age',
              type: 'number',
              component: 'Number',
            },
            'contact-variable': {
              name: 'contact',
              type: 'ordinal',
              component: 'RadioGroup',
              options: [
                { label: 'Daily', value: 'daily' },
                { label: 'Weekly', value: 'weekly' },
              ],
            },
          },
        },
      },
    },
  };
}

test('the preview settings toggle is named for synthetic data and round-trips', async ({
  architectPage,
  seed,
}) => {
  await seed(informationProtocol());
  await gotoProtocol(architectPage);
  await architectPage.goto('/protocol/stage/welcome');
  await architectPage
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  const preview = new StagePreview(architectPage);
  // Each call asserts the switch reached the state it asked for, so a rename
  // that broke the locator, or a toggle that stopped persisting, fails here.
  await preview.setUseSyntheticData(false);
  await preview.setUseSyntheticData(true);
  await preview.setUseSyntheticData(false);
});

function informationProtocol(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [
          {
            id: 'welcome-text',
            type: 'text',
            content: 'Thank you for taking part.',
          },
        ],
        synthetic: { generatesData: false, responseBurden: 0 },
      },
    ],
  };
}

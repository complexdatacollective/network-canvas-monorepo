import {
  CurrentProtocolSchema,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

/**
 * A protocol's `synthetic` blocks — the parameters that describe how synthetic
 * interviews are generated from it — are authored by hand today. Architect
 * renders no control for any of them, and it saves a stage by OVERWRITING it
 * with the form's values, so every one of them survives only because something
 * deliberately carries it through.
 *
 * Three separate mechanisms do that, and this walks all three in one pass:
 *
 * - stage level: `withStageIdentity`'s unconditional merge in `StageEditor`;
 * - panel level: the `usePanelAt` read / `writePanelAt` write / hidden-field
 *   registration triple in `NodePanels`;
 * - variable level: `getStateWithUpdatedVariable`'s preservation of every
 *   property outside `replaceProperties` (which is why `synthetic` is not in
 *   `CODEBOOK_PROPERTIES`).
 *
 * A `NameGenerator` is the only stage type that reaches all three at once: it
 * is one of the two interfaces with side panels, and its form drives a
 * codebook variable. Its prompts carry no `synthetic` of their own (only
 * CategoricalBin prompts do), so the variable stands in for the third level.
 *
 * The oracle is the canonical protocol row in IndexedDB (`readProtocolJson`) —
 * the same JSON a download bundles and a reload restores — rather than the
 * DOM, because what is at stake is what the researcher is left with on disk.
 */

const STAGE_ID = 'synthetic-name-generator';
const RENAMED = 'Renamed generator';

// A constant count needs no `behaviours` window to sit inside; the fixture
// declares none, so `requireCountWithinBehaviours` has nothing to contradict.
// `responseBurden` is deliberately not the stage type's default, so a carry
// that silently substituted the schema default would be visible here.
const STAGE_SYNTHETIC = {
  generatesData: true,
  responseBurden: 0.42,
  count: { distribution: 'constant', value: 5 },
};

// Only an existing-network panel may declare one (`panelSchema`'s refusal), so
// the panel below is `dataSource: 'existing'`. Not the schema default (0.3),
// for the same reason the burden above is not.
const PANEL_SYNTHETIC = { nominationProbability: 0.6 };

const VARIABLE_SYNTHETIC = { generator: 'firstName' };

/**
 * Passed through `CurrentProtocolSchema.parse` rather than typed directly as
 * `CurrentProtocol`: the panel's `dataSource` and the form field's `variable`
 * are branded strings that a plain literal is not assignable to, and parsing
 * proves the fixture is schema-real before a single assertion runs.
 */
function syntheticProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    name: 'Synthetic Round Trip E2E',
    schemaVersion: 8,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: {
              name: 'name',
              type: 'text',
              component: 'Text',
              synthetic: VARIABLE_SYNTHETIC,
            },
          },
        },
      },
    },
    stages: [
      {
        id: STAGE_ID,
        type: 'NameGenerator',
        label: 'Name some people',
        subject: { entity: 'node', type: 'person' },
        synthetic: STAGE_SYNTHETIC,
        form: {
          title: 'Add a person',
          fields: [{ variable: 'name', prompt: 'What is their name?' }],
        },
        prompts: [
          { id: 'prompt-1', text: 'Who do you spend the most time with?' },
        ],
        panels: [
          {
            id: 'panel-1',
            title: 'People you named earlier',
            dataSource: 'existing',
            synthetic: PANEL_SYNTHETIC,
          },
        ],
      },
    ],
  });
}

function nameGeneratorStage(protocol: CurrentProtocol) {
  const stage = protocol.stages[0];
  if (stage?.type !== 'NameGenerator') {
    throw new Error(
      `expected a NameGenerator at index 0, found ${String(stage?.type)}`,
    );
  }
  return stage;
}

function personNameVariable(protocol: CurrentProtocol) {
  const variable = protocol.codebook.node?.person?.variables?.name;
  if (variable?.type !== 'text') {
    throw new Error(
      `expected a text variable at node.person.variables.name, found ${String(
        variable?.type,
      )}`,
    );
  }
  return variable;
}

test('a stage save carries every authored synthetic block through untouched', async ({
  architectPage,
  seed,
}) => {
  const seeded = syntheticProtocol();

  // The parse must not have rewritten what the author wrote: every assertion
  // below compares against these literals, so a schema that normalised them
  // would otherwise make the round trip look faithful to the wrong values.
  expect(nameGeneratorStage(seeded).synthetic).toEqual(STAGE_SYNTHETIC);
  expect(nameGeneratorStage(seeded).panels?.[0]?.synthetic).toEqual(
    PANEL_SYNTHETIC,
  );
  expect(personNameVariable(seeded).synthetic).toEqual(VARIABLE_SYNTHETIC);

  await seed(seeded);
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await architectPage.goto(`/protocol/stage/${STAGE_ID}`);
  await architectPage
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  // The one edit. Nothing here touches a panel, a prompt, the form or the
  // codebook — which is the whole point: renaming a stage is the most ordinary
  // thing a researcher does to a protocol they did not author by hand.
  await editor.setStageName(RENAMED);
  await editor.expectNoIssues();
  await editor.save();

  // `until` is required: the row exists from the moment the fixture was
  // seeded, so a bare read is satisfied instantly by the PRE-save JSON.
  const saved = await readProtocolJson(
    architectPage,
    (protocol) => protocol.stages[0]?.label === RENAMED,
  );

  const stage = nameGeneratorStage(saved);
  expect(stage.synthetic).toEqual(STAGE_SYNTHETIC);
  expect(stage.panels).toHaveLength(1);
  expect(stage.panels?.[0]?.synthetic).toEqual(PANEL_SYNTHETIC);
  expect(personNameVariable(saved).synthetic).toEqual(VARIABLE_SYNTHETIC);

  // The panel is otherwise intact too: a carry that reached the saved stage by
  // resurrecting the committed panel wholesale would satisfy the assertions
  // above while quietly discarding edits made in the same session.
  expect(stage.panels?.[0]).toMatchObject({
    id: 'panel-1',
    title: 'People you named earlier',
    dataSource: 'existing',
  });
});

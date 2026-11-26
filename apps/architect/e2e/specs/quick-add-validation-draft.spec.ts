import { withInterfaceText } from '@codaco/interview/supplied-wording';
import {
  testTypeId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
  type Variable,
  createProtocolObjectId,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

/**
 * The validation a Name Generator (quick add) stage puts on its attribute is
 * part of the stage's draft.
 *
 * The report this fences: on an existing quick-add stage, changing the rule in
 * the validation section under "Quick add configuration" did not make
 * "Finished Editing" appear, and after Cancel the change was still there when
 * the stage was opened again — the rule had been written to the codebook as
 * the switch moved. Now the change makes the stage unsaved, Cancel throws it
 * away, and saving writes it.
 *
 * The oracle is the canonical protocol row (`readProtocolJson`).
 */

const ATTRIBUTE = 'name';
const PERSON_TYPE_ID = testTypeId('person');
const NAME_VARIABLE_ID = testVariableId('name');

const quickAddAttribute = (protocol: CurrentProtocol): Variable | undefined =>
  Object.values(protocol.codebook.node?.[PERSON_TYPE_ID]?.variables ?? {}).find(
    (variable) => variable.name === ATTRIBUTE,
  );

// `Variable` is a tagged union and some members carry no `validation`.
const isRequired = (protocol: CurrentProtocol): boolean => {
  const attribute = quickAddAttribute(protocol);
  return (
    attribute !== undefined &&
    'validation' in attribute &&
    attribute.validation?.required === true
  );
};

// A protocol that already holds a quick-add stage, as a researcher would open
// it: the attribute the stage fills in requires an answer (the create row's
// deliberate default). Seeded rather than built through the editor, because
// the report is about an EXISTING stage.
const quickAddProtocol = (): CurrentProtocol => {
  const base = emptyProtocol();
  return {
    ...base,
    codebook: {
      node: {
        [PERSON_TYPE_ID]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [NAME_VARIABLE_ID]: {
              name: ATTRIBUTE,
              type: 'text',
              validation: { required: true },
            },
          },
        },
      },
    },
    stages: [
      {
        id: createProtocolObjectId(),
        type: 'NameGeneratorQuickAdd',
        label: { en: 'Quickly Add Friends' },
        subject: { entity: 'node', types: [PERSON_TYPE_ID] },
        quickAdd: asEntityAttributeReference(NAME_VARIABLE_ID),
        prompts: [
          {
            id: createProtocolObjectId(),
            text: { en: 'Name someone you know' },
          },
        ],
      },
      ...base.stages,
    ],
  };
};

async function reopenStage(page: Parameters<typeof gotoProtocol>[0]) {
  const protocol = await readProtocolJson(page);
  const stageId = protocol.stages[0]?.id;
  expect(stageId).toBeTruthy();
  await page.goto(`/protocol/stage/${stageId}`);
  await page
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

test('a quick-add validation change is an unsaved stage change that Cancel throws away', async ({
  architectPage,
  seed,
}) => {
  await seed(withInterfaceText<CurrentProtocol>(quickAddProtocol()));
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  expect(isRequired(await readProtocolJson(architectPage))).toBe(true);

  await reopenStage(architectPage);

  const finished = architectPage.getByRole('button', {
    name: 'Finished Editing',
  });
  // Opened on the saved stage and not yet touched.
  await expect(finished).toBeHidden();

  const rules = editor
    .section('Quick add configuration')
    .getByRole('region', { name: 'Validation', exact: true });
  const required = rules.getByRole('switch', {
    name: 'Required answer',
    exact: true,
  });
  await expect(required).toBeChecked();
  await required.click();
  await expect(required).not.toBeChecked();

  // The report: this change did not make the stage unsaved.
  await expect(finished).toBeVisible();

  // Cancel asks, and discarding it takes the change back.
  await architectPage.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(
    architectPage.getByRole('heading', {
      name: 'Discard unsaved stage changes?',
    }),
  ).toBeVisible();
  await architectPage
    .getByRole('button', { name: 'Discard Changes and Leave' })
    .click();
  await architectPage.waitForURL(/\/protocol$/);

  // The protocol still requires an answer…
  expect(isRequired(await readProtocolJson(architectPage))).toBe(true);

  // …and so does the stage when it is opened again.
  await reopenStage(architectPage);
  await expect(required).toBeChecked();
  await expect(finished).toBeHidden();

  // Changed again, and saved this time: the protocol holds it.
  await required.click();
  await expect(required).not.toBeChecked();
  await editor.save();

  const after = await readProtocolJson(
    architectPage,
    (protocol) => !isRequired(protocol),
  );
  expect(quickAddAttribute(after)).toBeDefined();
  expect(isRequired(after)).toBe(false);
});

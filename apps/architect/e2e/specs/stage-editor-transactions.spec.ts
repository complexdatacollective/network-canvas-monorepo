import type { CurrentProtocol, Variable } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { addFormField } from '../pageobjects/editor-sections/forms.js';
import { StageEditor } from '../pageobjects/stage-editor.js';
import { Timeline } from '../pageobjects/timeline.js';

/**
 * End-to-end coverage for #1382: a stage editor's nested field and variable
 * editors used to write the shared codebook the moment they were saved, so
 * cancelling a field or discarding a stage left the protocol mutated.
 *
 * The oracle throughout is the canonical protocol row in IndexedDB
 * (`readProtocolJson`) — the same JSON that survives a reload — so these
 * assert what the researcher is actually left with, not just what the DOM
 * shows.
 */

const egoVariables = (protocol: CurrentProtocol): Record<string, Variable> =>
  protocol.codebook.ego?.variables ?? {};

const byName = (
  protocol: CurrentProtocol,
  name: string,
): Variable | undefined =>
  Object.values(egoVariables(protocol)).find(
    (variable) => variable.name === name,
  );

// `Variable` is a tagged union and some members (layout) carry no
// `validation` key at all, so narrow at runtime rather than asserting.
const validationOf = (
  variable: Variable | undefined,
): Record<string, unknown> | undefined =>
  variable && 'validation' in variable ? variable.validation : undefined;

// Builds the shared starting point: one committed EgoForm stage carrying one
// committed codebook variable, which the discard cases then try to corrupt.
async function seedStageWithVariable(
  architectPage: Parameters<typeof readProtocolJson>[0],
): Promise<StageEditor> {
  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');

  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('About You');
  await editor.fillRichText(
    'Introduction text',
    'Thanks for taking part in this study.',
  );

  await addFormField(editor.section('Form'), {
    variableName: 'age',
    promptText: 'How old are you?',
    inputControl: 'Number Input',
  });

  await editor.save();
  return editor;
}

// Re-opens the committed stage. The timeline links to it by id, which the
// seeded protocol only knows after the first save.
async function reopenStage(
  architectPage: Parameters<typeof readProtocolJson>[0],
): Promise<void> {
  const protocol = await readProtocolJson(architectPage);
  const stageId = protocol.stages[0]?.id;
  expect(stageId).toBeTruthy();
  await architectPage.goto(`/protocol/stage/${stageId}`);
  await architectPage
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

async function leaveWithoutSaving(
  architectPage: Parameters<typeof readProtocolJson>[0],
): Promise<void> {
  await architectPage.getByRole('button', { name: 'Cancel' }).first().click();
  // The stage editor's leave prompt names the stage specifically, so it cannot
  // be confused with the nested-editor prompt (`confirmDiscardNestedDraft`,
  // still titled "Unsaved Changes") that can be raised from inside it.
  await expect(
    architectPage.getByRole('heading', {
      name: 'Discard unsaved stage changes?',
    }),
  ).toBeVisible();
  await architectPage
    .getByRole('button', { name: 'Discard Changes and Leave' })
    .click();
  await architectPage.waitForURL(/\/protocol$/);
}

test('discarding stage edits reverts a validation change to a shared variable', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await seedStageWithVariable(architectPage);

  const committed = await readProtocolJson(architectPage);
  expect(validationOf(byName(committed, 'age'))).toBeUndefined();

  await reopenStage(architectPage);

  // Edit the committed field and make its variable Required — a codebook
  // property, shared with every other stage that renders this variable.
  await editor
    .section('Form')
    .getByRole('button', { name: 'Edit field' })
    .click();
  await editor
    .section('Validation')
    .getByRole('switch', { name: 'Validation' })
    .click();
  await editor
    .section('Validation')
    .getByRole('switch', { name: 'Required', exact: true })
    .click();
  await architectPage
    .getByRole('button', { name: 'Save', exact: true })
    .click();

  await leaveWithoutSaving(architectPage);

  const after = await readProtocolJson(architectPage);
  expect(validationOf(byName(after, 'age'))).toBeUndefined();
  expect(after.codebook).toEqual(committed.codebook);
});

test('discarding a stage removes the variable a discarded field created', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await seedStageWithVariable(architectPage);

  const committed = await readProtocolJson(architectPage);
  expect(byName(committed, 'orphanVar')).toBeUndefined();

  await reopenStage(architectPage);

  // Add a second field on a brand-new variable, then remove the field again.
  await addFormField(editor.section('Form'), {
    variableName: 'orphanVar',
    promptText: 'Something we will discard.',
  });

  await editor
    .section('Form')
    .getByRole('button', { name: 'Remove field' })
    .last()
    .click();
  await architectPage
    .getByRole('button', { name: 'Remove field', exact: true })
    .last()
    .click();

  await leaveWithoutSaving(architectPage);

  const after = await readProtocolJson(architectPage);
  expect(byName(after, 'orphanVar')).toBeUndefined();
  expect(after.codebook).toEqual(committed.codebook);
});

test('renaming a variable inline marks the stage dirty and reverts on discard', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await seedStageWithVariable(architectPage);
  const committed = await readProtocolJson(architectPage);

  await reopenStage(architectPage);

  await editor
    .section('Form')
    .getByRole('button', { name: 'Edit field' })
    .click();

  // The inline rename on the variable pill: its own confirm used to write the
  // shared codebook immediately AND leave the stage reading as clean, so
  // Cancel navigated away with no prompt at all.
  await architectPage
    .getByRole('button', { name: 'Edit variable name: age' })
    .dblclick();
  const nameInput = architectPage.getByRole('textbox', {
    name: 'Variable name',
  });
  await nameInput.fill('ageQA');
  await architectPage.getByRole('button', { name: 'Save Changes' }).click();

  // Cancel the FIELD dialog — the rename must not survive it.
  await architectPage
    .getByRole('button', { name: 'Cancel', exact: true })
    .first()
    .click();

  // The stage now reports unsaved changes, which is the signal that used to be
  // missing entirely for this path.
  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toBeVisible();

  await leaveWithoutSaving(architectPage);

  const after = await readProtocolJson(architectPage);
  expect(byName(after, 'age')).toBeDefined();
  expect(byName(after, 'ageQA')).toBeUndefined();
  expect(after.codebook).toEqual(committed.codebook);
});

// The exits that leave a PRISTINE editor run no discard handler at all, so the
// codebook transaction has to be closed by the editor unmounting. Left open, a
// later codebook edit made anywhere else would be routed into a draft nothing
// will ever commit — visible on screen, gone on reload.
//
// Every navigation here is CLIENT-SIDE on purpose: a `page.goto`/`goBack`
// rebuilds the Redux store, which is the only place a leaked transaction
// lives, so a reloading version of this test cannot fail.
test('leaving a pristine editor does not swallow later codebook edits', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  await seedStageWithVariable(architectPage);

  // Entered through the timeline so the editor is a client-side pushState:
  // Back is then a popstate the app handles in place, with no reload — the
  // realistic path, and the only one that leaves the store intact.
  await new Timeline(architectPage).openStage('About You');
  await architectPage.goBack();
  await architectPage.waitForURL(/\/protocol$/);

  // A codebook edit made after leaving must reach the canonical protocol.
  await architectPage
    .getByRole('link', { name: 'Codebook', exact: true })
    .click();
  await architectPage.waitForURL(/\/protocol\/codebook$/);

  await architectPage
    .getByRole('button', { name: 'Edit variable name: age' })
    .first()
    .dblclick();
  await architectPage
    .getByRole('textbox', { name: 'Variable name' })
    .fill('ageAfterLeaving');
  await architectPage.getByRole('button', { name: 'Save Changes' }).click();

  const after = await readProtocolJson(architectPage, (protocol) =>
    Object.values(protocol.codebook.ego?.variables ?? {}).some(
      (variable) => variable.name === 'ageAfterLeaving',
    ),
  );
  expect(byName(after, 'ageAfterLeaving')).toBeDefined();
  expect(byName(after, 'age')).toBeUndefined();
});

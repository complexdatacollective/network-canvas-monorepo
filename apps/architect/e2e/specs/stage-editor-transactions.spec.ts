import type { CurrentProtocol, Variable } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { openValidationSection } from '../pageobjects/editor-sections/form-field-controls.js';
import { addFormField } from '../pageobjects/editor-sections/forms.js';
import { StageEditor } from '../pageobjects/stage-editor.js';
import { Timeline } from '../pageobjects/timeline.js';

/**
 * What a stage edit owns, and what it does not.
 *
 * #1382 made a stage edit transactional over BOTH halves of what its nested
 * editors wrote: the stage, and the shared codebook. `@codaco/protocol-builder`
 * reverses the codebook half. An attribute is not part of the stage that
 * happens to collect it — every other stage collecting the same attribute is
 * looking at the same values, the same rules and the same control — so the
 * codebook editors the field dialog opens each commit on their own submit,
 * under the codebook's own lock, and a cancelled stage edit does not take them
 * back. The stage document itself is unchanged: discarding still reverts every
 * word typed into the stage.
 *
 * That is a change researchers see, so each half is fenced here rather than
 * asserted once: a codebook edit SURVIVES the discard, the stage's own edits
 * do NOT, and a codebook edit alone does not make the stage unsaved.
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

const isRequired = (protocol: CurrentProtocol, name: string): boolean =>
  validationOf(byName(protocol, name))?.required === true;

// `Stage` is a tagged union too, and only the form interfaces carry a `form`.
const formFieldsOf = (
  stage: CurrentProtocol['stages'][number] | undefined,
): readonly unknown[] | undefined =>
  stage !== undefined && 'form' in stage ? stage.form.fields : undefined;

// Builds the shared starting point: one committed EgoForm stage carrying one
// committed codebook attribute, which the cases below then edit from inside a
// stage edit they never save.
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

  await addFormField(editor.section('Form fields'), {
    variableName: 'age',
    promptText: 'How old are you?',
    inputControl: 'Number input',
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

/**
 * Open the committed field's dialog, set its attribute's Required rule through
 * the codebook editor behind it, and close the field dialog WITHOUT saving the
 * row — so the only thing that could have reached the protocol is the codebook
 * write the rules editor made on its own submit.
 */
async function requireAnAnswerFromTheCodebookEditor(
  editor: StageEditor,
  architectPage: Parameters<typeof readProtocolJson>[0],
): Promise<void> {
  await editor
    .section('Form fields')
    .getByRole('button', { name: 'Edit field', exact: true })
    .click();
  const fieldDialog = architectPage.getByRole('dialog', {
    name: 'Edit form field',
    exact: true,
  });
  const rules = await openValidationSection(fieldDialog);
  await rules.getByRole('checkbox', { name: 'Required', exact: true }).check();
  await rules
    .getByRole('button', { name: 'Save validation', exact: true })
    .click();
  // Detached rather than hidden: the editor closes only once the codebook
  // write has been accepted, so this is the write landing, not an animation.
  await rules.waitFor({ state: 'detached' });

  await fieldDialog
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await fieldDialog.waitFor({ state: 'detached' });
}

async function leaveWithoutSaving(
  architectPage: Parameters<typeof readProtocolJson>[0],
): Promise<void> {
  await architectPage.getByRole('button', { name: 'Cancel' }).first().click();
  // The stage editor's leave prompt names the stage specifically, so it cannot
  // be confused with the nested-editor prompt ("Discard your changes?") that
  // can be raised from inside it.
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

test('a rule set on a shared attribute survives discarding the stage that set it', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await seedStageWithVariable(architectPage);

  const committed = await readProtocolJson(architectPage);
  expect(validationOf(byName(committed, 'age'))).toBeUndefined();

  await reopenStage(architectPage);

  // The stage's own document is changed too, so the discard below has
  // something of its own to revert — which is the other half of the rule.
  await editor.setStageName('About You, revised');

  await requireAnAnswerFromTheCodebookEditor(editor, architectPage);

  await leaveWithoutSaving(architectPage);

  const after = await readProtocolJson(architectPage, (protocol) =>
    isRequired(protocol, 'age'),
  );
  // Kept: the rule belongs to the attribute, which every stage collecting it
  // shares.
  expect(validationOf(byName(after, 'age'))).toMatchObject({ required: true });
  // Reverted: the stage's own name is the researcher's unsaved typing.
  expect(after.stages[0]?.label).toBe('About You');
});

test('the attribute a discarded field created is kept in the codebook', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await seedStageWithVariable(architectPage);

  const committed = await readProtocolJson(architectPage);
  expect(byName(committed, 'orphanVar')).toBeUndefined();

  await reopenStage(architectPage);

  // Renamed first, so the stage has an unsaved change of its OWN to discard.
  // Adding a field and removing it again leaves the stage document exactly as
  // it was, and dirtiness is a comparison against the document the editor
  // opened on — so without this there would be nothing to discard and no
  // prompt to answer.
  await editor.setStageName('About You, revised');

  // Add a second field on a brand-new attribute, then remove the field again.
  // The attribute was written when the ROW was saved, so removing the row —
  // and then throwing the whole stage edit away — leaves it standing.
  const section = editor.section('Form fields');
  await addFormField(section, {
    variableName: 'orphanVar',
    promptText: 'Something we will discard.',
  });

  await section
    .getByRole('button', { name: 'Remove field', exact: true })
    .last()
    .click();
  await architectPage
    .getByRole('button', { name: 'Delete field', exact: true })
    .click();

  await leaveWithoutSaving(architectPage);

  const after = await readProtocolJson(architectPage, (protocol) =>
    Object.values(protocol.codebook.ego?.variables ?? {}).some(
      (variable) => variable.name === 'orphanVar',
    ),
  );
  expect(byName(after, 'orphanVar')).toBeDefined();
  // The STAGE went back to what it was: its committed name, and the one
  // question it was committed asking.
  expect(after.stages[0]?.label).toBe('About You');
  expect(formFieldsOf(after.stages[0])).toHaveLength(1);
});

test('a codebook edit alone does not make a stage unsaved', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await seedStageWithVariable(architectPage);
  await reopenStage(architectPage);

  await requireAnAnswerFromTheCodebookEditor(editor, architectPage);

  // Nothing about the STAGE has changed, so there is nothing to save: the
  // save control is not offered at all…
  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toBeHidden();

  // …and leaving asks nothing, because nothing would be lost by leaving.
  await architectPage.getByRole('button', { name: 'Cancel' }).first().click();
  await architectPage.waitForURL(/\/protocol$/);

  const after = await readProtocolJson(architectPage, (protocol) =>
    isRequired(protocol, 'age'),
  );
  expect(validationOf(byName(after, 'age'))).toMatchObject({ required: true });
});

// A codebook edit made anywhere else, after a stage editor has been and gone,
// must reach the canonical protocol. It is the fence #1382's draft codebook
// left standing: a transaction the editor opened and did not close swallowed
// every later codebook write into a draft nothing would ever commit — visible
// on screen, gone on reload.
//
// Every navigation here is CLIENT-SIDE on purpose: a `page.goto`/`goBack`
// rebuilds the Redux store, which is the only place such a draft could live,
// so a reloading version of this test cannot fail.
test('leaving a stage editor does not swallow later codebook edits', async ({
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
    .getByRole('button', { name: 'Edit attribute name: age' })
    .first()
    .dblclick();
  await architectPage
    .getByRole('textbox', { name: 'Attribute name' })
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

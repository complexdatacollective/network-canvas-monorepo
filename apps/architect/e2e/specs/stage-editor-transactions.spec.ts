import type { CurrentProtocol, Variable } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { openValidationSection } from '../pageobjects/editor-sections/form-field-controls.js';
import { addFormField } from '../pageobjects/editor-sections/forms.js';
import { StageEditor } from '../pageobjects/stage-editor.js';
import { Timeline } from '../pageobjects/timeline.js';

/**
 * What a stage edit owns.
 *
 * #1382 made a stage edit transactional over BOTH halves of what its nested
 * editors wrote: the stage, and the shared codebook. `@codaco/protocol-builder`
 * reversed the codebook half, committing each codebook editor on its own
 * submit so a cancelled stage edit kept it; that is reversed again here, which
 * restores what #1382 intended. Every codebook change made inside a stage
 * editor — a validation rule, a new attribute or type, options, an input
 * control, a rename, an encrypted flag, a pedigree symbol — is part of the
 * stage's draft:
 *
 * - it makes the stage unsaved (the save control is offered, Cancel asks);
 * - saving the stage writes it with the stage;
 * - cancelling or discarding the stage throws it away with the rest.
 *
 * A dialog opened inside the stage editor (the "Edit form field" row dialog)
 * holds its own layer on top: its codebook changes join the stage draft when
 * that dialog is saved, and are dropped when it is cancelled.
 *
 * Each clause is fenced here rather than asserted once. The oracle throughout
 * is the canonical protocol row in IndexedDB (`readProtocolJson`) — the same
 * JSON that survives a reload — so these assert what the researcher is
 * actually left with, not just what the DOM shows.
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
  stage !== undefined && 'form' in stage ? stage.form?.fields : undefined;

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

  await addFormField(editor.section('Form configuration'), {
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

/**
 * Open the committed field's dialog, set its attribute's Required rule in the
 * nested Validation section, and close the field dialog — saved or cancelled.
 *
 * The section has no submit of its own: the rule belongs to the dialog's layer
 * of the stage draft, which the dialog's Save joins to the stage and its Cancel
 * drops.
 */
async function requireAnAnswerFromTheCodebookEditor(
  editor: StageEditor,
  architectPage: Parameters<typeof readProtocolJson>[0],
  closeWith: 'Save' | 'Cancel',
): Promise<void> {
  await editor
    .section('Form configuration')
    .getByRole('button', { name: 'Edit field', exact: true })
    .click();
  const fieldDialog = architectPage.getByRole('dialog', {
    name: 'Edit form field',
    exact: true,
  });
  const rules = await openValidationSection(fieldDialog);
  const required = rules.getByRole('switch', {
    name: 'Required answer',
    exact: true,
  });
  await required.click();
  // The switch holding it is what says the gesture was taken.
  await expect(required).toBeChecked();

  await fieldDialog
    .getByRole('button', { name: closeWith, exact: true })
    .click();
  if (closeWith === 'Cancel') {
    // The rule is a change the dialog holds, so cancelling it asks first.
    await architectPage
      .getByRole('dialog', { name: 'Discard your changes?' })
      .getByRole('button', { name: 'Discard changes', exact: true })
      .click();
  }
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

test('a rule set in a saved field dialog is dropped when the stage is discarded', async ({
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
  // something of its own to revert alongside the rule.
  await editor.setStageName('About You, revised');

  await requireAnAnswerFromTheCodebookEditor(editor, architectPage, 'Save');

  // The dialog was saved, so the rule is part of the stage's draft: the stage
  // is offered for saving. Without this the discard below could pass on a
  // stage the editor thought was untouched.
  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toBeVisible();

  await leaveWithoutSaving(architectPage);

  const after = await readProtocolJson(architectPage);
  // Dropped: the rule went with the discarded stage…
  expect(validationOf(byName(after, 'age'))).toBeUndefined();
  // …and so did the stage's own name.
  expect(after.stages[0]?.label).toEqual({ en: 'About You' });
});

test('a rule set in a saved field dialog is written when the stage is saved', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await seedStageWithVariable(architectPage);
  await reopenStage(architectPage);

  await requireAnAnswerFromTheCodebookEditor(editor, architectPage, 'Save');

  // Not in the protocol yet: it is in the draft until the stage is saved.
  expect(
    validationOf(byName(await readProtocolJson(architectPage), 'age')),
  ).toBeUndefined();

  await editor.save();

  const after = await readProtocolJson(architectPage, (protocol) =>
    isRequired(protocol, 'age'),
  );
  expect(validationOf(byName(after, 'age'))).toMatchObject({ required: true });
});

test('a rule set in a cancelled field dialog leaves nothing unsaved', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await seedStageWithVariable(architectPage);
  await reopenStage(architectPage);

  await requireAnAnswerFromTheCodebookEditor(editor, architectPage, 'Cancel');

  // The dialog's layer was dropped, so there is nothing to save: the save
  // control is not offered at all…
  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toBeHidden();

  // …and leaving asks nothing, because nothing would be lost by leaving.
  await architectPage.getByRole('button', { name: 'Cancel' }).first().click();
  await architectPage.waitForURL(/\/protocol$/);
  await expect(
    architectPage.getByRole('dialog', {
      name: 'Discard unsaved stage changes?',
    }),
  ).toHaveCount(0);

  // Read after the stage editor has gone, so a write the cancelled dialog made
  // would have had every chance to land.
  const after = await readProtocolJson(architectPage);
  expect(validationOf(byName(after, 'age'))).toBeUndefined();
});

test('a codebook edit alone makes a stage unsaved', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await seedStageWithVariable(architectPage);
  await reopenStage(architectPage);

  // Opened on the saved stage and not yet touched.
  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toBeHidden();

  await requireAnAnswerFromTheCodebookEditor(editor, architectPage, 'Save');

  // Nothing about the stage DOCUMENT has changed, yet the rule is part of what
  // saving the stage would write, so the save control is offered…
  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toBeVisible();

  // …and leaving asks before it throws the rule away.
  await leaveWithoutSaving(architectPage);

  const after = await readProtocolJson(architectPage);
  expect(validationOf(byName(after, 'age'))).toBeUndefined();
});

test('the attribute a discarded field created is not kept in the codebook', async ({
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
  // prompt to answer, whatever the attribute the field created is doing.
  await editor.setStageName('About You, revised');

  // Add a second field on a brand-new attribute, then remove the field again.
  // The attribute belongs to the stage's draft, so removing the row and then
  // throwing the whole stage edit away leaves it out of the codebook.
  const section = editor.section('Form configuration');
  await addFormField(section, {
    variableName: 'orphanVar',
    promptText: 'Something we will discard.',
  });

  await section
    .getByRole('button', { name: 'Delete field', exact: true })
    .last()
    .click();
  // The row's own control and the confirmation's both read "Delete field", so
  // the confirm is reached through the dialog rather than by name alone.
  await architectPage
    .getByRole('dialog', { name: 'Delete this field?' })
    .getByRole('button', { name: 'Delete field', exact: true })
    .click();

  await leaveWithoutSaving(architectPage);

  const after = await readProtocolJson(architectPage);
  expect(byName(after, 'orphanVar')).toBeUndefined();
  // The attribute the stage was committed with is still there, and the STAGE
  // went back to what it was: its committed name, and the one question it was
  // committed asking.
  expect(byName(after, 'age')).toBeDefined();
  expect(after.stages[0]?.label).toEqual({ en: 'About You' });
  expect(formFieldsOf(after.stages[0])).toHaveLength(1);
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

/**
 * The other half of the rule above: a change to the STAGE, made in a stage
 * the researcher re-opened, is unsaved work — and the editor has to say so.
 *
 * Re-opened rather than built in one visit, which is the whole of why this
 * escaped the rest of the suite: every other case here writes a stage from
 * scratch, where the document differs from the template before the first
 * field is added. A saved stage opened again starts out agreeing with the
 * protocol, so the only thing that can make the save control appear is the
 * editor's reading of what the researcher has since written into it — and a
 * reading that missed the form left "Finished Editing" off the toolbar, with
 * Cancel and the tab-close guard both saying there was nothing to lose.
 */
test('a field added to a re-opened stage is unsaved work the editor offers to save', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await seedStageWithVariable(architectPage);
  const committed = await readProtocolJson(architectPage);
  expect(formFieldsOf(committed.stages[0])).toHaveLength(1);

  await reopenStage(architectPage);

  // Opened on the saved stage and not yet touched: there is nothing to save.
  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toBeHidden();

  await addFormField(editor.section('Form configuration'), {
    variableName: 'favouriteColour',
    promptText: 'What is your favourite colour?',
  });

  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toBeVisible();

  await editor.save();

  // Reloaded, so what is asserted is what the researcher would come back to
  // rather than what the open session is holding.
  await architectPage.reload();
  await architectPage
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  const after = await readProtocolJson(
    architectPage,
    (protocol) => formFieldsOf(protocol.stages[0])?.length === 2,
  );
  expect(formFieldsOf(after.stages[0])).toHaveLength(2);
  expect(byName(after, 'favouriteColour')).toBeDefined();
});

/**
 * A new stage arrives named by the editor. That name is a suggestion, not the
 * researcher's work: clicking into it and typing replaces it rather than
 * landing in the middle of it, and leaving a new stage nobody has touched
 * loses nothing, so Cancel asks nothing.
 */
test('typing into a new stage’s proposed name replaces it', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  await new StageEditor(architectPage).createNew('EgoForm');
  const name = architectPage.getByRole('textbox', { name: 'Stage name' });
  await expect(name).toHaveValue('Ego Form');

  // Clicked part-way along, where a caret would otherwise land.
  const box = await name.boundingBox();
  if (box === null) throw new Error('the stage name has no box');
  await architectPage.mouse.click(box.x + 40, box.y + box.height / 2);
  await architectPage.keyboard.type('About You');
  await expect(name).toHaveValue('About You');

  // A name of the researcher's own is edited where they click, as ever:
  // clicked past its last letter, typing adds to the end. (Clicked rather than
  // sent End, which moves no caret in a macOS text box.)
  await architectPage.mouse.click(
    box.x + box.width - 4,
    box.y + box.height / 2,
  );
  await architectPage.keyboard.type('rself');
  await expect(name).toHaveValue('About Yourself');
});

test('cancelling a new stage nobody has touched leaves without asking', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const before = (await readProtocolJson(architectPage)).stages.length;
  await new StageEditor(architectPage).createNew('EgoForm');
  const name = architectPage.getByRole('textbox', { name: 'Stage name' });
  await expect(name).toHaveValue('Ego Form');
  // Saving is what adds a new stage, so it is offered before anything changes.
  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toBeVisible();

  await architectPage.getByRole('button', { name: 'Cancel' }).first().click();
  await architectPage.waitForURL(/\/protocol$/);
  await expect(
    architectPage.getByRole('dialog', {
      name: 'Discard unsaved stage changes?',
    }),
  ).toHaveCount(0);
  expect((await readProtocolJson(architectPage)).stages).toHaveLength(before);

  // A name the researcher typed is theirs, and leaving it is confirmed.
  await new StageEditor(architectPage).createNew('EgoForm');
  await expect(name).toHaveValue('Ego Form');
  await name.fill('About You');
  await leaveWithoutSaving(architectPage);
});

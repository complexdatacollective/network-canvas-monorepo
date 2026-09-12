import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addFormField } from '../../pageobjects/editor-sections/forms.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid AlterForm stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('AlterForm');
  await editor.setStageName('About Each Person');

  // AlterForm's subject is a node type (`@codaco/protocol-builder`'s
  // `subjectPicker({ entity: 'node', filter: true })`, the "Node type"
  // section), and the "Form fields" section stays disabled until one is
  // chosen: `FormFieldsSection` reads the subject through `useStageSubject`
  // and, with no type to collect into, renders itself disabled — its add
  // button is present but not clickable, and its description reads "Choose
  // what this stage works with before writing its form." So this runs first.
  await selectOrCreateNodeType(architectPage, 'person');

  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('About Each Person');
  // See ego-form.spec.ts: "Introduction text" is the label
  // `IntroductionSection` gives the field, not the field's own name.
  await editor.fillRichText(
    'Introduction text',
    'Tell us a bit about each person you know.',
  );

  await addFormField(editor.section('Form configuration'), {
    variableName: 'age',
    promptText: 'What is your name?',
    inputControl: 'Text input',
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('AlterForm');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'alter-form-stage.json',
  );
});

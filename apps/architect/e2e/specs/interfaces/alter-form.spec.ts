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

  // AlterForm's subject is a node type (sections/NodeType.tsx's
  // `FilteredNodeType`, `Section title="Node Type"`), and Form.tsx's
  // `withDisabledSubjectRequired` disables the Form section
  // (`disabled: true` whenever `interfaceType !== 'EgoForm' && !type`) until
  // `subject.type` is set — Section.tsx doesn't even render `children` while
  // `disabled`, so the "Create new" button genuinely isn't in the DOM until
  // this runs first.
  await selectOrCreateNodeType(architectPage, 'person');

  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('About Each Person');
  // See ego-form.spec.ts: the accessible name is the literal string
  // IntroductionPanel.tsx passes as `label`, "Introduction text" — not the
  // field's redux-form name.
  await editor.fillRichText(
    'Introduction text',
    'Tell us a bit about each person you know.',
  );

  await addFormField(editor.section('Form'), {
    variableName: 'age',
    promptText: 'What is your name?',
    inputControl: 'Text Input',
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('AlterForm');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'alter-form-stage.json',
  );
});

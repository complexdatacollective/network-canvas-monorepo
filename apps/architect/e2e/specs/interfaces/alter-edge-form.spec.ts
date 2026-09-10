import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateEdgeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addFormField } from '../../pageobjects/editor-sections/forms.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid AlterEdgeForm stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('AlterEdgeForm');
  await editor.setStageName('About Each Relationship');

  // AlterEdgeForm's subject is an edge type
  // (`subjectPicker({ entity: 'edge', filter: true })`, the "Edge type"
  // section), and the "Form fields" section stays disabled until one is
  // chosen — same reasoning as alter-form.spec.ts.
  await selectOrCreateEdgeType(architectPage, 'knows');

  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('About Each Relationship');
  // See ego-form.spec.ts: "Introduction text" is the label
  // `IntroductionSection` gives the field, not the field's own name.
  await editor.fillRichText(
    'Introduction text',
    'Tell us a bit about how these two people know each other.',
  );

  await addFormField(editor.section('Form fields'), {
    variableName: 'age',
    promptText: 'What is your name?',
    inputControl: 'Text input',
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('AlterEdgeForm');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'alter-edge-form-stage.json',
  );
});

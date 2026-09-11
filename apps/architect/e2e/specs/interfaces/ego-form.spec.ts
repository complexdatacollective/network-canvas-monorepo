import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { addFormField } from '../../pageobjects/editor-sections/forms.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid EgoForm stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');

  // `introductionPanel.title` keeps its path in
  // `@codaco/protocol-builder`'s `IntroductionSection`, so the
  // `data-field-name` seam still resolves it. Located that way rather than by
  // accessible name because the name is the researcher-facing label
  // ("Introduction heading"), which is copy, while the path is the document.
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('About You');

  // The rich text control's accessible name is the literal label
  // `IntroductionSection` passes, "Introduction text" — not the field's path
  // `introductionPanel.text`.
  await editor.fillRichText(
    'Introduction text',
    'Thanks for taking part in this study.',
  );

  // An ego form is the one form interface with no subject section: it always
  // collects against the interview's ego, so `egoFormStageEditor` composes
  // `formFields({ subject: 'ego' })` with no `subjectPicker` at all. There is
  // nothing to choose first, and the section is available from the moment the
  // editor opens — unlike AlterForm/AlterEdgeForm.
  await addFormField(editor.section('Form fields'), {
    variableName: 'age',
    promptText: 'What is your name?',
    inputControl: 'Text input',
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('EgoForm');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot('ego-form-stage.json');
});

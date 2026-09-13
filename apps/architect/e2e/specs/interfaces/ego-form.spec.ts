import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import {
  addFormField,
  fieldPreview,
  fieldSettings,
  inventAttributeInFieldDialog,
  openFormFieldDialog,
} from '../../pageobjects/editor-sections/forms.js';
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
  // ("Title"), which is copy, while the path is the document.
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
  await addFormField(editor.section('Form configuration'), {
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

/**
 * Editing a form field is a two-pane dialog: the settings on the left, and on
 * the right the question as the participant will meet it.
 *
 * The preview is interactive — a trial answer runs the attribute's own rules —
 * so the thing worth proving end to end is that answering it changes nothing
 * about the protocol. Where the two panes SIT is a Storybook play
 * (`FieldPreviewPane.stories.tsx`); what the preview renders from a draft is a
 * unit suite; this is the whole journey through the real app.
 */
test('previews a form field, and keeps the trial answer out of the protocol', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');
  // An ego form's introduction is required, so the stage cannot be saved
  // without it — and saving is how this test reads the protocol back.
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('About You');
  await editor.fillRichText(
    'Introduction text',
    'Thanks for taking part in this study.',
  );

  const dialog = await openFormFieldDialog(
    editor.section('Form configuration'),
  );
  await inventAttributeInFieldDialog(dialog, {
    variableName: 'nickname',
    inputControl: 'Text input',
  });
  const question = 'What do your friends call you?';
  const prompt = fieldSettings(dialog).getByRole('textbox', {
    name: 'Question text',
  });
  await prompt.click();
  await prompt.fill(question);

  // The question the researcher is typing names the box the participant would
  // answer it in — which is the whole claim the preview makes.
  const preview = fieldPreview(dialog);
  const answer = preview.getByRole('textbox', { name: question, exact: true });
  await expect(answer).toBeVisible();

  await answer.fill('Robin');
  await preview
    .getByRole('button', { name: 'Check response', exact: true })
    .click();
  // The preview's submit is the preview's own: it neither saves the row nor
  // closes the dialog, and the trial answer stays where it was typed.
  await expect(dialog).toBeVisible();
  await expect(answer).toHaveValue('Robin');

  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('EgoForm');
  const fields = stage.type === 'EgoForm' ? stage.form.fields : [];
  expect(fields[0]).toMatchObject({ prompt: question });
  // Nothing of the trial answer anywhere in the stage, not merely absent from
  // the key the preview happens to use.
  expect(JSON.stringify(stage)).not.toContain('Robin');
  expect(JSON.stringify(stage)).not.toContain('preview-value');
});

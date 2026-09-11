import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addFormField } from '../../pageobjects/editor-sections/forms.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid NameGenerator stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('NameGenerator');
  await editor.setStageName('Friends');

  // NameGenerator's subject is a node type, taken by the shared subject picker
  // (`@codaco/protocol-builder`'s `sections/subject-picker`, "Node type").
  // Every section below it is disabled until the stage has a subject — the
  // form describes the people the prompts ask for — so this runs first.
  await selectOrCreateNodeType(architectPage, 'person');

  // The shared form section (`sections/form-fields/FormFieldsSection.tsx`,
  // "Form fields") renders the form's own title only when the interface asks
  // for one: `nameGeneratorFormFields` passes `hasTitle`, which the three form
  // stages do not. It is an ordinary field at `form.title`, so the
  // `data-field-name` seam reaches it directly.
  await editor.field('form.title').getByRole('textbox').fill('Add a person');

  await addFormField(editor.section('Form fields'), {
    variableName: 'age',
    promptText: 'What is your name?',
    inputControl: 'Text input',
  });

  // The `prompts` list (`sections/name-generator-prompts/`) is a second
  // list-in-a-dialog rendered alongside the form's own, hence addPrompt's
  // field-scoped open click (see prompts.ts). Inside the dialog the prompt's
  // RichText field is labelled "Prompt text" (`NameGeneratorPromptsSection`'s
  // `textLabel`), which is what its accessible name resolves to.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Name someone you know');
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('NameGenerator');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'name-generator-stage.json',
  );
});

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

  // NameGenerator's subject is a node type (sections/NodeType.tsx — the
  // PLAIN `NodeType`, not `FilteredNodeType`; NameGenerator's registry entry
  // (StageEditor/Interfaces.tsx) uses `NodeType` directly, `Section
  // title="Node Type"`). Form.tsx's `withDisabledSubjectRequired` disables
  // the Form section until `subject.type` is set — same reasoning as
  // alter-form.spec.ts.
  await selectOrCreateNodeType(architectPage, 'person');

  // Form.tsx's `form.title` field only renders when `disableFormTitle` is
  // false (withDisabledFormTitle.tsx sets it true ONLY for EgoForm/
  // AlterForm/AlterEdgeForm — NameGenerator keeps it), rendered through
  // FrescoReduxField so the `data-field-name="form.title"` seam (Task 2)
  // applies directly, matching Title.tsx's pattern in information.spec.ts
  // rather than the brief's `getByLabel` guess.
  await editor.field('form.title').getByRole('textbox').fill('Add a person');

  await addFormField(editor.section('Form'), {
    variableName: 'age',
    promptText: 'What is your name?',
    inputControl: 'Text Input',
  });

  // NameGeneratorPrompts.tsx, `Section title="Prompts"` — a SECOND
  // DialogArrayField rendered alongside Form's own field array (both share
  // the default "Create new" label), hence addPrompt's section-scoped open
  // click (see prompts.ts's own comment). Inside the opened dialog,
  // PromptFields.tsx renders PromptText.tsx's RichText field (name `text`)
  // with an explicit `label="Prompt text"` that wins over the name fallback
  // (same rule ego-form.spec.ts / alter-form.spec.ts already documented for
  // IntroductionPanel) — NOT the brief's guessed accessible name `'text'`.
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Name someone you know');
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('NameGenerator');
  expect(stageSnapshotJson(stage)).toMatchSnapshot('name-generator-stage.json');
});

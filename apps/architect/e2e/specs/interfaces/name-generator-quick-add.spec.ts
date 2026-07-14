import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { createVariableViaSpotlight } from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid NameGeneratorQuickAdd stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('NameGeneratorQuickAdd');
  await editor.setStageName('Quickly Add Friends');

  // Same NodeType.tsx section as NameGenerator (`Section title="Node
  // Type"`); QuickAdd.tsx's own `withDisabledSubjectRequired` gates its
  // section until `subject.type` is set.
  await selectOrCreateNodeType(architectPage, 'person');

  // QuickAdd.tsx, `Section title="Quick Add Variable"` — a single
  // VariablePicker field (`quickAdd`) with no `value` yet, so its button
  // reads the picker's default "Select variable" (variables.ts's own
  // default), driven the same spotlight flow as addFormField's variable
  // step.
  await createVariableViaSpotlight(architectPage, { variableName: 'name' });

  // NameGeneratorQuickAdd reuses the same NameGeneratorPrompts.tsx section
  // (`Section title="Prompts"`) as NameGenerator — see name-generator.spec.ts
  // for why the RichText field's accessible name is "Prompt text", not the
  // brief's guessed `'text'`.
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Name someone you know');
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('NameGeneratorQuickAdd');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'name-generator-quick-add-stage.json',
  );
});

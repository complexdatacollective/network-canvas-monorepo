import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { selectOrCreateQuickAddVariable } from '../../pageobjects/editor-sections/quick-add.js';
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

  // Same shared subject picker as NameGenerator ("Node type"); the quick-add
  // section below is disabled until the stage has one, because the attribute
  // it fills in is one of that type's own.
  await selectOrCreateNodeType(architectPage, 'person');

  // The "Quick add" section holds one field, `quickAdd`. A fresh protocol's
  // node type has no text attribute for it to fill in, so the picker offers
  // only its inline create — see quick-add.ts for what that writes. The
  // attribute it creates is born requiring an answer, and the nested
  // "Validation" section beneath the picker is where that rule is seen and
  // taken off again: switching the section off writes the cleared rules
  // straight to the codebook, outside this stage's draft.
  await selectOrCreateQuickAddVariable(editor, 'name', {
    clearRequiredValidation: true,
  });

  // NameGeneratorQuickAdd reuses the same shared `prompts` list as
  // NameGenerator — see name-generator.spec.ts for why the RichText field's
  // accessible name is "Prompt text".
  await addPrompt(editor.field('prompts'), async () => {
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

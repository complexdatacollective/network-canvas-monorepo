import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid Anonymisation stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  // `editor.createNew` navigates straight to
  // `/protocol/stage/new?type=Anonymisation&...`, bypassing the New Stage
  // picker; that the picker offers this interface is covered by
  // NewStageScreen.test.tsx.
  await editor.createNew('Anonymisation');
  await editor.setStageName('Anonymise Your Data');

  // Anonymisation's sections are `[stageHeading, taskExplanation,
  // passphraseRules, encryptedAttributes, skipLogic, interviewerGuidance]`
  // (`@codaco/protocol-builder`'s `editors/anonymisation/
  // AnonymisationStageEditor.ts`) — no subject section and no `prompts` array,
  // unlike every other interface this suite covers so far. Skip logic stays
  // switched off here (a capability, off by default), so it registers nothing
  // and the saved stage is unchanged.
  //
  // The explanation is one RichText field (`explanationText`,
  // TaskExplanationSection.tsx) whose first line is usually a heading: what
  // released Architect kept as a separate title. `RichTextField` passes its
  // `label` down to the Tiptap editor's accessible name, so the name is the
  // field's own wording rather than its path. The heading is made the way a
  // researcher makes one, with the toolbar's "Heading 1" before typing.
  const explanationField = editor.field('explanationText');
  const explanation = explanationField.getByRole('textbox', {
    name: 'Explanation',
    exact: true,
  });
  await expect(explanation).toBeEditable();
  await explanation.click();
  await explanationField.getByRole('button', { name: 'Heading 1' }).click();
  await architectPage.keyboard.type('Protecting Your Privacy');
  await architectPage.keyboard.press('Enter');
  await architectPage.keyboard.type(
    'Enter your passphrase below, then continue.',
  );

  // The passphrase rules (a capability, switched off by default) and the
  // encrypted attributes (per-type checkbox groups, and this protocol has no
  // types yet) are both left untouched — everything they cover is optional per
  // `anonymisationStage`'s zod schema.

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  if (stage.type !== 'Anonymisation') {
    throw new Error(`expected Anonymisation stage, got ${stage.type}`);
  }
  expect(stage).not.toHaveProperty('subject');
  expect(stage).not.toHaveProperty('prompts');

  // The editor saves each text under the protocol's default language, which
  // is `en` in `emptyProtocol()`.
  expect(stage.explanationText).toEqual({
    en: '# Protecting Your Privacy\n\nEnter your passphrase below, then continue.',
  });

  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'anonymisation-stage.json',
  );
});

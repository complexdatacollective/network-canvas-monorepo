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
  // picker screen's experiment gate that hides this interface from
  // discovery — the interface itself is fully functional once reached.
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
  // Both halves of the explanation keep their schema paths
  // (`explanationText.title` / `explanationText.body`, TaskExplanationSection.tsx)
  // while the CONTROLS carry released Architect's own names, "Title" and
  // "Body". They are reached through the `data-field-name` seam because names
  // that generic belong to more than one control on a stage editor.
  await editor
    .field('explanationText.title')
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Protecting Your Privacy');

  // The explanation body is a RichText field. `RichTextField` passes its
  // `label` down to the Tiptap editor's accessible name, so the name is the
  // field's own wording rather than its path.
  const explanation = editor
    .field('explanationText.body')
    .getByRole('textbox', { name: 'Body', exact: true });
  await expect(explanation).toBeEditable();
  await explanation.fill('Enter your passphrase below, then continue.');

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

  const { explanationText } = stage;
  if (
    typeof explanationText !== 'object' ||
    explanationText === null ||
    !('title' in explanationText) ||
    !('body' in explanationText)
  ) {
    throw new Error(
      `saved Anonymisation stage is missing "explanationText": ${JSON.stringify(stage)}`,
    );
  }
  expect(explanationText.title).toContain('Protecting Your Privacy');
  expect(explanationText.body).toContain(
    'Enter your passphrase below, then continue.',
  );

  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'anonymisation-stage.json',
  );
});

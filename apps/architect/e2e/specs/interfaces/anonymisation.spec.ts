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

  // Anonymisation's sections are `[AnonymisationExplanation,
  // AnonymisationValidation, EncryptedVariables, InterviewScript]`
  // (StageEditor/Interfaces.tsx) — no `FilteredNodeType`/`NodeType` subject
  // section and no `prompts` array, unlike every other interface this suite
  // covers so far.
  //
  // AnonymisationExplanation.tsx's "Title" field is a plain
  // `FrescoReduxField`/`InputField` (`ValidatedField label="Title"
  // name="explanationText.title"`), so it's a real accessible-name match
  // rather than the `data-field-name` seam.
  await architectPage.getByLabel('Title').fill('Protecting Your Privacy');

  // The "Body" field is a `RichText` field (`ValidatedField label="Body"
  // name="explanationText.body" component={RichText}`) — `fillRichText`
  // resolves by the field's `label` prop text, NOT its redux-form `name`
  // (confirmed against `RichTextField.tsx`, which passes `label={label ??
  // input.name ?? ''}` down to the Tiptap editor's `aria-label`/
  // `aria-labelledby`), so the accessible name is `'Body'`, not
  // `'explanationText.body'`.
  await editor.fillRichText(
    'Body',
    'Enter your passphrase below, then continue.',
  );

  // `AnonymisationValidation` (toggleable, collapsed by default) and
  // `EncryptedVariables` (per-node-type checkbox groups, and this protocol
  // has no node types yet) are both left untouched — everything they cover
  // is optional per `anonymisationStage`'s zod schema.

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

  expect(stageSnapshotJson(stage)).toMatchSnapshot('anonymisation-stage.json');
});

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid Information stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Information');
  await editor.setStageName('About This Study');

  // Title.tsx's Page Heading field: `data-field-name="title"` wraps a plain
  // `<input>` (fresco-ui InputField), UI-required even though the schema
  // marks `title` optional (Title.tsx's `validation={{ required: true }}`).
  await editor.field('title').getByRole('textbox').fill('Welcome');

  // ContentGrid.tsx's Section stamps `data-name="Items"` (its `title` prop),
  // NOT "ContentGrid" — confirmed against the component source rather than
  // guessed from the interface name. Scope "Create new" to that section so a
  // same-named button elsewhere (there is none today, but future sections
  // might add one) can't cause a strict-mode ambiguity.
  await editor
    .section('Items')
    .getByRole('button', { name: 'Create new', exact: true })
    .click();

  // The item dialog is a top-level Dialog (not nested under the Items
  // section's DOM), so its controls are queried on the page directly —
  // matching timeline.spec.ts's already-verified "insert stage" flow.
  await architectPage.getByRole('radio', { name: 'Text' }).click();
  await editor.fillRichText('Content', 'Thanks for taking part.');
  // `exact` avoids matching the RichTextEditor toolbar's "Add link" button
  // (timeline.spec.ts hit this same ambiguity).
  await architectPage.getByRole('button', { name: 'Add', exact: true }).click();

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Information');
  // `stageSnapshotJson` (helpers/normalize-stage.ts) normalizes generated ids
  // AND serializes to the exact string `toMatchSnapshot`'s file-snapshot mode
  // needs — see that function's comment for why a bare `normalizeStage(...)`
  // object or a plain `JSON.stringify` (no trailing newline) both break here.
  // This is the pattern every other interface spec should copy.
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'information-stage.json',
  );
});

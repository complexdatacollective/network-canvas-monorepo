import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid DyadCensus stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('DyadCensus');
  await editor.setStageName('Do They Know Each Other?');

  // DyadCensus's subject is a node type (@codaco/protocol-builder's
  // `subjectPicker({ entity: 'node', filter: true })`). The shared prompts
  // section refuses to open its list until `subject.type` is set — its own
  // `requiresSubject` default.
  await selectOrCreateNodeType(architectPage, 'person');

  // The shared `introduction()` section AlterForm/EgoForm already exercise —
  // same `introductionPanel.title` data-field-name seam and "Introduction
  // text" RichText label.
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('Do They Know Each Other?');
  await editor.fillRichText(
    'Introduction text',
    'We would like to ask you about the people you know.',
  );

  // The shared prompts section's row dialog, filled with what a Dyad Census
  // prompt is made of (DyadCensusPromptsSection.tsx): the family's
  // `PromptTextField` (`label: 'Prompt text'`), and a `CreateEdgeField` —
  // "Affirmative answer", holding a "Connection created" picker over the
  // codebook's edge types and a "Create a new connection type" button that
  // opens the codebook entity editor. That editor's only field a researcher
  // must supply is "Edge type name" (its colour is seeded from
  // `NEW_ENTITY_DRAFT.edge`), and it commits with "Save entity".
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Do they know each other?');
    // Scoped to the entity editor's own dialog: the prompt dialog behind it is
    // still mounted, and the stage behind that.
    const edgeTypeEditor = architectPage.getByRole('dialog', {
      name: 'Create a new connection type',
      exact: true,
    });
    await architectPage
      .getByRole('button', {
        name: 'Create a new connection type',
        exact: true,
      })
      .click();
    await edgeTypeEditor
      .getByRole('textbox', { name: 'Edge type name', exact: true })
      .fill('knows');
    await edgeTypeEditor
      .getByRole('button', { name: 'Save entity', exact: true })
      .click();
    // The dialog holds itself open until the codebook write lands, renaming
    // its submit while the request is in flight — so the DIALOG going is the
    // signal that the edge type exists and has been bound to this prompt, not
    // the button. Waiting matters for the reason prompts.ts gives: the prompt
    // dialog behind this one must not be driven through a modal still on
    // screen.
    await edgeTypeEditor.waitFor({ state: 'hidden' });
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('DyadCensus');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'dyad-census-stage.json',
  );
});

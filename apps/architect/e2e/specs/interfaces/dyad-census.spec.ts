import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import {
  selectOrCreateEdgeType,
  selectOrCreateNodeType,
} from '../../pageobjects/editor-sections/entity-types.js';
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

  // DyadCensus's subject is a node type (sections/NodeType.tsx's
  // `FilteredNodeType`, `Section title="Node Type"` — StageEditor/
  // Interfaces.tsx registers `FilteredNodeType` for DyadCensus, the same as
  // AlterForm). DyadCensusPrompts.tsx's own `withDisabledSubjectRequired`
  // disables the Prompts section until `subject.type` is set.
  await selectOrCreateNodeType(architectPage, 'person');

  // IntroductionPanel.tsx is the exact shared component AlterForm/EgoForm
  // already exercise — same `introductionPanel.title` data-field-name seam
  // and "Introduction text" RichText label.
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('Do They Know Each Other?');
  await editor.fillRichText(
    'Introduction text',
    'We would like to ask you about the people you know.',
  );

  // DyadCensusPrompts.tsx, `Section title="Prompts"` wraps a
  // DialogArrayField whose dialog (PromptFields.tsx) exposes: `text`
  // (RichText, explicit `label="Prompt Text"` — capital T, NOT
  // NameGenerator's "Prompt text") and `createEdge` (EntitySelectField,
  // `entityType="edge"`) — the same pill/"Create new edge type" UI
  // `selectOrCreateEdgeType` already drives for edge types elsewhere.
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt Text', 'Do they know each other?');
    await selectOrCreateEdgeType(architectPage, 'knows');
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('DyadCensus');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'dyad-census-stage.json',
  );
});

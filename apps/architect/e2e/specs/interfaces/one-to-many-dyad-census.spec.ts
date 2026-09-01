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

test('creates a valid OneToManyDyadCensus stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('OneToManyDyadCensus');
  await editor.setStageName('Who Knows This Person?');

  // Same `FilteredNodeType` subject section as DyadCensus (`Section
  // title="Node setup"`). Unlike DyadCensus/TieStrengthCensus,
  // OneToManyDyadCensus's registry entry (StageEditor/Interfaces.tsx) has NO
  // IntroductionPanel — its second section is RemoveAfterConsideration, a
  // boolean toggle already pre-populated by the interface's own
  // `template.behaviours.removeAfterConsideration: true`, so nothing to
  // author there.
  await selectOrCreateNodeType(architectPage, 'person');

  // OneToManyDyadCensusPrompts.tsx exposes the same `prompts` DialogArrayField
  // shape as DyadCensus, whose dialog (PromptFields.tsx) exposes `text`
  // (RichText, `label: 'Prompt text'`) and `createEdge`
  // (EntitySelectField). The dialog also renders BucketSortOrderSection /
  // BinSortOrderSection, both disabled until `createEdge` has a value and
  // entirely optional (SortOrderSchema.optional() in protocol-validation),
  // so left untouched here.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Who does this person know?');
    await selectOrCreateEdgeType(architectPage, 'knows');
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('OneToManyDyadCensus');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'one-to-many-dyad-census-stage.json',
  );
});

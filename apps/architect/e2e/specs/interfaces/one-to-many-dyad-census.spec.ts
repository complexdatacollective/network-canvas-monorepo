import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
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

  // Same subject picker as DyadCensus. Unlike DyadCensus/TieStrengthCensus,
  // OneToManyDyadCensus's editor has NO introduction section; what it adds is
  // the "Node availability" section (`behaviours.removeAfterConsideration`),
  // placed AFTER the prompts and already pre-populated by the interface's own
  // template (`INTERFACE_TEMPLATES.OneToManyDyadCensus`), so nothing to author
  // there.
  await selectOrCreateNodeType(architectPage, 'person');

  // The shared prompts section's row dialog, filled with what a One-to-Many
  // prompt is made of (OneToManyDyadCensusPromptsSection.tsx): the family's
  // `PromptTextField` (`label: 'Prompt text'`) and the same `EdgeTypeSection`
  // DyadCensus uses — rendered bare inside the "Prompt configuration" group,
  // whose picker offers "Create new edge type", opening the codebook entity
  // editor ("Edge type name", then "Save entity"). The dialog also renders the
  // two `SortOrderRows` groups ("Bucket order" / "Bin order", the bins' own
  // two sections, which Architect mounts here unchanged), both disabled until a
  // connection type is chosen and entirely optional
  // (`SortOrderSchema.optional()` in protocol-validation), so left untouched
  // here.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Who does this person know?');
    // Scoped to the entity editor's own dialog: the prompt dialog behind it is
    // still mounted, and the stage behind that.
    const edgeTypeEditor = architectPage.getByRole('dialog', {
      name: 'Create new edge type',
      exact: true,
    });
    await architectPage
      .getByRole('button', {
        name: 'Create new edge type',
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
  expect(stage.type).toBe('OneToManyDyadCensus');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'one-to-many-dyad-census-stage.json',
  );
});

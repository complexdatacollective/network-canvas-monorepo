import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readProtocolJson, readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import {
  createVariableViaSpotlight,
  createVariableWithOptions,
} from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

type TieStrengthPrompt = {
  id: string;
  text: string;
  createEdge: string;
  edgeVariable: string;
  negativeLabel: string;
};

// Narrow one element of the saved `prompts` array with a real runtime guard
// (mirroring `toStage` in timeline.spec.ts) rather than an `as` cast: the
// schema (`tieStrengthCensusPromptSchema`, a `z.strictObject`) rejects any
// extra key, including the `variableOptions` the editor's `withVariableOptions`
// enhancer syncs onto the *draft* form — `withPromptChangeHandler.tsx`'s
// `onBeforeSave` strips it back out before the array item is committed, so
// asserting this exact key set is a real check that the strip actually
// happened, not just that the stage saved successfully.
function toTieStrengthPrompt(value: unknown): TieStrengthPrompt {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'text' in value &&
    typeof value.text === 'string' &&
    'createEdge' in value &&
    typeof value.createEdge === 'string' &&
    'edgeVariable' in value &&
    typeof value.edgeVariable === 'string' &&
    'negativeLabel' in value &&
    typeof value.negativeLabel === 'string' &&
    Object.keys(value).length === 5
  ) {
    return {
      id: value.id,
      text: value.text,
      createEdge: value.createEdge,
      edgeVariable: value.edgeVariable,
      negativeLabel: value.negativeLabel,
    };
  }
  throw new Error(
    `saved TieStrengthCensus prompt has an unexpected shape: ${JSON.stringify(value)}`,
  );
}

test('creates a valid TieStrengthCensus stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('TieStrengthCensus');
  await editor.setStageName('How Strong Is This Tie?');

  // Same `FilteredNodeType` subject + shared `IntroductionPanel.tsx` as
  // DyadCensus (StageEditor/Interfaces.tsx registers
  // `[FilteredNodeType, IntroductionPanel, TieStrengthCensusPrompts, ...]`).
  await selectOrCreateNodeType(architectPage, 'person');
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('How Strong Is This Tie?');
  await editor.fillRichText(
    'Introduction text',
    'We would like to ask you how close you are with the people you know.',
  );

  // TieStrengthCensusPrompts.tsx's PromptFields.tsx is the heaviest prompt
  // editor in the census family, and diverges from DyadCensus/
  // OneToManyDyadCensus in two ways:
  //
  // - `createEdge` is a `NativeSelect` (Form/Fields/NativeSelect.tsx, wrapping
  //   fresco-ui's real `<select>`) — NOT an `EntitySelectField` pill picker.
  //   Exercise its inline creation flow directly. This guards the async
  //   contract between `handleCreateEdge` and `handleChangeCreateEdge`: the
  //   created edge-type id, never the pending Promise, must become the form
  //   value before the ordinal variable is created.
  // - `edgeVariable` is a `VariablePicker` (same "Select variable" button +
  //   VariableSpotlight `createVariableViaSpotlight` already drives), but its
  //   `onCreateOption` is wired to `handleNewVariable`, which opens
  //   `NewVariableWindow` with `initialValues: { name, type: 'ordinal' }` —
  //   i.e. this IS the "locked-type" NewVariableWindow flow
  //   `createVariableWithOptions`'s own doc comment calls out. Both
  //   variables.ts helpers are needed together here:
  //   `createVariableViaSpotlight` opens the spotlight and clicks "Create new
  //   variable called…" (which is what actually opens NewVariableWindow,
  //   pre-filled with that name and its "Variable type" combobox already
  //   disabled/set to "Ordinal" via `initialValues.type`), then
  //   `createVariableWithOptions` fills in and submits that already-open
  //   dialog. Confirmed live: `NewVariableWindow.tsx`'s "Variable type"
  //   combobox is disabled here (`disabled: !!initialValues?.type`), so
  //   `createVariableWithOptions`'s existing `isEnabled()` branch already
  //   does the right thing without modification — the helper needed no fix
  //   for this call site.
  //
  // After `edgeVariable` is set, a "Variable Options" `<Options
  // name="variableOptions" .../>` section appears — but it's just a *draft
  // mirror* of the variable's own options (`withVariableOptions.tsx`'s
  // `updateFormVariableOptions` lifecycle copies them in whenever
  // `edgeVariable` changes) that the author *could* edit further here.
  // `withPromptChangeHandler.tsx`'s `onBeforeSave` strips `variableOptions`
  // back out of the saved prompt (it already persisted the options onto the
  // variable itself via `updateVariableAsync`), so this test deliberately
  // leaves that mirror section untouched and asserts its absence below via
  // `toTieStrengthPrompt`.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'How close are you?');

    await architectPage
      .getByLabel('Edge type')
      .selectOption({ label: '✨ Create new edge type ✨' });
    await architectPage
      .getByRole('textbox', { name: 'New edge type name' })
      .fill('close');
    await architectPage.getByRole('button', { name: 'Create' }).click();

    await expect(
      architectPage.getByRole('button', { name: 'Select attribute' }),
    ).toBeVisible();

    await createVariableViaSpotlight(architectPage, {
      variableName: 'strength',
    });
    await createVariableWithOptions(architectPage, {
      variableName: 'strength',
      options: ['Low', 'High'],
      type: 'ordinal',
    });

    await editor.fillRichText('Decline option', 'We are not close');
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  if (stage.type !== 'TieStrengthCensus') {
    throw new Error(`expected TieStrengthCensus stage, got ${stage.type}`);
  }

  const { prompts } = stage;
  if (!Array.isArray(prompts) || prompts.length !== 1) {
    throw new Error('expected exactly one saved TieStrengthCensus prompt');
  }
  const prompt = toTieStrengthPrompt(prompts[0]);
  expect(prompt.text).toContain('How close are you?');
  expect(prompt.negativeLabel).toContain('We are not close');

  const protocol = await readProtocolJson(architectPage);
  expect(protocol.codebook.edge?.[prompt.createEdge]?.name).toBe('close');
  expect(Object.keys(protocol.codebook.edge ?? {})).not.toContain(
    '[object Promise]',
  );

  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'tie-strength-census-stage.json',
  );
});

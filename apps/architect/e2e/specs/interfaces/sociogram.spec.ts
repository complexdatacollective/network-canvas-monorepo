import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { createVariableViaSpotlight } from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid Sociogram stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Sociogram');
  await editor.setStageName('Draw Your Network');

  // StageEditor/Interfaces.tsx: `Sociogram.sections = [FilteredNodeType,
  // Background, AutomaticLayout, SociogramPrompts, SkipLogic,
  // InterviewScript]`. FilteredNodeType renders the same `EntitySelectField`
  // radio-pill/"Create new node type" structure as the plain `NodeType`
  // (entity-types.ts's own comment: "Both node ... sections are structurally
  // identical"), so `selectOrCreateNodeType` covers it unchanged.
  await selectOrCreateNodeType(architectPage, 'person');

  // Background.tsx: `allowsBackgroundImage('Sociogram')` is true, but
  // `withBackgroundChangeHandler`'s `useImage` state defaults to `false`
  // (seeded from the unset `background.image` form value), so the
  // concentric-circles branch renders by default and the image-type toggle
  // never needs touching. The field is a native `type="number"` input
  // (fresco-ui `InputField`), whose implicit ARIA role is "spinbutton", not
  // "textbox" — confirmed by reading InputField.tsx directly (no existing
  // spec in this suite had exercised a number field yet).
  await editor
    .field('background.concentricCircles')
    .getByRole('spinbutton')
    .fill('4');

  // SociogramPrompts.tsx, `Section title="Prompts"` (same DialogArrayField
  // shape as every other prompts array in this suite). Inside the dialog,
  // PromptFields.tsx renders the shared `PromptText` component first (label
  // "Prompt text", same as name-generator.spec.ts) followed by
  // PromptFieldsLayout.tsx's "Layout" subsection, whose `layout.layoutVariable`
  // `VariablePicker` is the ONLY variable picker open at this point (no
  // scoping needed — matches the single-picker call sites already proven by
  // categorical-bin.spec.ts / name-generator-quick-add.spec.ts). Its
  // `onCreateOption` wires straight to `handleCreateVariable(value, 'layout',
  // 'layout.layoutVariable')` (withCreateVariableHandler.tsx) — a direct
  // `createVariableAsync` dispatch with `configuration.type: 'layout'`
  // pre-supplied by the call site, NOT the NewVariableWindow/enabled-combobox
  // path. `createVariableViaSpotlight`'s existing "simple creation path"
  // already covers this; no NewVariableWindow ever opens for a layout
  // variable anywhere in this suite (confirmed again in NodeConfiguration.tsx
  // and NarrativePresets/withPresetProps.tsx for the other two specs in this
  // task).
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Place them');
    await createVariableViaSpotlight(architectPage, { variableName: 'layout' });
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Sociogram');
  expect(stageSnapshotJson(stage)).toMatchSnapshot('sociogram-stage.json');
});

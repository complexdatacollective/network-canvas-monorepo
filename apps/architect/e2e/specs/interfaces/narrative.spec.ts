import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { createVariableViaSpotlight } from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// Only the background image asset is seeded: the Background section's picker
// selects from resources the protocol already has, and driving a real upload
// through the file-chooser is resources.spec.ts's job. Everything else this
// stage needs (node type, layout variable, preset) is authored live through
// the editor UI below.
function protocolWithBackgroundAsset(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    assetManifest: {
      narrative_background: {
        name: 'Narrative Background',
        type: 'image',
        source: 'narrative-background.svg',
      },
    },
  };
}

const NARRATIVE_BACKGROUND_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <rect width="1200" height="800" fill="#6ecae8" />
</svg>`;

test('creates a valid Narrative stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(protocolWithBackgroundAsset(), {
    assets: [
      {
        assetId: 'narrative_background',
        name: 'narrative-background.svg',
        data: NARRATIVE_BACKGROUND_SVG,
      },
    ],
  });
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Narrative');
  await editor.setStageName('Explore Your Network');

  // StageEditor/Interfaces.tsx: `Narrative.sections = [FilteredNodeType,
  // Background, NarrativePresets, NarrativeBehaviours, SkipLogic,
  // InterviewScript]`. FilteredNodeType renders the same radio-pill/"Create
  // new node type" structure as the plain `NodeType` (entity-types.ts: "Both
  // node ... sections are structurally identical"), so
  // `selectOrCreateNodeType` creates "person" from the empty codebook here,
  // exactly as sociogram.spec.ts does.
  await selectOrCreateNodeType(architectPage, 'person');

  // Narrative uses the shared canvas Background section, including the same
  // image-or-concentric-circles choice as Sociogram and NetworkComposer. Pick
  // the seeded image from the real Resource Browser so the saved stage shape
  // proves Architect authors `background.image` for Narrative.
  await editor
    .section('Background')
    .getByRole('option', { name: /^Image/ })
    .click();
  await expect(
    editor.section('Background').getByRole('link', {
      name: 'Learn how to create a responsive SVG background',
    }),
  ).toHaveAttribute(
    'href',
    'https://documentation.networkcanvas.com/en/design-protocols/key-concepts/responsive-svg-backgrounds/',
  );
  await editor
    .field('background.image')
    .getByRole('button', { name: 'Select resource' })
    .click();
  await architectPage
    .getByRole('dialog', { name: 'Resource Browser' })
    .getByRole('listbox', { name: 'Resource library' })
    .getByRole('heading', {
      level: 4,
      name: 'Narrative Background',
      exact: true,
    })
    .click();

  // NarrativePresets.tsx, `Section title="Narrative Presets"` — the same
  // DialogArrayField shape as every other prompts/presets array in this
  // suite, with the add button named for what it adds ("Create new preset"
  // opens the dialog, "Add" submits a new item).
  // PresetFields.tsx renders "Preset Label" first: a plain `FrescoReduxField`
  // text input (`name="label"`) with `labelHidden` and a real `placeholder`,
  // located directly rather than by (hidden) accessible name. Its "Layout
  // Variable" section follows; "Group Variable"/"Display Edges"/"Highlight
  // Node Attributes" are all `toggleable` and collapsed by default, so the
  // Layout Variable `VariablePicker` is the only "Select variable" button
  // visible — no `scope` needed, unlike NetworkComposer's NodeConfiguration.
  //
  // The fresh codebook has no variables yet, so typing a name renders the
  // spotlight's "Create new variable called…" row and this exercises real
  // creation through the picker's `onCreateOption`:
  // NarrativePresets/withPresetProps.tsx's `handleCreateLayoutVariable`
  // delegates to withCreateVariableHandler's `handleCreateVariable(name,
  // 'layout', 'layoutVariable')` — the same simple creation path as
  // Sociogram's prompt "Layout" section, with the type pre-supplied by the
  // call site (no NewVariableWindow opens).
  await addPrompt(
    editor.section('Narrative Presets'),
    async () => {
      await architectPage
        .getByPlaceholder('Enter a label for the preset...')
        .fill('Default view');
      await createVariableViaSpotlight(architectPage, {
        variableName: 'layout',
      });
    },
    { addButtonLabel: 'Create new preset' },
  );

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Narrative');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'narrative-stage.json',
  );
});

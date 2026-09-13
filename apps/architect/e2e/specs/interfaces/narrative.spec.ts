import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { setImageBackground } from '../../pageobjects/editor-sections/background.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addNarrativePreset } from '../../pageobjects/editor-sections/narrative-presets.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// Only the background image asset is seeded: the Background section's picker
// selects from resources the protocol already has, and driving a real import
// through the file input is resources.spec.ts's job. Everything else this
// stage needs (node type, position attribute, preset) is authored live through
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

  // `narrativeStageEditor` is [stage heading, subject picker, presets,
  // background, node layout, canvas interaction, skip logic, interviewer
  // guidance]. The subject picker is the shared one, so `selectOrCreateNodeType`
  // creates "person" from the empty codebook here exactly as it does on a
  // sociogram.
  await selectOrCreateNodeType(architectPage, 'person');

  // Narrative uses the same shared Background section as Sociogram and
  // NetworkComposer, including the same choice between concentric circles and
  // an image. Pick the seeded image out of the real resource browser so the
  // saved stage proves Architect authors `background.image` for Narrative.
  await setImageBackground(editor, architectPage, {
    select: 'Narrative Background',
  });

  // The presets list is the section "Visualization presets", disabled until a
  // node type is chosen because every preset describes that type's own
  // attributes. Its dialog holds the preset's name and the position attribute
  // it arranges nodes by, which is created from inside the dialog through the
  // codebook's own attribute editor — the empty codebook offers none.
  await addNarrativePreset(editor, architectPage, {
    label: 'Default view',
    layoutVariable: 'layout',
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Narrative');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'narrative-stage.json',
  );
});

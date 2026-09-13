import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { loadAllInterfacesFixture } from '../../helpers/load-fixture.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addSociogramPrompt } from '../../pageobjects/editor-sections/sociogram-prompts.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// A stage being ADDED arrives with a name already proposed for it, so it holds
// something the protocol does not from its first frame and may be saved
// straight away. Opening one that already exists is the case that must report
// nothing — see the test below, which is where "merely looking is not editing"
// is pinned.
test('opens a new Sociogram already named, and offers to save it', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Sociogram');

  await expect(
    architectPage.getByRole('textbox', { name: 'Stage name' }),
  ).toHaveValue('Sociogram');
  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toBeVisible();
});

test('opens an existing Sociogram without reporting unsaved changes', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  const sociogram = protocol.stages.find((stage) => stage.type === 'Sociogram');
  if (!sociogram || sociogram.type !== 'Sociogram') {
    throw new Error('all-interfaces fixture has no Sociogram stage');
  }
  if (!sociogram.background || !('concentricCircles' in sociogram.background)) {
    throw new Error('fixture Sociogram does not use concentric circles');
  }

  // Older valid protocols may omit this optional false-valued property. The
  // Background section draws its switch from an absent value as "off", so
  // opening such a stage must report nothing to save.
  delete sociogram.background.skewedTowardCenter;

  await seed(protocol, { assets });
  await gotoProtocol(architectPage);
  await architectPage.goto(`/protocol/stage/${sociogram.id}`);

  const editor = new StageEditor(architectPage);
  await expect(
    editor.field('background.concentricCircles').getByRole('spinbutton'),
  ).toBeVisible();
  await expect(
    architectPage.getByRole('button', { name: 'Finished Editing' }),
  ).toHaveCount(0);
});

test('creates a valid Sociogram stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Sociogram');
  await editor.setStageName('Draw Your Network');

  // `sociogramStageEditor` is [stage heading, subject picker, prompts,
  // background, node layout, skip logic, interviewer guidance]. The subject
  // picker is the shared one every stage uses, with a stage filter offered
  // alongside it, so `selectOrCreateNodeType` covers it unchanged.
  await selectOrCreateNodeType(architectPage, 'person');

  // The Background section opens on concentric circles — a stage whose
  // background holds no `image` key is a circles background — so the
  // number of circles is on screen without touching the type chooser. It is a
  // native number input (`IntegerField`), whose implicit ARIA role is
  // "spinbutton" rather than "textbox".
  await editor
    .field('background.concentricCircles')
    .getByRole('spinbutton')
    .fill('4');

  // The prompt is written through the same page object the whole-protocol
  // build uses, so both drive one description of this dialog: the text, and
  // the position attribute created from inside it through the codebook's own
  // attribute editor. A prompt that says nothing about tapping carries no
  // `highlight` and no `edges` at all.
  await addSociogramPrompt(editor, architectPage, {
    text: 'Place them',
    layoutVariable: 'layout',
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Sociogram');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'sociogram-stage.json',
  );
});

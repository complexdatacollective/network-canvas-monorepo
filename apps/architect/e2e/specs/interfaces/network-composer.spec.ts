import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { createAttribute } from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid NetworkComposer stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('NetworkComposer');
  await editor.setStageName('Build Your Network');

  // `networkComposerStageEditor` is [stage heading, subject picker, nodes,
  // connections, background, node layout, skip logic, interviewer guidance].
  // The subject picker here offers no stage filter: the network is built on
  // this stage rather than drawn from one built earlier.
  await selectOrCreateNodeType(architectPage, 'person');

  // "Node configuration" holds three pickers at once — the attribute
  // the quick-add box fills in (`quickAdd`), the one that stores each node's
  // position (`layoutVariable`) and the one nodes are grouped by
  // (`convexHullVariable`). No create control sits beside any of them: each
  // picker's own create row invents what the slot needs. The section is
  // disabled until the node type is chosen, because every one of them names
  // that type's attributes.
  //
  // The two filled here are a `text` and a `layout` attribute, and both kinds
  // are finished by a name — so each create row writes the codebook and binds
  // the result without opening anything. (The grouping slot binds a
  // `categorical`, which a name cannot finish, so its row would escalate to
  // the codebook's editor; it is left untouched below.)
  await createAttribute(editor.field('quickAdd'), 'name');
  await createAttribute(editor.field('layoutVariable'), 'layout');

  // The Background section opens on concentric circles for this interface too
  // (a background holding no `image` key is a circles background), so the
  // number input — a native number field, hence role "spinbutton" — is on
  // screen without touching the type chooser.
  await editor
    .field('background.concentricCircles')
    .getByRole('spinbutton')
    .fill('4');

  // Deliberately untouched: the grouping attribute is optional per the stage
  // schema, the "Editable attributes" form is a capability that stays switched
  // off, and so is everything in the "Edge configuration" section — an empty
  // one is
  // dropped on save rather than written as an empty list.
  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('NetworkComposer');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'network-composer-stage.json',
  );
});

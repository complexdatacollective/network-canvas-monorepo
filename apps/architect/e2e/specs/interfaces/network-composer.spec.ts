import type { Locator, Page } from '@playwright/test';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

/**
 * Adds a codebook attribute from beside one of the stage's pickers.
 *
 * `VariablePickerField` is handed the attributes that exist and no
 * `onCreateOption` here, so it can only choose; the `CreateVariableButton`
 * beside it is what adds one, through the codebook's own attribute editor
 * ("Attribute name", submitted with "Create attribute") in a dialog titled
 * with the button's own label. The type is the call site's — never asked for —
 * so the empty codebook this spec starts from is filled in one step per
 * picker.
 */
async function createAttribute(
  page: Page,
  scope: Locator,
  field: Locator,
  opts: { buttonLabel: string; name: string },
): Promise<void> {
  await scope
    .getByRole('button', { name: opts.buttonLabel, exact: true })
    .click();
  const attributeEditor = page.getByRole('dialog', {
    name: opts.buttonLabel,
    exact: true,
  });
  await attributeEditor
    .getByRole('textbox', { name: 'Attribute name', exact: true })
    .fill(opts.name);
  await attributeEditor
    .getByRole('button', { name: 'Create attribute', exact: true })
    .click();
  // The write goes to the codebook under its section's own lock and the id
  // comes back afterwards, so the picker holds the new attribute only once the
  // editor has closed.
  await attributeEditor.waitFor({ state: 'detached' });
  await expect(field.locator('option:checked')).toHaveText(opts.name);
}

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

  // "Adding and arranging nodes" holds three pickers at once — the attribute
  // the quick-add box fills in (`quickAdd`), the one that stores each node's
  // position (`layoutVariable`) and the one nodes are grouped by
  // (`convexHullVariable`) — plus a create button for each, named for the
  // attribute it adds. The section is disabled until the node type is chosen,
  // because every one of them names that type's attributes.
  const nodes = editor.section('Adding and arranging nodes');
  await createAttribute(architectPage, nodes, editor.field('quickAdd'), {
    buttonLabel: 'Create a new attribute to fill in',
    name: 'name',
  });
  await createAttribute(architectPage, nodes, editor.field('layoutVariable'), {
    buttonLabel: 'Create a new position attribute',
    name: 'layout',
  });

  // The Background section opens on concentric circles for this interface too
  // (a background holding no `image` key is a circles background), so the
  // number input — a native number field, hence role "spinbutton" — is on
  // screen without touching the type chooser.
  await editor
    .field('background.concentricCircles')
    .getByRole('spinbutton')
    .fill('4');

  // Deliberately untouched: the grouping attribute is optional per the stage
  // schema, the "Node attributes" form is a capability that stays switched
  // off, and so is everything in the Connections section — an empty one is
  // dropped on save rather than written as an empty list.
  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('NetworkComposer');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'network-composer-stage.json',
  );
});

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readStageJson } from '../helpers/read-store.js';
import { selectOrCreateNodeType } from '../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../pageobjects/editor-sections/prompts.js';
import {
  createAttribute,
  dismissAttributeWindow,
  openAttributeWindow,
  searchAttributes,
} from '../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

/**
 * The attribute picker, driven the two ways a researcher drives it: finding an
 * attribute the codebook already holds, and inventing the one it does not.
 *
 * Quick add is the stage that offers both — its picker is handed the node
 * type's text attributes AND a way to create one — so both journeys run
 * against one control here rather than against two that happen to look alike.
 */
test('finds an attribute, and invents the one that is missing', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('NameGeneratorQuickAdd');
  await editor.setStageName('Quickly Add Friends');
  await selectOrCreateNodeType(architectPage, 'person');

  const picker = editor.field('quickAdd');

  // Nothing chosen, and nothing to choose: a fresh node type has no text
  // attribute at all. The trigger still opens, because creating one is the
  // whole point of it being there.
  await expect(
    picker.getByRole('button', { name: 'Select attribute', exact: true }),
  ).toBeVisible();

  const empty = await openAttributeWindow(picker);
  // The field's own label, asterisk and all: `BaseField` puts the required
  // marker inside the label, and the window is named by pointing at it.
  await expect(empty).toHaveAccessibleName('Select an attribute *');
  await expect(
    empty.getByRole('searchbox', { name: 'Find or create an attribute' }),
  ).toBeFocused();
  await expect(empty.getByRole('option')).toHaveCount(0);
  await dismissAttributeWindow(empty);
  // Dismissed, not answered: focus goes back to the control that opened it.
  await expect(
    picker.getByRole('button', { name: 'Select attribute', exact: true }),
  ).toBeFocused();

  // JOURNEY ONE — inventing. The name typed into the search box is what the
  // create row offers to make, so looking for an attribute and finding it does
  // not exist are one act.
  await createAttribute(picker, 'nickname');
  await expect(picker.locator('[data-attribute-type]')).toHaveText('nickname');
  await expect(picker.locator('[data-attribute-type]')).toHaveAttribute(
    'data-attribute-type',
    'text',
  );

  // A second attribute, so the list below has something to narrow.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Name someone you know');
  });
  await editor.expectNoIssues();
  await editor.save();

  // JOURNEY TWO — finding. A second quick-add stage on the same node type
  // points at the attribute the first one made: the window offers it, the
  // search narrows to it, and the keyboard takes it.
  await editor.createNew('NameGeneratorQuickAdd');
  await editor.setStageName('Quickly Add More Friends');
  await selectOrCreateNodeType(architectPage, 'person');

  const second = editor.field('quickAdd');
  const window = await openAttributeWindow(second);
  const nickname = window.getByRole('option', {
    name: 'nickname',
    exact: true,
  });
  await expect(nickname).toBeVisible();
  // The row says which kind of answer it records, which is what tells two
  // attributes of the same name-ish apart in a codebook of dozens.
  await expect(nickname).toHaveAttribute('data-attribute-type', 'text');

  // A partial name still offers to create one: a researcher who typed
  // something no attribute carries is asking for that name, and the near-miss
  // still on screen is not what they asked for.
  await searchAttributes(window, 'nick');
  const partial = window.getByRole('option');
  await expect(partial).toHaveCount(2);
  await expect(partial.first()).toHaveAccessibleName(
    'Create new attribute called “nick”.',
  );

  // The whole name is not a new name, so there is nothing to create and one
  // result is left. Enter in the search box takes it — no pointer, and no
  // walking into the list first.
  await searchAttributes(window, 'nickname');
  await expect(window.getByRole('option')).toHaveCount(1);
  await architectPage.keyboard.press('Enter');
  await expect(window).toBeHidden();
  await expect(
    second.getByRole('button', { name: 'Change attribute', exact: true }),
  ).toBeVisible();
  // Answered from the KEYBOARD, so focus comes back to the trigger the choice
  // is now named on. Left on `<body>`, the next Tab restarts a document walk
  // and steps straight out of the editor the window was opened from.
  await expect(
    second.getByRole('button', { name: 'Change attribute', exact: true }),
  ).toBeFocused();
  await expect(second.locator('[data-attribute-type]')).toHaveText('nickname');

  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Name someone else you know');
  });
  await editor.expectNoIssues();
  await editor.save();

  // What the protocol holds, which is the only proof either journey landed:
  // both stages fill in the one attribute, and it is the one that was created.
  const first = await readStageJson(architectPage, 0);
  const next = await readStageJson(architectPage, 1);
  if (first.type !== 'NameGeneratorQuickAdd') {
    throw new Error('expected stage 0 to be a NameGeneratorQuickAdd');
  }
  if (next.type !== 'NameGeneratorQuickAdd') {
    throw new Error('expected stage 1 to be a NameGeneratorQuickAdd');
  }
  expect(first.quickAdd).toBeTruthy();
  expect(next.quickAdd).toBe(first.quickAdd);
});

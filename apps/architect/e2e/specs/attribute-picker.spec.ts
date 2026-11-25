import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readStageJson } from '../helpers/read-store.js';
import { selectOrCreateNodeType } from '../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../pageobjects/editor-sections/prompts.js';
import {
  attributeRows,
  attributeTrigger,
  createAttribute,
  dismissAttributeWindow,
  offeredAttributeRows,
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
  const trigger = attributeTrigger(picker);

  // Nothing chosen, and nothing to choose: a fresh node type has no attribute
  // at all. The trigger still opens, because creating one is the whole point
  // of it being there. Named by the field's own label and then by what it
  // holds, which is nothing yet: the placeholder.
  await expect(trigger).toHaveAccessibleName(
    'Select an attribute Select an attribute',
  );

  const empty = await openAttributeWindow(picker);
  // The popup is named by pointing at that same label.
  await expect(empty).toHaveAccessibleName('Select an attribute');
  await expect(
    empty.getByRole('combobox', { name: 'Find or create an attribute' }),
  ).toBeFocused();
  // An empty list, and the sentence that says why and what to do instead —
  // asserted together, so a list that failed to draw its rows cannot pass for
  // one that has none to draw.
  await expect(empty.getByRole('option')).toHaveCount(0);
  await expect(empty).toContainText(
    'Nothing has been recorded about this type yet.',
  );
  await dismissAttributeWindow(empty);
  // Dismissed, not answered: focus goes back to the control that opened it.
  await expect(trigger).toBeFocused();

  // JOURNEY ONE — inventing. The name typed into the search box is what the
  // create row offers to make, so looking for an attribute and finding it does
  // not exist are one act.
  await createAttribute(picker, 'nickname');
  await expect(trigger.locator('[data-attribute-type]')).toHaveText('nickname');
  await expect(trigger.locator('[data-attribute-type]')).toHaveAttribute(
    'data-attribute-type',
    'text',
  );
  // And the kind of answer is said to a screen reader too, not only drawn —
  // last in the description, after the field's own hint, and in the words
  // the codebook editor uses for the type.
  await expect(trigger).toHaveAccessibleName('Select an attribute nickname');
  await expect(trigger).toHaveAccessibleDescription(/ Attribute type: Text$/);

  // A second attribute, so the list below has something to narrow.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Name someone you know');
  });
  await editor.expectNoIssues();
  await editor.save();

  // JOURNEY TWO — finding. A second quick-add stage on the same node type
  // points at the attribute the first one made: the popup offers it, the
  // search narrows to it, and the keyboard takes it.
  await editor.createNew('NameGeneratorQuickAdd');
  await editor.setStageName('Quickly Add More Friends');
  await selectOrCreateNodeType(architectPage, 'person');

  const second = editor.field('quickAdd');
  const secondTrigger = attributeTrigger(second);
  const window = await openAttributeWindow(second);
  const nickname = offeredAttributeRows(window, 'nickname');
  await expect(nickname).toBeVisible();
  // The row says which kind of answer it records, which is what tells two
  // attributes of the same name-ish apart in a codebook of dozens.
  await expect(nickname).toHaveAttribute('data-attribute-type', 'text');

  // A partial name still offers to create one: a researcher who typed
  // something no attribute carries is asking for that name, and the near-miss
  // still on screen is not what they asked for. The create row comes first
  // and says what kind of attribute it would make.
  await searchAttributes(window, 'nick');
  const partial = window.getByRole('option');
  await expect(partial).toHaveCount(2);
  await expect(partial.first()).toHaveAccessibleName('Create “nick”');
  await expect(partial.first()).toHaveAccessibleDescription(
    'New Text attribute',
  );
  await expect(partial.nth(1)).toHaveAccessibleName('nickname');

  // A listed name is not a new name, however it is capitalised: there is
  // nothing to create, and the one attribute is left.
  await searchAttributes(window, 'NICKNAME');
  await expect(window.getByRole('option')).toHaveCount(1);
  await expect(attributeRows(window, 'nickname')).toBeVisible();

  // Enter in the search box takes the one result — no pointer, and no
  // walking into the list first.
  await searchAttributes(window, 'nickname');
  await expect(window.getByRole('option')).toHaveCount(1);
  await architectPage.keyboard.press('Enter');
  await expect(window).toHaveCount(0);
  // Answered from the KEYBOARD, so focus comes back to the trigger the choice
  // is now named on. Left on `<body>`, the next Tab restarts a document walk
  // and steps straight out of the editor the popup was opened from.
  await expect(secondTrigger).toBeFocused();
  await expect(secondTrigger).toHaveAccessibleName(
    'Select an attribute nickname',
  );

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

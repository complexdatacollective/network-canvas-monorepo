import { expect, userEvent, waitFor, within } from 'storybook/test';

/**
 * Switches the page's editing language through the first language menu on it,
 * and returns once the menu has finished closing.
 *
 * The menu hands focus back to its trigger at the end of its exit animation,
 * so a play that types as soon as the item is chosen has its keystrokes taken
 * by the trigger part-way through.
 */
export async function chooseEditingLanguage(
  canvasElement: HTMLElement,
  language: RegExp,
): Promise<void> {
  const canvas = within(canvasElement);
  const page = within(canvasElement.ownerDocument.body);
  const [trigger] = canvas.getAllByRole('button', {
    name: /Editing language/,
  });
  if (trigger === undefined) throw new Error('No language menu');

  await userEvent.click(trigger);
  await userEvent.click(
    await page.findByRole('menuitemradio', { name: language }),
  );
  await waitFor(async () => {
    await expect(page.queryByRole('menu')).toBeNull();
    await expect(trigger).toHaveFocus();
  });
}

import { waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

type HarnessUser = ReturnType<typeof userEvent.setup>;

/**
 * The two names the attribute picker's trigger goes by.
 *
 * A picker that already holds an attribute says so on its own button, so a
 * test that only knew one of the two would find the control before a choice
 * had been made and lose it afterwards.
 */
const TRIGGER_NAMES = ['Select attribute', 'Change attribute'];

const isTrigger = (name: string) => TRIGGER_NAMES.includes(name);

/**
 * One attribute picker, found by the label of the field it answers.
 *
 * The trigger says what it does — "Select attribute" — rather than which
 * question it answers, which is right on screen (the label is right above it)
 * and wrong for a test with three pickers open. So a test names the FIELD, and
 * everything below reaches inside it.
 */
export function attributeField(
  label: string,
  scope: HTMLElement = document.body,
): HTMLElement {
  const labelElement = within(scope).getByText(label, { selector: 'label' });
  const field = labelElement.closest<HTMLElement>('[data-field-name]');
  if (field === null) {
    throw new Error(
      `attributeField: the label "${label}" is not inside a field. Either it names something other than a field, or the control it names is not rendered through \`Field\`.`,
    );
  }
  return field;
}

/**
 * The attribute window itself, found by its own marker rather than by role.
 *
 * A picker is often inside a dialog already — a row editor, the rule builder —
 * and the window opens on top of it. `Modal` isolates the one underneath with
 * `inert`, which browsers honour and Testing Library's accessibility tree does
 * not, so `getByRole('dialog')` matches both. The marker is on the window's own
 * popup and belongs to nothing else.
 */
const SPOTLIGHT = '[data-variable-spotlight]';

const openWindow = (): HTMLElement | null =>
  document.body.querySelector<HTMLElement>(SPOTLIGHT);

/** Opens one picker's window and hands it back. */
export async function openAttributePicker(
  user: HarnessUser,
  field: HTMLElement,
): Promise<HTMLElement> {
  await user.click(within(field).getByRole('button', { name: isTrigger }));
  await waitFor(() => {
    if (openWindow() === null) {
      throw new Error('the attribute window did not open');
    }
  });
  const window = openWindow();
  if (window === null) throw new Error('the attribute window did not open');
  return window;
}

/**
 * Picks the attribute of this name through the window, as a researcher does.
 *
 * Waits for the window to go before answering: the pick is written as it
 * closes, and a test that carried on while it was still on screen would read
 * the field through a dialog that still covers it.
 */
export async function chooseAttribute(
  user: HarnessUser,
  field: HTMLElement,
  attributeName: string,
): Promise<void> {
  const dialog = await openAttributePicker(user, field);
  await user.click(within(dialog).getByRole('option', { name: attributeName }));
  // Tolerant of a window that has already gone: the pick is written as it
  // closes, and whether the close has landed by the time this runs is a
  // scheduling detail. What must not happen is carrying on while a dialog
  // still covers the field.
  await waitForTheWindowToClose();
}

/**
 * Chooses the attribute the protocol files under this id.
 *
 * The window shows the researcher's NAME for an attribute, and most of what a
 * stage stores is an id — so a test that knows which reference it is after,
 * rather than which words, asks for it here.
 */
export async function chooseAttributeById(
  user: HarnessUser,
  field: HTMLElement,
  attributeId: string,
): Promise<void> {
  const dialog = await openAttributePicker(user, field);
  const row = dialog.querySelector<HTMLElement>(
    `[role="option"][data-attribute-id="${attributeId}"]`,
  );
  if (row === null) {
    throw new Error(
      `chooseAttributeById: the window is not offering "${attributeId}". It offers ${JSON.stringify(readOfferedIds(dialog))}.`,
    );
  }
  await user.click(row);
  await waitForTheWindowToClose();
}

const readOfferedIds = (dialog: HTMLElement): string[] =>
  [...dialog.querySelectorAll('[role="option"]')].map(
    (row) => row.getAttribute('data-attribute-id') ?? row.textContent ?? '',
  );

/**
 * Every attribute the window offers, by the id choosing it would store, in the
 * order it offers them. Leaves the window as it found it: closed.
 */
export async function offeredAttributes(
  user: HarnessUser,
  field: HTMLElement,
  term?: string,
): Promise<string[]> {
  const dialog = await openAttributePicker(user, field);
  if (term !== undefined) {
    await user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
      term,
    );
  }
  const offered = readOfferedIds(dialog);
  await closeAttributePicker(user);
  return offered;
}

/** Dismisses the open window, as Escape does. */
export async function closeAttributePicker(user: HarnessUser): Promise<void> {
  await user.keyboard('{Escape}');
  await waitForTheWindowToClose();
}

const waitForTheWindowToClose = async (): Promise<void> => {
  await waitFor(() => {
    if (openWindow() !== null) {
      throw new Error('the attribute window is still open');
    }
  });
};

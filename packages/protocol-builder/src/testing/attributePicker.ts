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

/**
 * The button that opens this field's window.
 *
 * Found by the marker the picker puts on it rather than by its name, because
 * the name is copy: the locale suites mount the same control in Spanish, and a
 * helper that only knew the English would find nothing there. Within one field
 * it is the picker's trigger and nothing else. The names are still asserted —
 * by the tests that are about them.
 */
const triggerOf = (field: HTMLElement): HTMLElement =>
  field.querySelector<HTMLElement>('button[data-field-focus-target]') ??
  within(field).getByRole('button', { name: isTrigger });

/** Opens one picker's window and hands it back. */
export async function openAttributePicker(
  user: HarnessUser,
  field: HTMLElement,
): Promise<HTMLElement> {
  await user.click(triggerOf(field));
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

/**
 * The row the window offers to invent an attribute from the typed name.
 *
 * Named after the name rather than found by position: it is the first row when
 * it is offered at all, and a test that took the first row would pass against
 * a window offering none.
 */
export function createRow(dialog: HTMLElement, name: string): HTMLElement {
  return within(dialog).getByRole('option', {
    name: `Create new attribute called “${name}”.`,
  });
}

/**
 * Invents an attribute of this name through the window, as a researcher does:
 * types it into the search box and takes the create row.
 *
 * Hands the window back rather than waiting for it to close, because what
 * happens next is the thing under test — a slot whose attribute is finished by
 * a name closes it, one that needs a value set opens the codebook's editor on
 * top of it, and a refusal keeps it open on the name to correct.
 */
export async function inventAttribute(
  user: HarnessUser,
  field: HTMLElement,
  attributeName: string,
): Promise<HTMLElement> {
  const dialog = await openAttributePicker(user, field);
  await user.type(
    within(dialog).getByRole('searchbox', {
      name: 'Find or create an attribute',
    }),
    attributeName,
  );
  await user.click(createRow(dialog, attributeName));
  return dialog;
}

/**
 * Whether this picker offers to invent an attribute at all.
 *
 * Asked of a term nothing matches, because that is the only state a create row
 * is offered in. Leaves the window as it found it: closed.
 */
export async function offersCreation(
  user: HarnessUser,
  field: HTMLElement,
  term = 'a name nothing in this codebook has',
): Promise<boolean> {
  const dialog = await openAttributePicker(user, field);
  await user.type(
    within(dialog).getByRole('searchbox', {
      name: 'Find or create an attribute',
    }),
    term,
  );
  const offered =
    within(dialog).queryByRole('option', {
      name: `Create new attribute called “${term}”.`,
    }) !== null;
  await closeAttributePicker(user);
  return offered;
}

/**
 * The create row, asked for in the reader's own language.
 *
 * The window's own words are the picker's — a section that offers creation
 * says so through this row rather than through a control of its own — so a
 * section's locale test names the field and the search box's label and reads
 * the row back. Leaves the window as it found it: closed.
 */
export async function createRowIn(
  user: HarnessUser,
  field: HTMLElement,
  searchLabel: string,
  rowName: (term: string) => string,
  term = 'nuevo',
): Promise<HTMLElement | null> {
  const dialog = await openAttributePicker(user, field);
  await user.type(
    within(dialog).getByRole('searchbox', { name: searchLabel }),
    term,
  );
  const row = within(dialog).queryByRole('option', { name: rowName(term) });
  await closeAttributePicker(user);
  return row;
}

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
 * The two names the window's search box goes by.
 *
 * It says whether this window can invent an attribute, the way the trigger
 * says whether one has been chosen — so a helper that knew only one of the two
 * would find the box at the sites that create and lose it at the sites that
 * only choose. Which name is drawn where is asserted by the tests that are
 * about it.
 */
const isSearchBox = (name: string) =>
  name === 'Find or create an attribute' || name === 'Find an attribute';

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

const offeredRows = (dialog: HTMLElement): HTMLElement[] => [
  ...dialog.querySelectorAll<HTMLElement>('[role="option"]'),
];

/**
 * Whether this row is one the window draws for this search term.
 *
 * An attribute row is, when its name contains the term — which is the window's
 * own filter. A create row is, when it is about exactly the term typed: its
 * key is the term, so every keystroke replaces it with another. An empty term
 * produces no create row at all, so any row that names one is a leftover.
 *
 * Read from the markers rather than from the row's words, which are
 * translated: the locale suites search the same window in Spanish.
 */
const rowIsFor = (row: HTMLElement, term: string): boolean => {
  const created = row.dataset.createName;
  if (created !== undefined) return term !== '' && created === term;
  const name = row.querySelector('data[value]')?.getAttribute('value') ?? '';
  return name.toLowerCase().includes(term.toLowerCase());
};

const describeRow = (row: HTMLElement): string =>
  row.dataset.createName === undefined
    ? (row.querySelector('data[value]')?.getAttribute('value') ?? '(unnamed)')
    : `create “${row.dataset.createName}”`;

/**
 * Waits until the list is the one this term produces, and nothing else.
 *
 * A row the term no longer produces does not leave the DOM in the keystroke
 * that replaced it: the window's list animates, and `AnimatePresence` keeps an
 * exiting row mounted until its exit finishes — one frame later, with
 * animations skipped. So immediately after typing, the list can hold BOTH the
 * row the last keystroke made and the one the keystroke before it made, and a
 * test reading the list by position reads the leftover. On an idle machine the
 * frame lands inside `type()`; under a loaded CI runner it lands after it,
 * which is what made this window's tests fail there and pass here.
 *
 * Waiting on the leftovers rather than on a count, because a count is a claim
 * about what the term produces — which is what the tests are here to assert.
 */
const listSettledOn = async (
  dialog: HTMLElement,
  term: string,
): Promise<void> => {
  await waitFor(() => {
    const leftovers = offeredRows(dialog).filter((row) => !rowIsFor(row, term));
    if (leftovers.length > 0) {
      throw new Error(
        `the list is still showing ${leftovers.length} row(s) from before “${term}” was typed: ${leftovers
          .map(describeRow)
          .join(', ')}`,
      );
    }
  });
};

const typeSearchTerm = async (
  user: HarnessUser,
  box: HTMLElement,
  dialog: HTMLElement,
  term: string,
): Promise<void> => {
  await user.type(box, term);
  await listSettledOn(dialog, term);
};

/**
 * Types a term into the open window's search box, and hands the box back once
 * the list below it is the one that term produces.
 *
 * Clears first, so the term is what the box holds rather than what it holds
 * appended to whatever was there.
 */
export async function searchAttributes(
  user: HarnessUser,
  dialog: HTMLElement,
  term: string,
): Promise<HTMLElement> {
  const box = await clearAttributeSearch(user, dialog);
  await typeSearchTerm(user, box, dialog, term);
  return box;
}

/**
 * Empties the open window's search box, and hands it back once the list below
 * it is the whole list again.
 */
export async function clearAttributeSearch(
  user: HarnessUser,
  dialog: HTMLElement,
): Promise<HTMLElement> {
  const box = within(dialog).getByRole('searchbox', { name: isSearchBox });
  await user.clear(box);
  await listSettledOn(dialog, '');
  return box;
}

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
    await searchAttributes(user, dialog, term);
  }
  const offered = readOfferedIds(dialog);
  await closeAttributePicker(user);
  return offered;
}

/**
 * The attributes this picker offers, read once they are the ones the caller is
 * waiting for. Leaves the window as it found it: closed.
 *
 * The window is opened ONCE and the list inside it watched, which is what a
 * researcher sees as a revision lands. A `waitFor` around `offeredAttributes`
 * instead opens, reads and closes the window on every attempt — a quarter of a
 * second of work per turn on an idle machine, and an order of magnitude more
 * on a loaded CI runner, where the wait then spends its whole budget on the
 * first attempt and fails having never waited for anything.
 */
export async function awaitOfferedAttributes(
  user: HarnessUser,
  field: HTMLElement,
  areRight: (offered: string[]) => void,
): Promise<string[]> {
  const dialog = await openAttributePicker(user, field);
  let offered: string[] = [];
  await waitFor(() => {
    offered = readOfferedIds(dialog);
    areRight(offered);
  });
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
function createRow(dialog: HTMLElement, name: string): HTMLElement {
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
  await typeSearchTerm(
    user,
    within(dialog).getByRole('searchbox', {
      name: 'Find or create an attribute',
    }),
    dialog,
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
 *
 * Both shapes of the row count — the one that offers the name and the one
 * switched off with the reason it cannot be used — because the question here
 * is whether creation is on offer at this site, and a site that offers it
 * draws one or the other for every term. Reading only the enabled row would
 * answer "no" for a name the type already holds, which is the wrong answer to
 * a different question.
 *
 * The default term is a name the schema accepts, so a site that DOES offer
 * creation answers with the enabled row rather than the refusal: a term with a
 * space in it is refused by every picker, and a helper defaulting to one would
 * have read the same thing at every site whatever it allowed.
 */
export async function offersCreation(
  user: HarnessUser,
  field: HTMLElement,
  term = 'aNameNothingInThisCodebookHas',
): Promise<boolean> {
  const dialog = await openAttributePicker(user, field);
  // Either name: this is asked at the sites that cannot create as well, and
  // the box says which of the two it is.
  await searchAttributes(user, dialog, term);
  const offered =
    within(dialog).queryByRole('option', {
      name: `Create new attribute called “${term}”.`,
    }) !== null ||
    within(dialog).queryByRole('option', {
      name: (name) =>
        name.startsWith(`Cannot create attribute named “${term}”:`),
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
  await typeSearchTerm(
    user,
    within(dialog).getByRole('searchbox', { name: searchLabel }),
    dialog,
    term,
  );
  const row = within(dialog).queryByRole('option', { name: rowName(term) });
  await closeAttributePicker(user);
  return row;
}

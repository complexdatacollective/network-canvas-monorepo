import { waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

import { fuzzyMatchScore } from '@codaco/fresco-ui/utils/fuzzyMatch';
import { normalizeCodebookName } from '@codaco/shared-consts';

type HarnessUser = ReturnType<typeof userEvent.setup>;

/**
 * Drives the attribute picker (`fields/VariablePickerField.tsx`) as a
 * researcher does.
 *
 * The picker is a combobox: its trigger shows the chosen attribute, and
 * pressing it opens a popup with a search box and a list. The popup is found
 * by its own marker, `data-attribute-picker-popup`, rather than by role: a
 * picker is often inside a dialog already, and the popup is itself a dialog.
 *
 * Everything here reads markers rather than words, because the locale suites
 * mount the same control in Spanish:
 * - a row's `data-attribute-id` is what choosing it would store, and
 *   `data-unavailable` marks an attribute that is listed but cannot be chosen
 *   here (its reason is shown when it is chosen);
 * - the create row carries `data-create-name` (the name it would create) and
 *   `data-create-state` (`offered`, `invalid`, `busy` or `refused`).
 */

/**
 * A field's own label, which `Field` gives the id `<control id>-label`. A
 * label inside a control, such as an option card's, has none.
 */
export const FIELD_LABEL = 'label[id$="-label"]';

/**
 * One attribute picker, found by the label of the field it answers.
 *
 * Only a field's own label is matched (`FIELD_LABEL`), not an option card's:
 * a choice whose answers repeat a field's name (the pedigree's symbols offer
 * "Sex assigned at birth") draws each answer in a `label` too.
 */
export function attributeField(
  label: string,
  scope: HTMLElement = document.body,
): HTMLElement {
  const labelElement = within(scope).getByText(label, {
    selector: FIELD_LABEL,
  });
  const field = labelElement.closest<HTMLElement>('[data-field-name]');
  if (field === null) {
    throw new Error(
      `attributeField: the label "${label}" is not inside a field. Either it names something other than a field, or the control it names is not rendered through \`Field\`.`,
    );
  }
  return field;
}

/** The names that the popup's search box goes by, for attributes and layouts. */
const SEARCH_BOX_NAMES = new Set([
  'Find or create an attribute',
  'Find an attribute',
  'Find or create a layout',
  'Find a layout',
]);

const isSearchBox = (name: string) => SEARCH_BOX_NAMES.has(name);

const OPEN_POPUP = '[data-attribute-picker-popup][data-open]';

const openPopup = (): HTMLElement | null =>
  document.body.querySelector<HTMLElement>(OPEN_POPUP);

/**
 * The control that opens this field's popup: the combobox trigger, marked as
 * the field's focus target.
 */
export const attributeTrigger = (field: HTMLElement): HTMLElement => {
  const trigger = field.querySelector<HTMLElement>('[data-field-focus-target]');
  if (trigger === null) {
    throw new Error(
      'attributeTrigger: this field has no attribute picker trigger. It may be showing the sentence that says there is nothing to choose from.',
    );
  }
  return trigger;
};

/** The search box at the top of an open popup. */
export const attributeSearchBox = (popup: HTMLElement): HTMLElement =>
  within(popup).getByRole('combobox', { name: isSearchBox });

/** Opens one picker's popup, and hands it back once its search box has focus. */
export async function openAttributePicker(
  user: HarnessUser,
  field: HTMLElement,
): Promise<HTMLElement> {
  await user.click(attributeTrigger(field));
  let popup: HTMLElement | null = null;
  await waitFor(() => {
    popup = openPopup();
    if (popup === null) throw new Error('the attribute popup did not open');
    // Base UI moves focus into the popup on the next frame, and a key typed
    // before then lands on the trigger.
    if (!popup.contains(popup.ownerDocument.activeElement)) {
      throw new Error('the attribute popup has not taken focus yet');
    }
  });
  if (popup === null) throw new Error('the attribute popup did not open');
  return popup;
}

const optionRows = (popup: HTMLElement): HTMLElement[] => [
  ...popup.querySelectorAll<HTMLElement>('[role="option"]'),
];

const attributeRows = (popup: HTMLElement): HTMLElement[] =>
  optionRows(popup).filter((row) => row.dataset.attributeId !== undefined);

const attributeNameOf = (row: HTMLElement): string =>
  row.querySelector('data[value]')?.getAttribute('value') ?? '';

/** The ids of the attributes that the popup lists and that can be chosen. */
const readOfferedIds = (popup: HTMLElement): string[] =>
  attributeRows(popup)
    .filter((row) => row.dataset.unavailable === undefined)
    .flatMap((row) =>
      row.dataset.attributeId === undefined ? [] : [row.dataset.attributeId],
    );

/** The ids of the attributes that the popup lists as not available here. */
const readUnavailableIds = (popup: HTMLElement): string[] =>
  attributeRows(popup)
    .filter((row) => row.dataset.unavailable !== undefined)
    .flatMap((row) =>
      row.dataset.attributeId === undefined ? [] : [row.dataset.attributeId],
    );

const waitForThePopupToClose = async (): Promise<void> => {
  await waitFor(() => {
    if (openPopup() !== null) {
      throw new Error('the attribute popup is still open');
    }
  });
};

/**
 * Picks the attribute with this name, as a researcher does.
 *
 * Waits for the popup to close before answering: the pick is written as it
 * closes, and a test that carried on while it was still on screen would read
 * the field through a popup that still covers it.
 */
export async function chooseAttribute(
  user: HarnessUser,
  field: HTMLElement,
  attributeName: string,
): Promise<void> {
  const popup = await openAttributePicker(user, field);
  const row = within(popup).getByRole('option', { name: attributeName });
  if (row.dataset.unavailable !== undefined) {
    throw new Error(`“${attributeName}” is listed, but cannot be chosen here.`);
  }
  await user.click(row);
  await waitForThePopupToClose();
}

/**
 * Chooses the attribute that the protocol files under this id.
 *
 * The list shows the researcher's NAME for an attribute, and most of what a
 * stage stores is an id — so a test that knows which reference it is after,
 * rather than which words, asks for it here.
 */
export async function chooseAttributeById(
  user: HarnessUser,
  field: HTMLElement,
  attributeId: string,
): Promise<void> {
  const popup = await openAttributePicker(user, field);
  const row = popup.querySelector<HTMLElement>(
    `[role="option"][data-attribute-id="${CSS.escape(attributeId)}"]`,
  );
  if (row === null || row.dataset.unavailable !== undefined) {
    throw new Error(
      `chooseAttributeById: the popup is not offering "${attributeId}". It offers ${JSON.stringify(readOfferedIds(popup))}, and lists ${JSON.stringify(readUnavailableIds(popup))} as not available here.`,
    );
  }
  await user.click(row);
  await waitForThePopupToClose();
}

/**
 * Whether this row is one that the list shows for this search term.
 *
 * An attribute row is, when the term matches its name by the list's own
 * fuzzy match. A create row is, when it is about exactly the name the term
 * would create. An empty term produces no create row at all.
 */
const rowIsFor = (row: HTMLElement, term: string): boolean => {
  const created = row.dataset.createName;
  if (created !== undefined) {
    const name = normalizeCodebookName(term);
    return name !== '' && created === name;
  }
  return fuzzyMatchScore(term, attributeNameOf(row)) !== undefined;
};

/**
 * Waits until the list is the one that this term produces, and nothing else.
 *
 * Waiting on the leftovers rather than on a count, because a count is a claim
 * about what the term produces — which is what the tests are here to assert.
 */
const listSettledOn = async (
  popup: HTMLElement,
  term: string,
): Promise<void> => {
  await waitFor(() => {
    const leftovers = optionRows(popup).filter((row) => !rowIsFor(row, term));
    if (leftovers.length > 0) {
      throw new Error(
        `the list is still showing ${leftovers.length} row(s) from before “${term}” was typed`,
      );
    }
  });
};

const typeSearchTerm = async (
  user: HarnessUser,
  box: HTMLElement,
  popup: HTMLElement,
  term: string,
): Promise<void> => {
  await user.type(box, term);
  await listSettledOn(popup, term);
};

/**
 * Types a term into the open popup's search box, and hands the box back once
 * the list below it is the one that the term produces.
 *
 * Clears first, so the term is what the box contains rather than what it
 * contains appended to whatever was there.
 */
export async function searchAttributes(
  user: HarnessUser,
  popup: HTMLElement,
  term: string,
): Promise<HTMLElement> {
  const box = await clearAttributeSearch(user, popup);
  await typeSearchTerm(user, box, popup, term);
  return box;
}

/**
 * Empties the open popup's search box, and hands it back once the list below
 * it is the whole list again.
 */
export async function clearAttributeSearch(
  user: HarnessUser,
  popup: HTMLElement,
): Promise<HTMLElement> {
  const box = attributeSearchBox(popup);
  await user.clear(box);
  await listSettledOn(popup, '');
  return box;
}

/**
 * Every attribute that the popup offers and that can be chosen, by the id
 * choosing it would store, in the order it lists them. Attributes listed as
 * not available here are left out; `unavailableAttributes` reads those.
 * Leaves the popup as it found it: closed.
 */
export async function offeredAttributes(
  user: HarnessUser,
  field: HTMLElement,
  term?: string,
): Promise<string[]> {
  const popup = await openAttributePicker(user, field);
  if (term !== undefined) {
    await searchAttributes(user, popup, term);
  }
  const offered = readOfferedIds(popup);
  await closeAttributePicker(user);
  return offered;
}

/**
 * Every attribute that the popup lists under "Not available here", by id, in
 * the order it lists them. Leaves the popup as it found it: closed.
 */
export async function unavailableAttributes(
  user: HarnessUser,
  field: HTMLElement,
): Promise<string[]> {
  const popup = await openAttributePicker(user, field);
  const unavailable = readUnavailableIds(popup);
  await closeAttributePicker(user);
  return unavailable;
}

/**
 * The reason the popup gives for one attribute it lists as not available
 * here, read as a researcher reads it: by choosing the attribute, which
 * selects nothing and shows the reason under it. Fails when the attribute is
 * not listed, or is listed as one that can be chosen. Leaves the popup as it
 * found it: closed.
 */
export async function unavailableReason(
  user: HarnessUser,
  field: HTMLElement,
  attributeId: string,
): Promise<string> {
  const popup = await openAttributePicker(user, field);
  const row = popup.querySelector<HTMLElement>(
    `[role="option"][data-attribute-id="${CSS.escape(attributeId)}"]`,
  );
  if (row === null || row.dataset.unavailable === undefined) {
    throw new Error(
      `unavailableReason: the popup does not list "${attributeId}" as not available here. It lists ${JSON.stringify(readUnavailableIds(popup))} as not available, and offers ${JSON.stringify(readOfferedIds(popup))}.`,
    );
  }
  await user.click(row);
  let reason = '';
  await waitFor(() => {
    const shown = row.querySelector<HTMLElement>('[id$="-reason"]');
    if (row.dataset.revealed === undefined || shown === null) {
      throw new Error('the reason has not been shown yet');
    }
    reason = shown.textContent ?? '';
  });
  await closeAttributePicker(user);
  return reason;
}

/**
 * The attributes this picker offers, read once they are the ones the caller is
 * waiting for. Leaves the popup as it found it: closed.
 *
 * The popup is opened ONCE and the list inside it watched, which is what a
 * researcher sees as a revision lands.
 */
export async function awaitOfferedAttributes(
  user: HarnessUser,
  field: HTMLElement,
  areRight: (offered: string[]) => void,
): Promise<string[]> {
  const popup = await openAttributePicker(user, field);
  let offered: string[] = [];
  await waitFor(() => {
    offered = readOfferedIds(popup);
    areRight(offered);
  });
  await closeAttributePicker(user);
  return offered;
}

/** Dismisses the open popup, as Escape does. */
export async function closeAttributePicker(user: HarnessUser): Promise<void> {
  await user.keyboard('{Escape}');
  await waitForThePopupToClose();
}

/** The popup's create row, whatever state it is in, or `null`. */
export const findCreateRow = (popup: HTMLElement): HTMLElement | null =>
  popup.querySelector<HTMLElement>('[role="option"][data-create-name]');

/**
 * Creates an attribute of this name through the popup, as a researcher does:
 * types it into the search box and chooses the create row.
 *
 * Hands the popup back rather than waiting for it to close, because what
 * happens next is the thing under test — a slot whose attribute is finished by
 * a name closes it, one that needs a value set opens the codebook's editor,
 * and a refusal keeps it open on the name to correct.
 */
export async function inventAttribute(
  user: HarnessUser,
  field: HTMLElement,
  attributeName: string,
): Promise<HTMLElement> {
  const popup = await openAttributePicker(user, field);
  await typeSearchTerm(user, attributeSearchBox(popup), popup, attributeName);
  const row = findCreateRow(popup);
  if (row === null || row.dataset.createState !== 'offered') {
    throw new Error(
      row === null
        ? `inventAttribute: the popup offers no create row for “${attributeName}”.`
        : `inventAttribute: the create row for “${attributeName}” is ${row.dataset.createState ?? 'unknown'}: ${row.textContent ?? ''}`,
    );
  }
  await user.click(row);
  return popup;
}

/**
 * Whether this picker offers to create an attribute at all.
 *
 * Asked of a term that nothing matches, because that is the only state a
 * create row is offered in. Both shapes of the row count — the one that offers
 * the name and the one switched off with the reason it cannot be used —
 * because the question here is whether creation is on offer at this site.
 * Leaves the popup as it found it: closed.
 */
export async function offersCreation(
  user: HarnessUser,
  field: HTMLElement,
  term = 'aNameNothingInThisCodebookHas',
): Promise<boolean> {
  const popup = await openAttributePicker(user, field);
  await searchAttributes(user, popup, term);
  const offered = findCreateRow(popup) !== null;
  await closeAttributePicker(user);
  return offered;
}

/**
 * The create row, asked for in the reader's own language: found by the
 * accessible name that `rowName` gives for the term. Leaves the popup as it
 * found it: closed.
 */
export async function createRowIn(
  user: HarnessUser,
  field: HTMLElement,
  searchLabel: string,
  rowName: (term: string) => string,
  term = 'nuevo',
): Promise<HTMLElement | null> {
  const popup = await openAttributePicker(user, field);
  await typeSearchTerm(
    user,
    within(popup).getByRole('combobox', { name: searchLabel }),
    popup,
    term,
  );
  const row = within(popup).queryByRole('option', { name: rowName(term) });
  await closeAttributePicker(user);
  return row;
}

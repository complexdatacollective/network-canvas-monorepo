import { expect, type Locator } from '@playwright/test';

import { writeRichText } from '../rich-text.js';

/**
 * What a list of options a caller wants an attribute to hold looks like.
 */
export type OptionRow = { label: string; value: string };

/**
 * The attribute picker, as `@codaco/protocol-builder`'s
 * `fields/VariablePickerField.tsx` renders it. Facts read from that source:
 *
 * - The field shows one trigger, a `role="combobox"` that carries
 *   `data-field-focus-target`. It is named by the field's label and then by
 *   what it holds: the chosen attribute's pill (a `<data value>` carrying the
 *   researcher's name for it) or the placeholder "Select an attribute".
 * - The trigger opens a popup marked `data-attribute-picker-popup`, a
 *   `role="dialog"` named by the field's label. Base UI keeps a popup mounted
 *   but hidden once it has been used, so the OPEN popup is the one that also
 *   carries `data-open`; a closed picker is one where nothing matches
 *   `[data-attribute-picker-popup][data-open]`. A picker is often inside a
 *   dialog already, so the popup is found by that marker, never by role.
 * - Inside it: a search box (`role="combobox"`) named "Find or create an
 *   attribute" where the caller allows one to be created and "Find an
 *   attribute" where it does not, focused as the popup opens and narrowing the
 *   list by a fuzzy match. Each attribute is a `role="option"` row carrying
 *   `data-attribute-id` and `data-attribute-type`, named exactly as the
 *   attribute is.
 * - Callers no longer leave out the attributes that cannot be chosen: a wrong
 *   type, one another stage writes the other way, one an interface owns. Those
 *   rows are `aria-disabled` and `data-unavailable`, sit in a group named "Not
 *   available here", and choosing one selects nothing — it gains
 *   `data-revealed` and shows the reason under its pill. So a row of the right
 *   NAME is not yet a row that can be chosen, and every helper here takes only
 *   rows that are not `aria-disabled`.
 * - Where the caller allows creation, a typed name puts a create row first,
 *   carrying `data-create-name` and `data-create-state` (`offered`, `invalid`,
 *   `busy` or `refused`) and named "Create “X”". A name that is ALREADY listed
 *   (compared without regard to case, available or not) has no create row, so
 *   a settled list offers the attribute or the create row and never both —
 *   which is what `chooseOrCreateAttribute` waits on.
 * - Choosing, or a create that landed, closes the popup. A create the
 *   codebook refused leaves it open with the name still in the box.
 * - Renaming an attribute is no longer something the picker does: its pill is
 *   a statement, and renaming lives on the Codebook page.
 *
 * Creating an attribute is the create ROW's job everywhere — no section keeps
 * a create button of its own beside a picker any more. What the row does next
 * depends on the kind of answer the slot binds
 * (`sections/create-variable/useCreateAttributeForSlot.ts`):
 *
 * - A kind a name finishes — `text`, `boolean`, `location`, `datetime`,
 *   `number`, and a layout — is made and bound with no dialog at all, and kept
 *   with the stage's draft until the stage is saved.
 * - A kind a name cannot finish — a list of values, a scale, or a value set
 *   the interface owns — escalates to the codebook's own editor, which opens
 *   ALREADY holding the name the row took (`useCreateVariableEditor`'s
 *   `initialDraft`) under a dialog titled with the slot's own words. That
 *   seeding is asserted rather than retyped: this is the only place the suite
 *   reads it back end to end.
 */
const OPEN_POPUP = '[data-attribute-picker-popup][data-open]';

const openPopup = (field: Locator): Locator => field.page().locator(OPEN_POPUP);

/** What the popup calls its offer to invent an attribute under this name. */
const createRowName = (attributeName: string): string =>
  `Create “${attributeName}”`;

/** The control in a field that opens its attribute popup. */
export const attributeTrigger = (field: Locator): Locator =>
  field.locator('[role="combobox"][data-field-focus-target]');

/** The popup's create row, whatever state it is in. */
const createRow = (window: Locator): Locator =>
  window.locator('[role="option"][data-create-name]');

/**
 * Every row of the popup that stands for an attribute, chosen or not, named
 * exactly as the attribute is.
 */
export const attributeRows = (window: Locator, name?: string): Locator =>
  (name === undefined
    ? window.getByRole('option')
    : window.getByRole('option', { name, exact: true })
  ).and(window.locator('[data-attribute-id]'));

/** The attribute rows that can be chosen here. */
export const offeredAttributeRows = (window: Locator, name?: string): Locator =>
  attributeRows(window, name).and(
    window.locator(':not([aria-disabled="true"])'),
  );

/**
 * The attribute rows listed under "Not available here", which choosing
 * explains rather than selects.
 */
export const unavailableAttributeRows = (
  window: Locator,
  name?: string,
): Locator =>
  attributeRows(window, name).and(window.locator('[aria-disabled="true"]'));

/**
 * What a slot's create row escalates to, for the kinds of answer a name alone
 * cannot finish.
 *
 * Omitted where the kind IS finished by a name: the row writes the attribute
 * itself, no dialog opens, and passing one would wait for a dialog that never
 * appears.
 */
export type AttributeEscalation = Readonly<{
  /**
   * The title the escalation dialog carries, which is the slot's own words for
   * inventing its attribute ("Create a new position attribute", …). Whole
   * rather than generic: an editor that binds many slots and a shared
   * title would not say which of them the open dialog is for.
   */
  title: string;
  /**
   * Authors whatever the editor asks for beyond the name — the values of a
   * list, the two ends of a scale. Called with the editor dialog, after its
   * seeded name has been read back and before "Create attribute" is pressed.
   *
   * Omitted for a slot whose values the INTERFACE owns: those arrive seeded
   * and read-only, so the name really is the whole of the authoring.
   */
  author?: (editor: Locator) => Promise<void>;
}>;

/**
 * The names the popup's search box goes by: the attribute picker's two, and
 * the layout picker's two (`fields/LayoutPickerField.tsx`), which renders the
 * same popup over the codebook's layouts.
 */
const SEARCH_BOX_NAME = /^Find (?:or create )?(?:an attribute|a layout)$/;

/** The open popup's search box. */
const searchBox = (window: Locator): Locator =>
  window.getByRole('combobox', { name: SEARCH_BOX_NAME });

/**
 * Opens one field's attribute popup and hands it back once its search box has
 * focus.
 *
 * Focus is waited on, not only visibility: Base UI moves it into the popup a
 * frame after the popup appears, and a key pressed before then lands on the
 * trigger.
 */
export async function openAttributeWindow(field: Locator): Promise<Locator> {
  await attributeTrigger(field).click();
  const window = openPopup(field);
  await expect(window).toBeVisible();
  await expect(searchBox(window)).toBeFocused();
  return window;
}

/**
 * Narrows the open popup to a term.
 *
 * Which name the box goes by — and so whether this popup can create — is
 * asserted by `attribute-picker.spec.ts`, the spec about this control; the
 * helper takes either, because the rule builder's pickers and a narrative
 * preset's grouping attribute only choose.
 */
export async function searchAttributes(
  window: Locator,
  term: string,
): Promise<void> {
  await searchBox(window).fill(term);
}

/**
 * That the field now HOLDS this attribute, and that the popup has gone.
 *
 * Two readings rather than one, because they fail for different reasons. The
 * pill in the trigger is the picker's own statement of what was bound, and it
 * is the only one that would notice a create that landed in the codebook while
 * the slot had moved on (`{ status: 'unassigned' }`), which leaves the
 * codebook richer and this field empty. The popup being gone is what makes it
 * safe for the next helper to drive the dialog underneath.
 */
async function expectFieldHolds(
  field: Locator,
  attributeName: string,
): Promise<void> {
  await expect(attributeTrigger(field).locator('data[value]')).toHaveAttribute(
    'value',
    attributeName,
  );
  await expect(openPopup(field)).toHaveCount(0);
}

/**
 * The reason the open popup gives for one attribute it lists as not available
 * here, read as a researcher reads it: by choosing the row, which selects
 * nothing and shows the reason under it.
 */
export async function unavailableReason(
  window: Locator,
  attributeName: string,
): Promise<string> {
  const row = unavailableAttributeRows(window, attributeName);
  await expect(row).toBeVisible();
  // Forced past Playwright's "enabled" check, which reads `aria-disabled` as
  // disabled. The row is only MARKED unavailable — it stays clickable so that
  // clicking it can explain itself, which is the behaviour read here.
  await row.click({ force: true });
  await expect(row).toHaveAttribute('data-revealed');
  const reason = row.locator('[id$="-reason"]');
  await expect(reason).toBeVisible();
  return (await reason.textContent()) ?? '';
}

/**
 * Takes the row for this attribute from the open popup — failing, with the
 * popup's own reason, when it is listed only as not available here.
 *
 * Asked once the row is listed at all: whether a listed row can be chosen does
 * not depend on the term, so the answer read then is the answer.
 */
async function takeListedAttribute(
  field: Locator,
  window: Locator,
  attributeName: string,
): Promise<void> {
  await expect(attributeRows(window, attributeName).first()).toBeVisible();
  const offered = offeredAttributeRows(window, attributeName);
  if ((await offered.count()) === 0) {
    const reason = await unavailableReason(window, attributeName);
    throw new Error(
      `The attribute picker lists “${attributeName}”, but not as one that can be chosen here: ${reason}`,
    );
  }
  await offered.click();
  await expectFieldHolds(field, attributeName);
}

/**
 * Takes the open popup's create row, and finishes in the editor where the
 * kind of answer escalates to one.
 */
async function takeCreateRow(
  field: Locator,
  window: Locator,
  attributeName: string,
  escalation?: AttributeEscalation,
): Promise<void> {
  const row = createRow(window);
  // Each of these names what went wrong when it fails: a row for some other
  // name, a name the codebook would refuse (`invalid`), or one it did.
  await expect(row).toHaveAttribute('data-create-name', attributeName);
  await expect(row).toHaveAttribute('data-create-state', 'offered');
  await expect(row).toHaveAccessibleName(createRowName(attributeName));
  await row.click();

  if (escalation !== undefined) {
    const editor = field
      .page()
      .getByRole('dialog', { name: escalation.title, exact: true });
    // Read back rather than typed: the row hands the name it took to the
    // editor, and a seam that had stopped doing so would be papered over by a
    // helper that filled the box itself.
    await expect(
      editor.getByRole('textbox', { name: 'Attribute name', exact: true }),
    ).toHaveValue(attributeName);
    await escalation.author?.(editor);
    await editor
      .getByRole('button', { name: 'Create attribute', exact: true })
      .click();
    // The editor holds itself open until its save has been checked and the
    // attribute kept with the stage's draft — so the DIALOG leaving the DOM is
    // the signal that the attribute exists, not the button. Detached rather
    // than hidden: the next slot's dialog animates in over this one's exit.
    await editor.waitFor({ state: 'detached' });
  }

  await expectFieldHolds(field, attributeName);
}

/**
 * Chooses the attribute of this name through the popup.
 *
 * For a picker that only chooses — a rule's operand, a narrative preset's
 * grouping attribute — and for a caller that knows the attribute is already in
 * the codebook. The attribute has to be listed AND available: a name the
 * popup does not list fails on the row that is not there, and one it lists
 * only under "Not available here" fails with the popup's reason.
 */
export async function chooseAttribute(
  field: Locator,
  attributeName: string,
): Promise<void> {
  const window = await openAttributeWindow(field);
  await searchAttributes(window, attributeName);
  await takeListedAttribute(field, window, attributeName);
}

/**
 * Invents an attribute under this name through the popup's create row.
 *
 * For a caller that means to CREATE — a stage built from an empty codebook, a
 * form field inventing the attribute it collects. The row must be on offer, so
 * a name the codebook already lists fails here rather than quietly binding the
 * attribute that was already there.
 */
export async function createAttribute(
  field: Locator,
  attributeName: string,
  escalation?: AttributeEscalation,
): Promise<void> {
  const window = await openAttributeWindow(field);
  await searchAttributes(window, attributeName);
  await takeCreateRow(field, window, attributeName, escalation);
}

/**
 * Chooses the attribute if the codebook already has it, and invents it if not.
 *
 * Which of the two it is depends on what earlier stages of the same protocol
 * have already added, so a caller that had to know would have to track the
 * whole run.
 *
 * The wait is on the two rows TOGETHER rather than on a count of the first:
 * the search box's term reaches the list through a React render, so a reader
 * that asked "is the attribute listed?" the instant after typing could be told
 * no by a list that had not drawn yet and invent a duplicate. Exactly one of
 * the two is ever present once the list has settled — any listed attribute of
 * that name, available or not, suppresses the create row — so this is both
 * the settle and the answer. A listed attribute that cannot be chosen here
 * fails with its reason rather than being created a second time.
 */
export async function chooseOrCreateAttribute(
  field: Locator,
  attributeName: string,
  escalation?: AttributeEscalation,
): Promise<void> {
  const window = await openAttributeWindow(field);
  await searchAttributes(window, attributeName);
  const existing = attributeRows(window, attributeName);
  const create = createRow(window).and(
    window.locator(`[data-create-name=${JSON.stringify(attributeName)}]`),
  );
  await expect(existing.or(create).first()).toBeVisible();
  if (await existing.count()) {
    await takeListedAttribute(field, window, attributeName);
    return;
  }
  await takeCreateRow(field, window, attributeName, escalation);
}

/**
 * Authors a list of values inside an open codebook editor, for the kinds of
 * answer that ARE their values.
 *
 * One "Create new option" press per row, each row exposing its own numbered
 * "Option N label"/"Option N value" boxes. Shared because every slot that
 * escalates for a list authors it the same way, and the numbering is the part
 * a copy gets wrong.
 *
 * The LABEL is markdown — the interview renders an option label as markdown
 * wherever it shows one — so it is written through `writeRichText` rather than
 * filled: emphasis has to be typed to become a mark, and the box is a Tiptap
 * contenteditable that attaches a turn after the field around it renders. The
 * value beside it is an ordinary input.
 */
export function authorOptions(
  options: readonly OptionRow[],
): (editor: Locator) => Promise<void> {
  return async (editor: Locator) => {
    // The loop below is the whole of the authoring, and a caller that passed
    // none would leave an editor the schema refuses — with nothing to say why.
    expect(options.length).toBeGreaterThan(0);
    const addOption = editor.getByRole('button', {
      name: 'Create new option',
      exact: true,
    });
    for (const [index, option] of options.entries()) {
      await addOption.click();
      const position = index + 1;
      await writeRichText(
        editor.getByRole('textbox', {
          name: `Option ${position} label`,
          exact: true,
        }),
        option.label,
      );
      await editor
        .getByRole('textbox', { name: `Option ${position} value`, exact: true })
        .fill(option.value);
    }
  };
}

/**
 * Closes the popup without answering it.
 *
 * Closed is read as "no popup is OPEN", not as the element going: Base UI keeps
 * a used popup mounted, hidden and without `data-open`.
 */
export async function dismissAttributeWindow(window: Locator): Promise<void> {
  await window.page().keyboard.press('Escape');
  await expect(window).toHaveCount(0);
}

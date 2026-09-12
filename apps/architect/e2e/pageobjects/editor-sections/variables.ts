import { expect, type Locator } from '@playwright/test';

/**
 * What a list of options a caller wants an attribute to hold looks like.
 */
export type OptionRow = { label: string; value: string };

/**
 * The attribute picker, as `@codaco/protocol-builder`'s
 * `fields/VariablePickerField.tsx` and `fields/VariableSpotlight.tsx` render
 * it. Facts read from that source:
 *
 * - A field holding a picker shows a trigger button reading "Select attribute"
 *   while nothing is chosen and "Change attribute" once something is, plus the
 *   chosen attribute as a typed pill (or the line "No attribute selected").
 * - The trigger opens one modal window, marked `data-variable-spotlight` and
 *   named after the field's own label. Inside it: a `role="searchbox"` named
 *   "Find or create an attribute" — the same name whether or not this caller
 *   allows one to be created — and one flat `role="listbox"` named "Attribute
 *   results" whose rows are named for the attribute and carry
 *   `data-attribute-type`.
 * - Where the caller allows creation, a term matching nothing puts a row
 *   reading `Create new attribute called “X”.` first; a duplicate name or one
 *   outside `[a-zA-Z0-9._\-:]` makes that row `aria-disabled` with the reason.
 *   A term that matches an offered attribute EXACTLY suppresses the create row
 *   (`offersCreate` is `!exactMatch`), so a settled window offers one or the
 *   other and never both — which is what `chooseOrCreateAttribute` waits on.
 * - Choosing, or a create that landed, closes the window. A create the
 *   codebook refused leaves it open with the name still in the box.
 *
 * Creating an attribute is the create ROW's job everywhere — no section keeps
 * a create button of its own beside a picker any more. What the row does next
 * depends on the kind of answer the slot binds
 * (`sections/create-variable/useCreateAttributeForSlot.ts`):
 *
 * - A kind a name finishes — `text`, `boolean`, `layout`, `location`,
 *   `datetime`, `number` — is written straight to the codebook and bound, and
 *   no dialog opens at all.
 * - A kind a name cannot finish — a list of values, a scale, or a value set
 *   the interface owns — escalates to the codebook's own editor, which opens
 *   ALREADY holding the name the row took (`useCreateVariableEditor`'s
 *   `initialDraft`) under a dialog titled with the slot's own words. That
 *   seeding is asserted rather than retyped: this is the only place the suite
 *   reads it back end to end.
 */
const SPOTLIGHT = '[data-variable-spotlight]';

const TRIGGER = /^(Select|Change) attribute$/u;

/**
 * The window that is OPEN, not every window this page has ever opened.
 *
 * Base UI keeps a dismissed popup mounted — `hidden`, `data-closed` — so a
 * second picker opened after a first one resolved two elements and every
 * reading of "the window" became a strict-mode violation. `data-open` is the
 * attribute that says which of them the researcher is looking at, and an
 * assertion that the window has GONE still holds against it: a window that has
 * closed matches nothing, which is not visible.
 */
const spotlight = (field: Locator): Locator =>
  field.page().locator(`${SPOTLIGHT}[data-open]`);

/** What the window calls its offer to invent an attribute under this name. */
const createRowName = (attributeName: string): string =>
  `Create new attribute called “${attributeName}”.`;

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
   * rather than generic: a pedigree editor binds eight slots and a shared
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

/** Opens one field's attribute window and hands it back. */
export async function openAttributeWindow(field: Locator): Promise<Locator> {
  await field.getByRole('button', { name: TRIGGER }).click();
  const window = spotlight(field);
  await expect(window).toBeVisible();
  return window;
}

/** Narrows the open window to a term. */
export async function searchAttributes(
  window: Locator,
  term: string,
): Promise<void> {
  await window
    .getByRole('searchbox', { name: 'Find or create an attribute' })
    .fill(term);
}

/**
 * That the field now HOLDS this attribute, and that the window has gone.
 *
 * Three readings rather than one, because they fail for different reasons. The
 * pill is the picker's own statement of what was bound — `AttributePill`
 * renders a `<data value>` carrying the researcher's name for it — and it is
 * the only one that would notice a create that landed in the codebook while
 * the slot had moved on (`{ status: 'unassigned' }`), which leaves the
 * codebook richer and this field empty. The trigger's wording is what says a
 * value is held at all, and the window being gone is what makes it safe for
 * the next helper to drive the dialog underneath.
 */
async function expectFieldHolds(
  field: Locator,
  attributeName: string,
): Promise<void> {
  await expect(field.locator('data[value]')).toHaveAttribute(
    'value',
    attributeName,
  );
  await expect(
    field.getByRole('button', { name: 'Change attribute' }),
  ).toBeVisible();
  await expect(spotlight(field)).toBeHidden();
}

/**
 * Takes the open window's create row, and finishes in the editor where the
 * kind of answer escalates to one.
 */
async function takeCreateRow(
  field: Locator,
  window: Locator,
  attributeName: string,
  escalation?: AttributeEscalation,
): Promise<void> {
  await window
    .getByRole('option', { name: createRowName(attributeName), exact: true })
    .click();

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
    // The write takes the codebook section's own lock and the editor holds
    // itself open until the answer lands, renaming its submit while the
    // request is in flight — so the DIALOG leaving the DOM is the signal that
    // the attribute exists, not the button. Detached rather than hidden: the
    // next slot's dialog animates in over this one's exit.
    await editor.waitFor({ state: 'detached' });
  }

  await expectFieldHolds(field, attributeName);
}

/**
 * Chooses the attribute of this name through the window.
 *
 * For a picker that only chooses — a rule's operand, a narrative preset's
 * grouping attribute — and for a caller that knows the attribute is already in
 * the codebook. The attribute has to be on offer: there is no create row to
 * fall back to, so a name this picker is not offering fails on the row that
 * was not there.
 */
export async function chooseAttribute(
  field: Locator,
  attributeName: string,
): Promise<void> {
  const window = await openAttributeWindow(field);
  await searchAttributes(window, attributeName);
  await window
    .getByRole('option', { name: attributeName, exact: true })
    .click();
  await expectFieldHolds(field, attributeName);
}

/**
 * Invents an attribute under this name through the window's create row.
 *
 * For a caller that means to CREATE — a stage built from an empty codebook, a
 * form field inventing the attribute it collects. The row must be on offer, so
 * a name the type already holds fails here rather than quietly binding the
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
 * that asked "is the attribute offered?" the instant after typing could be
 * told no by a list that had not drawn yet and invent a duplicate. Exactly one
 * of the two is ever present once the list has settled — an exact match
 * suppresses the create row — so this is both the settle and the answer.
 */
export async function chooseOrCreateAttribute(
  field: Locator,
  attributeName: string,
  escalation?: AttributeEscalation,
): Promise<void> {
  const window = await openAttributeWindow(field);
  await searchAttributes(window, attributeName);
  const existing = window.getByRole('option', {
    name: attributeName,
    exact: true,
  });
  const create = window.getByRole('option', {
    name: createRowName(attributeName),
    exact: true,
  });
  await expect(existing.or(create)).toBeVisible();
  if (await existing.count()) {
    await existing.click();
    await expectFieldHolds(field, attributeName);
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
      await editor
        .getByRole('textbox', { name: `Option ${position} label`, exact: true })
        .fill(option.label);
      await editor
        .getByRole('textbox', { name: `Option ${position} value`, exact: true })
        .fill(option.value);
    }
  };
}

/** Closes the window without answering it. */
export async function dismissAttributeWindow(window: Locator): Promise<void> {
  await window.page().keyboard.press('Escape');
  await expect(window).toBeHidden();
}

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
 * - Choosing, or a create that landed, closes the window. A create the
 *   codebook refused leaves it open with the name still in the box.
 */
const SPOTLIGHT = '[data-variable-spotlight]';

const TRIGGER = /^(Select|Change) attribute$/u;

const spotlight = (field: Locator): Locator => field.page().locator(SPOTLIGHT);

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
 * Chooses the attribute of this name through the window.
 *
 * The trigger flipping to "Change attribute" is the oracle: the pick is
 * written as the window closes, and a test that carried on before it had would
 * be reading a field a modal still covers.
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
  await expect(
    field.getByRole('button', { name: 'Change attribute' }),
  ).toBeVisible();
  await expect(window).toBeHidden();
}

/**
 * Creates an attribute under this name through the window's create row.
 *
 * Only for a picker whose caller offers creation; the row is absent otherwise,
 * and the failure then names the row that was not there rather than timing out
 * on a trigger that never changed.
 */
export async function createAttribute(
  field: Locator,
  attributeName: string,
): Promise<void> {
  const window = await openAttributeWindow(field);
  await searchAttributes(window, attributeName);
  await window
    .getByRole('option', {
      name: `Create new attribute called “${attributeName}”.`,
      exact: true,
    })
    .click();
  // The create is a round trip through the host, and the codebook can refuse
  // the name — in which case the window stays open on it. Nothing below may
  // run until the field holds the attribute.
  await expect(
    field.getByRole('button', { name: 'Change attribute' }),
  ).toBeVisible();
  await expect(window).toBeHidden();
}

/**
 * Chooses the attribute if the codebook already has it, and creates it if not.
 *
 * Which of the two it is depends on what earlier stages of the same protocol
 * have already added, so a caller that had to know would have to track the
 * whole run.
 */
export async function chooseOrCreateAttribute(
  field: Locator,
  attributeName: string,
): Promise<void> {
  const window = await openAttributeWindow(field);
  await searchAttributes(window, attributeName);
  const existing = window.getByRole('option', {
    name: attributeName,
    exact: true,
  });
  if (await existing.count()) {
    await existing.click();
  } else {
    await window
      .getByRole('option', {
        name: `Create new attribute called “${attributeName}”.`,
        exact: true,
      })
      .click();
  }
  await expect(
    field.getByRole('button', { name: 'Change attribute' }),
  ).toBeVisible();
  await expect(window).toBeHidden();
}

/**
 * Chooses the attribute if this picker offers it, and answers `false` when it
 * does not — leaving the window closed either way.
 *
 * For the sections that still keep a create button of their own beside the
 * picker: they choose what exists and fall back to that button, and neither
 * half can decide which it is without looking. A picker with nothing to offer
 * and nothing to create renders no trigger at all, which is the first thing
 * this answers for.
 */
export async function chooseAttributeIfOffered(
  field: Locator,
  attributeName: string,
): Promise<boolean> {
  if (!(await field.getByRole('button', { name: TRIGGER }).count())) {
    return false;
  }
  const window = await openAttributeWindow(field);
  await searchAttributes(window, attributeName);
  // Compared whole rather than by substring: an attribute called "layout"
  // must not be answered by an existing "layout_2".
  const offered = window.getByRole('option', {
    name: attributeName,
    exact: true,
  });
  if (!(await offered.count())) {
    await dismissAttributeWindow(window);
    return false;
  }
  await offered.click();
  await expect(
    field.getByRole('button', { name: 'Change attribute' }),
  ).toBeVisible();
  await expect(window).toBeHidden();
  return true;
}

/** Closes the window without answering it. */
export async function dismissAttributeWindow(window: Locator): Promise<void> {
  await window.page().keyboard.press('Escape');
  await expect(window).toBeHidden();
}

import { screen, userEvent, waitFor, within } from 'storybook/test';

import type { NodeContextMenuAction } from './pedigree-layout/components/NodeContextMenu';

/**
 * Shared play-function helpers for the FamilyPedigree stories. Kept in a plain
 * `.ts` module (not a `*.stories.tsx`) so Storybook does not index it as a story
 * file.
 *
 * Elements are targeted by stable `data-testid` / `data-value` hooks rather than
 * by visible copy or DOM order: wizard/dialog chrome exposes `data-testid`
 * (`wizard-next`, `dialog-submit`, …), form options expose `data-value`
 * (`String(option.value)`) scoped by the field's `data-field-name`, and the
 * pedigree canvas exposes `pedigree-*` test-ids. This decouples the stories from
 * label wording and radio ordering, which previously caused churn whenever copy
 * or field layout changed.
 */

export const WIZARD_TIMEOUT = { timeout: 8000 };

export async function getDialog() {
  return screen.findByRole('dialog', {}, WIZARD_TIMEOUT);
}

/** Open the quick-start wizard from its floating get-started button. */
export async function clickGetStarted() {
  const btn = await screen.findByTestId(
    'pedigree-get-started',
    {},
    WIZARD_TIMEOUT,
  );
  await userEvent.click(btn);
  await getDialog();
}

/** Advance a wizard step (the primary button, whether labelled Continue or Finish). */
export async function clickNext() {
  const dialog = await getDialog();
  await userEvent.click(within(dialog).getByTestId('wizard-next'));
}

/** Submit a form-type dialog (the AddPerson "Add"/"Done" submitter). */
export async function clickDialogSubmit() {
  const dialog = await getDialog();
  await userEvent.click(within(dialog).getByTestId('dialog-submit'));
}

/** Confirm an acknowledge/choice dialog via its primary action (e.g. "Got it"). */
export async function clickDialogPrimary() {
  const dialog = await getDialog();
  await userEvent.click(within(dialog).getByTestId('dialog-primary'));
}

/**
 * Fill one field inside the open dialog, located by its `data-field-name`.
 *
 * Option-based fields (Boolean/Radio/RichSelect) are matched by `data-value`
 * first, falling back to the option's accessible label — the fallback covers
 * people-pickers whose option values are generated node ids (e.g. ego, listed as
 * "You"). Booleans map to `data-value="true"|"false"`, numbers drive the
 * stepper, everything else types into the text input.
 */
export async function setFieldInput(
  fieldName: string,
  value: boolean | string | number,
) {
  const dialog = await getDialog();
  const container = dialog.querySelector(
    `[data-field-name="${CSS.escape(fieldName)}"]`,
  );
  if (!(container instanceof HTMLElement))
    throw new Error(`No field found with data-field-name="${fieldName}"`);

  if (typeof value === 'boolean') {
    const toggle = container.querySelector('[role="switch"]');
    if (toggle) {
      const isChecked = toggle.getAttribute('aria-checked') === 'true';
      if (isChecked !== value) await userEvent.click(toggle);
      return;
    }
    const target = container.querySelector(
      `[role="radio"][data-value="${value ? 'true' : 'false'}"]`,
    );
    if (!target)
      throw new Error(`No radio for value=${String(value)} in "${fieldName}"`);
    await userEvent.click(target);
    return;
  }

  if (typeof value === 'number') {
    const input = within(container).getByRole<HTMLInputElement>('spinbutton');
    const currentValue = Number(input.value) || 0;
    const diff = value - currentValue;
    if (diff === 0) return;

    const wrapper = input.parentElement?.parentElement;
    const label = diff > 0 ? 'Increase value' : 'Decrease value';
    const stepBtn = wrapper?.querySelector(`button[aria-label="${label}"]`);
    if (!stepBtn) throw new Error(`No ${label} button in "${fieldName}"`);
    for (let i = 0; i < Math.abs(diff); i++) await userEvent.click(stepBtn);
    return;
  }

  const options = container.querySelectorAll('[role="radio"], [role="option"]');
  if (options.length > 0) {
    const byValue = Array.from(options).find(
      (o) => o.getAttribute('data-value') === value,
    );
    const byLabel = Array.from(options).find(
      (o) => o.getAttribute('aria-label') === value,
    );
    const target = byValue ?? byLabel;
    if (!target)
      throw new Error(`No option matching "${value}" in "${fieldName}"`);
    await userEvent.click(target);
    return;
  }

  const input = within(container).getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, value);
}

/**
 * Set one cell of a partnership matrix. The matrix for `focalId` lists every
 * parent below it; `partnerLabel` is the row's displayed label (a name, or a
 * role fallback like "your sperm parent"). `optionValue` is a matrix option
 * value (`current` / `ex` / `none`). Rows left at the default need no call.
 */
export async function setPartnership(
  focalId: string,
  partnerLabel: string,
  optionValue: string,
) {
  const dialog = await getDialog();
  const matrix = dialog.querySelector(
    `[data-field-name="${CSS.escape(`partnerships.${focalId}`)}"]`,
  );
  if (!(matrix instanceof HTMLElement))
    throw new Error(`No partnership matrix for focal "${focalId}"`);
  const group = within(matrix).getByRole('radiogroup', { name: partnerLabel });
  const radio = group.querySelector(
    `[role="radio"][data-value="${optionValue}"]`,
  );
  if (!radio)
    throw new Error(
      `No "${optionValue}" option for partner "${partnerLabel}" under "${focalId}"`,
    );
  await userEvent.click(radio);
}

/**
 * Answer the "About you" (EgoSexStep) biological-sex question and continue. It
 * follows any Introduction/FramingSelection steps and precedes the parent steps.
 */
export async function selectEgoSex(value = 'female') {
  await setFieldInput('biologicalSex', value);
  await clickNext();
}

/** Choose a framing option (`gamete` / `gendered`) on the FramingSelectionStep. */
export async function selectFraming(value: 'gamete' | 'gendered') {
  const dialog = await getDialog();
  const option = dialog.querySelector(`[role="option"][data-value="${value}"]`);
  if (!option) throw new Error(`No framing option with data-value="${value}"`);
  await userEvent.click(option);
}

/** Open a pedigree node's context menu by the node's display name. */
export async function openNodeContextMenu(nodeName: string) {
  const nodeBtn = await screen.findByRole(
    'button',
    { name: nodeName },
    WIZARD_TIMEOUT,
  );
  await userEvent.click(nodeBtn);
  await screen.findByRole('menu', {}, WIZARD_TIMEOUT);
}

/** Locate a node context-menu item by its action (does not click it). */
export function getMenuItem(action: NodeContextMenuAction) {
  return screen.getByTestId(`pedigree-menu-${action}`);
}

/** Click a node context-menu item by its action. */
export async function clickMenuItem(action: NodeContextMenuAction) {
  const item = await screen.findByTestId(
    `pedigree-menu-${action}`,
    {},
    WIZARD_TIMEOUT,
  );
  // The menu inherits pointer-events:none from its backdrop during the open
  // animation; wait for the item to become interactive before clicking, or
  // userEvent rejects the pointer interaction.
  await waitFor(() => {
    if (getComputedStyle(item).pointerEvents === 'none') {
      throw new Error('menu item not yet interactive');
    }
  });
  await userEvent.click(item);
}

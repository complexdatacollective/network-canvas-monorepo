import type { Locator } from '@playwright/test';

/**
 * The single Playwright driver for a FamilyPedigree wizard form field.
 *
 * Deliberately a leaf module whose only import is `@playwright/test`, and a
 * free function taking the scope rather than a fixture method: the same wizard
 * is driven from two harnesses that cannot share a fixture class —
 * `FamilyPedigreeFixture` here, and Architect's `family-pedigree-preview`
 * spec, which drives it inside a preview popup window with its own page
 * object stack. Both import this; neither ports it. The earlier Architect copy
 * had already drifted to a subset (no number branch, no accessible-name
 * fallback for options), which is how a shared driver stops being shared.
 *
 * Ported from the Storybook play-function helper
 * `packages/interview/src/interfaces/FamilyPedigree/familyPedigreeWizardHelpers.ts`
 * (`setFieldInput`, lines 63-122). That one drives the DOM through
 * `userEvent`/`screen` and cannot be reused from Playwright, so it stays a
 * separate implementation of the same contract.
 */

/**
 * Locate a form field container within `scope` by its `data-field-name`
 * (stamped at `fresco-ui/src/form/hooks/useField.ts`), namespaced for wizard
 * sub-forms — e.g. `egg-parent.name`.
 */
export function pedigreeField(scope: Locator, fieldName: string): Locator {
  return scope.locator(`[data-field-name="${fieldName}"]`);
}

/**
 * Fill one field inside `scope`.
 *
 * Booleans map to a switch (`role="switch"`) or a true/false radio pair
 * (`data-value`); numbers drive a stepper via its Increase/Decrease value
 * button; option fields (radio/rich-select) match by `data-value` first,
 * falling back to accessible name; everything else types into the text input.
 */
export async function setPedigreeField(
  scope: Locator,
  fieldName: string,
  value: boolean | string | number,
): Promise<void> {
  const container = pedigreeField(scope, fieldName);

  if (typeof value === 'boolean') {
    const toggle = container.getByRole('switch');
    if (await toggle.count()) {
      const isChecked = (await toggle.getAttribute('aria-checked')) === 'true';
      if (isChecked !== value) await toggle.click();
      return;
    }
    await container
      .locator(`[role="radio"][data-value="${value ? 'true' : 'false'}"]`)
      .click();
    return;
  }

  if (typeof value === 'number') {
    const input = container.getByRole('spinbutton');
    const current = Number((await input.inputValue()) || '0');
    const diff = value - current;
    if (diff === 0) return;
    const label = diff > 0 ? 'Increase value' : 'Decrease value';
    const stepButton = container.getByRole('button', { name: label });
    for (let step = 0; step < Math.abs(diff); step += 1)
      await stepButton.click();
    return;
  }

  const options = container.locator('[role="radio"], [role="option"]');
  if (await options.count()) {
    const byValue = container.locator(
      `[role="radio"][data-value="${value}"], [role="option"][data-value="${value}"]`,
    );
    if (await byValue.count()) {
      await byValue.first().click();
      return;
    }
    await container.getByRole('radio', { name: value }).click();
    return;
  }

  await container.getByRole('textbox').fill(value);
}

/**
 * Set one cell of a partnership matrix. `focalId` is the wizard's temp id for
 * the row-owning person (e.g. `'egg-parent'`); `partnerLabel` is the row's
 * displayed label (a name, or a role fallback like "your sperm parent" for
 * unnamed people). Ported from `familyPedigreeWizardHelpers.ts:130-150`
 * `setPartnership`.
 */
export async function setPedigreePartnership(
  scope: Locator,
  focalId: string,
  partnerLabel: string,
  value: 'current' | 'ex' | 'none',
): Promise<void> {
  const matrix = pedigreeField(scope, `partnerships.${focalId}`);
  const group = matrix.getByRole('radiogroup', { name: partnerLabel });
  await group.locator(`[role="radio"][data-value="${value}"]`).click();
}

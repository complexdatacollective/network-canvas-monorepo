import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Fixture for FamilyPedigree stages.
 *
 * Drives the quick-start wizard (a single multi-step dialog sharing the repo's
 * generic wizard/dialog chrome — `wizard-next`
 * (`fresco-ui/src/dialogs/useWizardState.tsx:258`), and the acknowledge/confirm
 * dialogs' `dialog-submit` (`DialogProvider.tsx:585`) / `dialog-primary`
 * (`DialogProvider.tsx:485,544`) test-ids), the pedigree canvas (nodes render
 * as accessible buttons named by their display label — `PedigreeNode.tsx:184-190`
 * passes `ariaLabel={displayLabel}` into fresco-ui's `Node`, which renders a
 * native `<motion.button aria-label=…>` at `fresco-ui/src/Node.tsx:294-304`),
 * the node context menu, and the floating completeness checklist.
 *
 * Ported from the Storybook play-function helpers at
 * `packages/interview/src/interfaces/FamilyPedigree/familyPedigreeWizardHelpers.ts`
 * (storybook/test `userEvent`/`screen` → Playwright `Locator`s). Owned by the
 * FamilyPedigree matrix scenarios; instantiated directly in each scenario's
 * `run()` rather than hung off StageFixture.
 */
export class FamilyPedigreeFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Floating button that opens the quick-start wizard.
   * Source: components/wizards/EgoCellWizard.tsx:195
   * (`data-testid="pedigree-get-started"`).
   */
  get getStartedButton(): Locator {
    return this.page.getByTestId('pedigree-get-started');
  }

  /** The currently open wizard/confirm/acknowledge dialog (shared dialog
   * chrome — fresco-ui/src/dialogs/useWizardState.tsx + DialogProvider.tsx). */
  get dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async clickGetStarted(): Promise<void> {
    await this.getStartedButton.click();
    await expect(this.dialog).toBeVisible();
  }

  /** Advance a wizard step via its primary action ("Continue"/"Finish").
   * Source: fresco-ui/src/dialogs/useWizardState.tsx:258 (`data-testid="wizard-next"`). */
  async clickWizardNext(): Promise<void> {
    await this.dialog.getByTestId('wizard-next').click();
  }

  /** Submit a form-type dialog (the AddPerson "Add"/"Done" submitter).
   * Source: fresco-ui/src/dialogs/DialogProvider.tsx:585 (`data-testid="dialog-submit"`). */
  async clickDialogSubmit(): Promise<void> {
    await this.dialog.getByTestId('dialog-submit').click();
  }

  /** Confirm an acknowledge dialog (e.g. "Return to editing" / "OK" on
   * "Pedigree is incomplete"). Source: fresco-ui/src/dialogs/DialogProvider.tsx:485,544
   * (`data-testid="dialog-primary"`). */
  async clickDialogPrimary(): Promise<void> {
    await this.dialog.getByTestId('dialog-primary').click();
  }

  private field(fieldName: string): Locator {
    // `data-field-name` is set at fresco-ui/src/form/hooks/useField.ts:321,
    // namespaced e.g. `egg-parent.name`.
    return this.dialog.locator(`[data-field-name="${fieldName}"]`);
  }

  /**
   * Fill one field inside the open dialog, located by its `data-field-name`
   * (namespaced e.g. `egg-parent.name`). Ported from
   * familyPedigreeWizardHelpers.ts:63-122 `setFieldInput`: booleans map to a
   * switch (`role="switch"`) or a true/false radio pair (`data-value`); numbers
   * drive a stepper via its Increase/Decrease value button; option fields
   * (radio/rich-select) match by `data-value` first, falling back to accessible
   * name; everything else types into the text input.
   */
  async setField(
    fieldName: string,
    value: boolean | string | number,
  ): Promise<void> {
    const container = this.field(fieldName);

    if (typeof value === 'boolean') {
      const toggle = container.getByRole('switch');
      if (await toggle.count()) {
        const isChecked =
          (await toggle.getAttribute('aria-checked')) === 'true';
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
      const stepBtn = container.getByRole('button', { name: label });
      for (let i = 0; i < Math.abs(diff); i++) await stepBtn.click();
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
   * unnamed people); `value` is the matrix option. Ported from
   * familyPedigreeWizardHelpers.ts:130-150 `setPartnership`.
   */
  async setPartnership(
    focalId: string,
    partnerLabel: string,
    value: 'current' | 'ex' | 'none',
  ): Promise<void> {
    const matrix = this.field(`partnerships.${focalId}`);
    const group = matrix.getByRole('radiogroup', { name: partnerLabel });
    await group.locator(`[role="radio"][data-value="${value}"]`).click();
  }

  /** Answer "About you" (EgoSexStep biological-sex question) and continue.
   * Ported from familyPedigreeWizardHelpers.ts:156-159 `selectEgoSex`. */
  async selectEgoSex(
    value: 'female' | 'male' | 'intersex' | 'unknown' = 'female',
  ): Promise<void> {
    await this.setField('biologicalSex', value);
    await this.clickWizardNext();
  }

  /** Choose a framing option (`gamete`/`gendered`) on FramingSelectionStep.
   * `FramingSelectionStep` renders a `RichSelectGroupField`, whose options carry
   * `data-value={String(option.value)}` with `role="option"`. Ported from
   * familyPedigreeWizardHelpers.ts:162-167 `selectFraming`. */
  async selectFraming(value: 'gamete' | 'gendered'): Promise<void> {
    await this.dialog.locator(`[role="option"][data-value="${value}"]`).click();
  }

  /** Open a pedigree node's context menu by its display name (the node's
   * accessible name). Ported from familyPedigreeWizardHelpers.ts:170-178
   * `openNodeContextMenu`. */
  async openNodeContextMenu(nodeName: string): Promise<void> {
    await this.page
      .getByRole('button', { name: nodeName, exact: true })
      .click();
    await expect(this.page.getByRole('menu')).toBeVisible();
  }

  /**
   * Click a node context-menu item. The menu inherits `pointer-events:none`
   * from its backdrop during the open animation (repo-wide base-ui menu race),
   * so this waits for it to clear before clicking — ported from
   * familyPedigreeWizardHelpers.ts:186-201 `clickMenuItem`.
   * Source of test-ids: pedigree-layout/components/NodeContextMenu.tsx:59-103.
   */
  async clickMenuItem(
    action: 'parent' | 'child' | 'partner' | 'sibling' | 'edit' | 'delete',
  ): Promise<void> {
    const item = this.page.getByTestId(`pedigree-menu-${action}`);
    await expect(item).toBeVisible();
    await expect
      .poll(() => item.evaluate((el) => getComputedStyle(el).pointerEvents))
      .not.toBe('none');
    await item.click();
  }

  /** The floating completeness-checklist widget.
   * Source: components/PedigreeChecklist.tsx:394 (`data-testid="pedigree-checklist"`). */
  get checklist(): Locator {
    return this.page.getByTestId('pedigree-checklist');
  }

  /** A single checklist item by its id (e.g. `'boundary-grandparents'`,
   * `'children'`, `'partner'`). Has `data-required`/`data-done` attributes.
   * Source: components/PedigreeChecklist.tsx:423. */
  checklistItem(id: string): Locator {
    return this.page.getByTestId(`pedigree-checklist-item-${id}`);
  }

  /** Toggle a checklist item's manually-checked-done state by clicking it. */
  async toggleChecklistItem(id: string): Promise<void> {
    await this.checklistItem(id).click();
  }

  /** The "Finalize family pedigree" button — only rendered once every checklist
   * item is done. Source: components/PedigreeChecklist.tsx:479
   * (`data-testid="pedigree-checklist-finalize"`). */
  get finalizeChecklistButton(): Locator {
    return this.page.getByTestId('pedigree-checklist-finalize');
  }

  /** Dismiss the post-quick-start "Building the rest of your pedigree" hint that
   * opens once the wizard commits its pedigree. Suppressed in Storybook via
   * SuppressPedigreeHintContext, but shown to real participants (and therefore
   * in the e2e host), where its backdrop intercepts pointer events until
   * acknowledged. Source: FamilyPedigree.tsx:560 + buildPedigreeDialog.tsx. */
  async dismissBuildHint(): Promise<void> {
    await expect(
      this.dialog.getByText('Building the rest of your pedigree'),
    ).toBeVisible();
    await this.clickDialogPrimary();
  }

  /** Click the shared confirm dialog's "Finalize" action (the confirm dialog
   * shown by FamilyPedigree.tsx:341-351 before committing the pedigree). */
  async confirmFinalize(): Promise<void> {
    await expect(
      this.dialog.getByText('Finalize your family pedigree?'),
    ).toBeVisible();
    await this.dialog.getByRole('button', { name: 'Finalize' }).click();
  }

  /** A pedigree node rendered on the canvas, located by its display label (its
   * accessible name). Clicking it opens the context menu pre-finalize, or
   * toggles the active nomination attribute post-finalize during a nomination
   * step (`aria-pressed`). */
  node(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }
}

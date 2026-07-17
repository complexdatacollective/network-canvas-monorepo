import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Enrols a real vault by driving the setup wizard (a valid unlockable record
// requires real crypto — it cannot be hand-seeded), and unlocks via LockScreen.
export class VaultFixture {
  constructor(private page: Page) {}

  private async typeSegmented(
    fieldName: string,
    digits: string,
  ): Promise<void> {
    const inputs = this.page
      .getByTestId(`segmented-code-${fieldName}`)
      .locator('input');
    for (let i = 0; i < digits.length; i++) {
      await inputs.nth(i).fill(digits[i] ?? '');
    }
  }

  // Drives the shared /welcome wizard flow, deferring only the two
  // method-specific steps (picking the method at step 2, filling its fields at
  // step 3) so enrolPin/enrolPassphrase can't drift apart if the wizard changes.
  // Confirmed steps (headed run): 0 intro → 1 securing-data → 2 method
  // → 3 configure → 4 behaviour → 5 analytics(Finish). "Get started" opens the
  // dialog at step 0.
  private async runWizard(
    selectMethod: () => Promise<void>,
    configure: () => Promise<void>,
  ): Promise<void> {
    await this.page.goto('/welcome');
    await this.page.getByRole('button', { name: 'Get started' }).click();
    await this.page.getByTestId('wizard-next').click(); // 0 → 1
    await this.page.getByTestId('wizard-next').click(); // 1 → 2 (method)
    await selectMethod();
    await this.page.getByTestId('wizard-next').click(); // 2 → 3 (configure)
    await configure();
    await this.page.getByTestId('wizard-next').click(); // 3 → 4 (behaviour)
    await this.page.getByTestId('wizard-next').click(); // 4 → 5 (analytics)
    await this.page.getByTestId('wizard-next').click(); // 5 → Finish
    // Wizard completes → redirect to Home unlocked.
    await expect(this.page).toHaveURL(/\/$/, { timeout: 15_000 });
  }

  async enrolPin(pin: string): Promise<void> {
    await this.runWizard(
      // Step 2: pick PIN (option carries data-value="pin").
      () => this.page.locator('[data-value="pin"]').click(),
      // Step 3: enter + confirm PIN, affirm no-recovery.
      async () => {
        await this.typeSegmented('pin', pin);
        await this.typeSegmented('pin-confirm', pin);
        await this.page
          .getByRole('checkbox', { name: /I understand there is no recovery/ })
          .check();
      },
    );
  }

  async enrolPassphrase(phrase: string): Promise<void> {
    await this.runWizard(
      () => this.page.locator('[data-value="passphrase"]').click(),
      // Step3PassphraseConfigure labels its fields "Enter passphrase" /
      // "Confirm passphrase" (not the field name), and Next stays disabled
      // until the no-recovery checkbox is also checked.
      async () => {
        await this.page
          .getByLabel('Enter passphrase', { exact: true })
          .fill(phrase);
        await this.page
          .getByLabel('Confirm passphrase', { exact: true })
          .fill(phrase);
        await this.page
          .getByRole('checkbox', { name: /I understand there is no recovery/ })
          .check();
      },
    );
  }

  async unlockPin(pin: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    // PIN auto-submits on completion — there is no manual fallback: the
    // unlock-submit button is disabled until the code is complete, and once
    // complete the form submits itself (clicking the disabled button would just
    // hang). If a submit is ever missed, the caller's unlock assertion (e.g.
    // "Sample Protocol" visible) fails loudly rather than passing silently.
    await this.typeSegmented('pin', pin);
  }

  async confirmPin(pin: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Confirm your identity' }),
    ).toBeVisible();
    await this.typeSegmented('pin', pin);
  }

  async unlockPassphrase(phrase: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await this.page.getByTestId('passphrase-input').fill(phrase);
    await this.page.getByTestId('unlock-submit').click();
  }
}

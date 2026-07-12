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

  async enrolPin(pin: string): Promise<void> {
    // The wizard is reachable directly at /welcome regardless of install state.
    // Confirmed steps (headed run): 0 intro → 1 securing-data → 2 method
    // → 3 configure → 4 behaviour → 5 analytics(Finish). "Get started" opens
    // the dialog at step 0.
    await this.page.goto('/welcome');
    await this.page.getByRole('button', { name: 'Get started' }).click();
    await this.page.getByTestId('wizard-next').click(); // 0 → 1
    await this.page.getByTestId('wizard-next').click(); // 1 → 2 (method)
    // Step 2: pick PIN (option carries data-value="pin").
    await this.page.locator('[data-value="pin"]').click();
    await this.page.getByTestId('wizard-next').click(); // 2 → 3 (configure)
    // Step 3: enter + confirm PIN, affirm no-recovery.
    await this.typeSegmented('pin', pin);
    await this.typeSegmented('pin-confirm', pin);
    await this.page
      .getByRole('checkbox', { name: /I understand there is no recovery/ })
      .check();
    await this.page.getByTestId('wizard-next').click(); // 3 → 4 (behaviour)
    await this.page.getByTestId('wizard-next').click(); // 4 → 5 (analytics)
    await this.page.getByTestId('wizard-next').click(); // 5 → Finish
    // Wizard completes → redirect to Home unlocked.
    await expect(this.page).toHaveURL(/\/$/, { timeout: 15_000 });
  }

  async enrolPassphrase(phrase: string): Promise<void> {
    await this.page.goto('/welcome');
    await this.page.getByRole('button', { name: 'Get started' }).click();
    await this.page.getByTestId('wizard-next').click(); // 0 → 1
    await this.page.getByTestId('wizard-next').click(); // 1 → 2 (method)
    await this.page.locator('[data-value="passphrase"]').click();
    await this.page.getByTestId('wizard-next').click(); // 2 → 3 (configure)
    // Step3PassphraseConfigure labels its fields "Enter passphrase" /
    // "Confirm passphrase" (not the field name), and Next stays disabled
    // until the no-recovery checkbox is also checked.
    await this.page
      .getByLabel('Enter passphrase', { exact: true })
      .fill(phrase);
    await this.page
      .getByLabel('Confirm passphrase', { exact: true })
      .fill(phrase);
    await this.page
      .getByRole('checkbox', { name: /I understand there is no recovery/ })
      .check();
    await this.page.getByTestId('wizard-next').click(); // 3 → 4 (behaviour)
    await this.page.getByTestId('wizard-next').click(); // 4 → 5 (analytics)
    await this.page.getByTestId('wizard-next').click(); // 5 → Finish
    await expect(this.page).toHaveURL(/\/$/, { timeout: 15_000 });
  }

  async unlockPin(pin: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await this.typeSegmented('pin', pin);
    // PIN auto-submits on completion; unlock-submit is a fallback.
  }

  async unlockPassphrase(phrase: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await this.page.getByTestId('passphrase-input').fill(phrase);
    await this.page.getByTestId('unlock-submit').click();
  }
}

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Seeds encrypted synthetic sessions through the real Settings → Synthetic data
// flow (runs generateNetwork + createSession, honest encryption path). A
// protocol must be installed first (the generator needs a protocolHash).
export class SeedFixture {
  constructor(private page: Page) {}

  async synthetic(count: number): Promise<void> {
    await this.page.getByTestId('settings-trigger').click();
    await this.page.getByRole('tab', { name: 'Synthetic data' }).click();

    const countField = this.page.getByTestId('synthetic-count');
    await countField.fill(String(count));

    await this.page.getByTestId('synthetic-generate').click();
    await expect(
      this.page.getByText(new RegExp(`Generated ${count} synthetic session`)),
    ).toBeVisible({ timeout: 30_000 });

    // Close the settings dialog.
    await this.page.keyboard.press('Escape');
  }
}

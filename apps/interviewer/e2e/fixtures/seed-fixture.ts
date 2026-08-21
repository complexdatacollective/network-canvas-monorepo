import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Seeds encrypted synthetic sessions through the real Settings → Synthetic data
// flow (runs generateInterviews + createSession, honest encryption path). A
// protocol must be installed first (the generator needs a protocolHash).
export class SeedFixture {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * @param seed pins the batch. The generator is a pure function of it, so a
   * seeded batch has a known complete/in-progress split and known per-session
   * networks — which is what lets a spec assert counts instead of ranges.
   * Omitted, the app draws its own seed and the batch is whatever it is.
   */
  async synthetic(count: number, seed?: number): Promise<void> {
    await this.page.getByTestId('settings-trigger').click();
    await this.page.getByRole('tab', { name: 'Synthetic data' }).click();

    const countField = this.page.getByTestId('synthetic-count');
    await countField.fill(String(count));

    if (seed !== undefined) {
      await this.page.getByTestId('synthetic-seed').fill(String(seed));
    }

    await this.page.getByTestId('synthetic-generate').click();
    await expect(
      this.page.getByText(new RegExp(`Generated ${count} synthetic session`)),
    ).toBeVisible({ timeout: 30_000 });

    // Close the settings dialog.
    await this.page.keyboard.press('Escape');
  }
}

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Drives the real protocol-import UI: sets the hidden dropzone file input, then
// waits for the deck card to appear. Deletion goes through the confirm dialog.
export class ProtocolFixture {
  constructor(private page: Page) {}

  async import(filePath: string, expectName?: string): Promise<void> {
    await this.page.goto('/');
    await this.page
      .getByTestId('protocol-import-input')
      .setInputFiles(filePath);
    if (expectName) {
      await expect(
        this.page.getByRole('heading', { name: expectName }),
      ).toBeVisible({ timeout: 15_000 });
    }
  }

  // Import a file expected to fail validation/extraction; asserts the failure
  // toast rather than a card.
  async importExpectingFailure(filePath: string): Promise<void> {
    await this.page.goto('/');
    await this.page
      .getByTestId('protocol-import-input')
      .setInputFiles(filePath);
    await expect(this.page.getByText('Import failed')).toBeVisible({
      timeout: 15_000,
    });
  }

  // Deletes the currently-active deck card. Assumes `name` is the active card.
  async delete(): Promise<void> {
    // force: true — the active card's delete control sits in its top-right
    // corner, which the deck's fanned 3D layout (DeckCarousel's
    // perspective/preserve-3d slide transforms) geometrically overlaps with
    // the next card's 2D bounding box. Playwright's pre-click actionability
    // check (elementFromPoint) misjudges that overlap as a blocking element
    // and times out, even though a real dispatched click at those
    // coordinates (verified via page.mouse.click and click({force:true}),
    // both with and without reduced-motion, both mid-animation and fully
    // settled after a reload) always lands on and activates the intended
    // button. force bypasses only that pre-check, not the real click.
    await this.page
      .getByRole('button', { name: 'Delete Protocol' })
      .click({ force: true });
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('dialog-primary').click();
    await expect(this.page.getByText('Protocol deleted')).toBeVisible();
  }
}

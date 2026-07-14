import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Fixture for TieStrengthCensus stages.
 *
 * Iterates every unique unordered pair of subject-type nodes, once per prompt,
 * offering an ordinal "tie strength" choice plus a decline option. Auto-advances
 * 350ms after a changed answer, immediately after an unchanged one
 * (TieStrengthCensus.tsx:277-294).
 *
 * Scenarios instantiate this directly (the shared StageFixture only carries a
 * placeholder), so the class is self-contained around a Page.
 */
export class TieStrengthCensusFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** The horizontal option listbox for the current pair (RichSelectGroup.tsx:314-315). */
  get listbox(): Locator {
    return this.page.getByRole('listbox');
  }

  /**
   * Dismiss the introduction panel. The first Next does not advance the URL
   * step (TieStrengthCensus.tsx:238-239), so wait for the listbox instead of a
   * step change.
   */
  async dismissIntro(): Promise<void> {
    await this.page.getByTestId('next-button').click();
    await expect(this.listbox).toBeVisible();
  }

  /** Ordinal option card for a codebook option value (RichSelectGroup.tsx:379-414). */
  getOption(value: string | number): Locator {
    return this.page.locator(`[role="option"][data-value="${String(value)}"]`);
  }

  /** The decline/negative card, identified by its rendered negativeLabel text. */
  getDeclineOption(negativeLabel: string): Locator {
    return this.page.getByRole('option', { name: negativeLabel, exact: true });
  }

  /** Click an ordinal option by its codebook value. */
  async selectOption(value: string | number): Promise<void> {
    await this.getOption(value).click();
  }

  /** Click the decline/negative card by its label. */
  async selectDecline(negativeLabel: string): Promise<void> {
    await this.getDeclineOption(negativeLabel).click();
  }

  /** Screen-reader-only pair label, "<from> and <to>" (Pair.tsx:78-82). */
  get pairLabel(): Locator {
    return this.page
      .locator('span.sr-only')
      .filter({ hasText: ' and ' })
      .first();
  }

  /** The two node names for the pair currently on screen, in DOM order. */
  async getPairLabels(): Promise<[string, string]> {
    const text = (await this.pairLabel.textContent())?.trim() ?? '';
    const [from, to] = text.split(' and ').map((s) => s.trim());
    return [from ?? '', to ?? ''];
  }

  /**
   * Settle-wait for the auto-advance to land on a different pair. Auto-advance
   * runs on the REAL 350ms setTimeout (TieStrengthCensus.tsx:277-294), and
   * Pair's enter/exit spring animations also run on the real clock — faking
   * timers via page.clock would freeze those animations mid-transition instead
   * of completing them, so we poll for the observable effect (the pair
   * changing) on the real clock rather than fast-forwarding a fake one.
   */
  async waitForPairChange(previousLabels: [string, string]): Promise<void> {
    await expect
      .poll(() => this.getPairLabels(), { timeout: 5000 })
      .not.toEqual(previousLabels);
  }

  /** The Pair connector div carrying the edge-color class (Pair.tsx:84-93). */
  get connector(): Locator {
    return this.page.locator('div[class*="mx-\\[-1\\.5rem\\]"]');
  }

  /** True once the connector's showEdge animation has committed (Pair.tsx:39-42,92). */
  async isConnectorShowingEdge(): Promise<boolean> {
    const pos = await this.connector
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundPosition);
    // showEdge -> 'left bottom' (computed '0% 100%'); hideEdge -> 'right bottom' ('100% 100%')
    return pos.startsWith('0%');
  }
}

import { expect, type Locator, type Page } from '@playwright/test';

import type { DyadCensusMetadataItem } from '@codaco/shared-consts';

// `window.__interviewStore` typing lives in ./dyad-census-window.d.ts.

/**
 * Fixture for DyadCensus stages.
 *
 * DyadCensus iterates through all unordered pairs of subject-type nodes with a
 * binary Yes/No BooleanField, one pair per screen, auto-advancing 350ms after a
 * *changed* answer (DyadCensus.tsx:193-206). Per-prompt answers are NOT
 * reflected in the shared network graph alone — read them from Redux via
 * `getStageMetadata(step)`.
 *
 * Instantiate directly in a scenario: `new DyadCensusFixture(page)`.
 */
export class DyadCensusFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** The introduction panel's h1 heading. Required on every DyadCensus stage. */
  get introHeading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /**
   * Dismiss the introduction panel. Unlike `InterviewFixture.dismissIntro()`
   * (which waits for a `[data-stage-section="form"]` marker used by
   * AlterForm/AlterEdgeForm), DyadCensus renders a BooleanField directly, so we
   * wait for the first radio to become visible instead.
   */
  async dismissIntro(): Promise<void> {
    await this.page.getByTestId('next-button').click();
    await expect(this.page.getByRole('radio').first()).toBeVisible();
  }

  /** The current prompt's markdown-rendered text container. */
  get prompt(): Locator {
    return this.page.getByTestId('prompt');
  }

  get yesOption(): Locator {
    return this.page.getByRole('radio', { name: 'Yes' });
  }

  get noOption(): Locator {
    return this.page.getByRole('radio', { name: 'No' });
  }

  async selectYes(): Promise<void> {
    await this.yesOption.click();
  }

  async selectNo(): Promise<void> {
    await this.noOption.click();
  }

  /** The two node buttons for the pair currently on screen, in DOM order. */
  pairNodes(): Locator {
    return this.page.locator('.w-md').getByRole('button');
  }

  async getPairLabels(): Promise<[string, string]> {
    const texts = await this.pairNodes().allTextContents();
    return [texts[0] ?? '', texts[1] ?? ''];
  }

  getNode(label: string): Locator {
    return this.pairNodes().filter({ hasText: label });
  }

  /**
   * Settle-wait for the auto-advance to land on a different pair. Auto-advance
   * runs on the REAL 350ms setTimeout (DyadCensus.tsx:201-206), and motion's
   * enter/exit spring animations also run on the real clock — faking timers via
   * page.clock would freeze those animations mid-transition instead of
   * completing them, so we poll for the observable effect (the pair changing) on
   * the real clock rather than fast-forwarding a fake one.
   */
  async waitForPairChange(previousLabels: [string, string]): Promise<void> {
    await expect
      .poll(() => this.getPairLabels(), { timeout: 2000 })
      .not.toEqual(previousLabels);
  }

  /** Settle-wait for the pair on screen to match `expectedLabels` (order-agnostic). */
  async waitForPair(expectedLabels: [string, string]): Promise<void> {
    const expectedSorted = expectedLabels.toSorted();
    await expect
      .poll(async () => (await this.getPairLabels()).toSorted(), {
        timeout: 2000,
      })
      .toEqual(expectedSorted);
  }

  /** The animated edge connector between the two pair nodes. */
  get connector(): Locator {
    return this.page.locator('div[class*="mx-[-1.5rem]"]').first();
  }

  /** Pip dots shown only when the stage has more than one prompt. */
  get pips(): Locator {
    return this.page.locator('[data-active]');
  }

  async activePipIndex(): Promise<number> {
    const count = await this.pips.count();
    for (let i = 0; i < count; i++) {
      if ((await this.pips.nth(i).getAttribute('data-active')) === 'true') {
        return i;
      }
    }
    return -1;
  }

  /**
   * Read this stage's per-prompt answer tuples directly from Redux. DyadCensus
   * answers are NOT part of window.__test.getNetworkState() (that returns only
   * session.network) — they live in session.stageMetadata[step] as
   * [promptIndex, nodeA, nodeB, boolean] tuples (DyadCensus.tsx:236-271). The
   * key is the stage's step index (updateStageMetadata uses currentStep).
   */
  async getStageMetadata(step: number): Promise<DyadCensusMetadataItem[]> {
    return this.page.evaluate((s) => {
      const metadata =
        window.__interviewStore?.getState().session.stageMetadata;
      const entry = metadata?.[s];
      // The metadata union's only array member is the DyadCensus tuple array,
      // so Array.isArray narrows without a cast.
      return Array.isArray(entry) ? entry : [];
    }, step);
  }
}

import { type Locator, type Page } from '@playwright/test';

// No `data-testid` seam is added to Timeline.tsx for this — `data-field-name`
// is the suite's sole deliberately-added app-source seam. Instead this locks
// onto the real, framer-motion-driven DOM structure (verified from
// Timeline.tsx / TimelineStageRow.tsx):
// - `Reorder.Group` defaults its `as` prop to `"ul"` and Timeline.tsx doesn't
//   override it, so the stage list renders as a `<ul>` carrying the
//   `justify-items-center` class — unique among the app's `ul`s (grepped), so
//   it scopes to this list without an ancestor `div` false-matching.
// - That `<ul>` holds exactly one `<li>` per stage and nothing else, so
//   `rows()` is a stage count. Each `<li>` holds the insertion point that sits
//   above the stage (a `<button>` — InsertButton.tsx) and then the stage's own
//   card: the single `<div>` child, which is the `Reorder.Item`
//   (`as="div"` in TimelineStageRow.tsx). The card is the drag surface, the
//   hover group and the click-to-open target, so all pointer work goes through
//   `stageCard`, never the list item that also spans the insertion point.
// - Each row's stage label renders via fresco-ui's `Heading level="h4"`,
//   which defaults to a real `<h4>` tag — matched here by accessible role.
//   That heading is a SIBLING of the row's controls, never their content;
//   `TimelineStageRow.test.tsx` pins that structurally, because Playwright's
//   role engine would keep matching an `<h4>` nested inside a button.
export class Timeline {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private container() {
    return this.page.locator('ul.justify-items-center');
  }

  /** The stage list's items — one per stage, and nothing else in the list. */
  rows() {
    return this.container().locator(':scope > li');
  }

  stageRowByLabel(label: string) {
    return this.rows().filter({
      has: this.page.getByRole('heading', { level: 4, name: label }),
    });
  }

  /**
   * The stage's own card within its list item: the drag surface that carries
   * the row grid, the hover group and click-to-open. Everything measured or
   * pointed at wants this rather than the list item, which also spans the
   * insertion point sitting above the card.
   */
  stageCard(label: string): Locator {
    return this.stageRowByLabel(label).locator(':scope > div');
  }

  /** Every stage card, in timeline order. */
  stageCards(): Locator {
    return this.rows().locator(':scope > div');
  }

  /**
   * The timeline's painted spine: the absolutely-positioned line the numbered
   * badges must sit on.
   *
   * Located by the `bg-timeline` DESIGN TOKEN, deliberately, and by nothing
   * else. Every other thing about the spine — that it is absolute, half-way
   * across, one unit wide — is what the geometry assertions measure, so none of
   * it may also be what finds it; and the token is the shared identity that
   * makes the line and the badges read as one spine, which is the behaviour
   * under test rather than a cosmetic class. The `:has(> ul…)` step scopes to
   * the timeline wrapper, whose direct child the spine is, so the badges
   * (which carry the same token inside the list) cannot match.
   */
  spine(): Locator {
    return this.page.locator(
      'div:has(> ul.justify-items-center) > .bg-timeline',
    );
  }

  /**
   * Each stage card's numbered badge, in timeline order — the disc carrying
   * the position number. Same token as the spine, addressed within the card
   * rather than by its index among the card's children: the card's grid is
   * free to gain or reorder tracks, and a child index would then measure a
   * different element while still passing.
   */
  stageBadges(): Locator {
    return this.stageCards().locator(':scope > .bg-timeline');
  }

  /** The row's own "open the stage editor" control (the thumbnail). */
  openControl(label: string): Locator {
    return this.stageRowByLabel(label).getByRole('button', {
      name: 'Edit stage',
    });
  }

  deleteControl(label: string): Locator {
    return this.stageRowByLabel(label).getByRole('button', {
      name: 'Delete stage',
    });
  }

  addNewStageButton(): Locator {
    return this.page.getByRole('button', { name: 'Add new stage' });
  }

  insertButtons(): Locator {
    return this.page.getByRole('button', { name: 'Add stage here' });
  }

  async openStage(label: string) {
    await this.stageCard(label).click();
    await this.page.waitForURL(/\/protocol\/stage\//);
  }

  async dragStage(fromLabel: string, toLabel: string) {
    const from = this.stageCard(fromLabel);
    await this.dragFrom(from, fromLabel, toLabel);
  }

  async dragStageFromPreview(fromLabel: string, toLabel: string) {
    await this.dragFrom(this.openControl(fromLabel), fromLabel, toLabel);
  }

  async dragStageFromText(fromLabel: string, toLabel: string) {
    await this.dragFrom(
      this.stageRowByLabel(fromLabel).getByRole('heading', {
        level: 4,
        name: fromLabel,
      }),
      fromLabel,
      toLabel,
    );
  }

  private async dragFrom(from: Locator, fromLabel: string, toLabel: string) {
    const fromCard = this.stageCard(fromLabel);
    const to = this.stageCard(toLabel);
    // Raw `page.mouse.move` targets viewport-relative coordinates and never
    // triggers a mid-drag auto-scroll the way real pointer input would, so a
    // `to` row several rows below `from` (each ~200px tall) can sit off the
    // 720px-tall viewport entirely. Scrolling `from` to the very top (native
    // `block: 'start'`, not Playwright's `scrollIntoViewIfNeeded`'s
    // 'nearest' — that landed on inconsistent offsets across rows in
    // practice) reliably brings both rows' centers on-screen for any `to`
    // within a couple of rows below `from`.
    await fromCard.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const fromBox = await from.boundingBox();
    const toBox = await to.boundingBox();
    if (!fromBox || !toBox) throw new Error('stage row not found');
    await this.page.mouse.move(
      fromBox.x + fromBox.width / 2,
      fromBox.y + fromBox.height / 2,
    );
    await this.page.mouse.down();
    // Several steps so motion registers a drag (didDrag), not a click.
    await this.page.mouse.move(
      toBox.x + toBox.width / 2,
      toBox.y + toBox.height / 2,
      { steps: 12 },
    );
    await this.page.mouse.up();
  }

  // Inserts a new stage at `index`. Stage-list positions 0..rows().count()-1
  // are each backed by an "Add stage here" InsertButton (aria-label, one per
  // existing stage, rendered before it); the position past the last stage is
  // the trailing "Add new stage" button.
  async insertAt(index: number) {
    const insertButtons = this.insertButtons();
    const count = await insertButtons.count();
    if (index < count) {
      await insertButtons.nth(index).click();
      return;
    }
    await this.addNewStageButton().click();
  }

  async deleteStage(label: string) {
    // The card, not the list item: the reveal keys off `group-hover` on the
    // card, and the list item's centre could fall on the insertion point.
    await this.stageCard(label).hover();
    await this.deleteControl(label).click();
  }
}

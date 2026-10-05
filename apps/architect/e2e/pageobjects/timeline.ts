import { expect, type Locator, type Page } from '@playwright/test';

// The timeline's real DOM, as every locator below reads it (verified from
// Timeline.tsx / TimelineStageRow.tsx):
// - `Reorder.Group` defaults its `as` prop to `"ul"` and Timeline.tsx doesn't
//   override it, so the stage list renders as a `<ul>` — found here by its
//   accessible name. That name is not a test-only handle: Timeline.tsx states
//   `role="list"` and `aria-label="Protocol stages"` because Tailwind's
//   preflight strips list styling and WebKit then drops the list role, and
//   `timeline.spec.ts` asserts both against the accessibility tree. So the
//   name is a user-facing contract, and a rename that breaks this locator is
//   a change that should break it. It replaces `ul.justify-items-center`,
//   which named a grid utility the list carries and each of its `<li>`s
//   carries too — only the tag qualifier kept that selector off the items.
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
    return this.page.getByRole('list', { name: 'Protocol stages' });
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
   * A named seam stamped on it in Timeline.tsx, because the spine is
   * decorative and so offers nothing else to address it by: no text, no role,
   * no accessible name. Everything it does have — absolute, half-way across,
   * one unit wide — is what the geometry assertions measure, so none of it may
   * also be what finds it. The seam replaces a structural walk
   * (`div:has(> ul…) > .bg-timeline`) whose whole job was to scope past the
   * badges, which carry the same `bg-timeline` token inside the list.
   */
  spine(): Locator {
    return this.page.getByTestId('timeline-spine');
  }

  /**
   * Each stage card's numbered badge, in timeline order — the disc carrying
   * the position number.
   *
   * A named seam stamped in TimelineStageRow.tsx, for the same reason as the
   * spine: the `bg-timeline` token this used to match is shared with the line
   * and is itself under measurement, so it cannot also be what finds the
   * badge. Scoped to the card rather than taken page-wide, because the card's
   * grid is free to gain or reorder tracks and this must keep pairing each
   * badge with its own row.
   */
  stageBadges(): Locator {
    return this.stageCards().getByTestId('timeline-stage-badge');
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
    // The install banner and sticky navigation vary with copy and viewport.
    // Move the requested origin below the real header before measuring it;
    // scrolling its whole card to the top alone can press the navigation.
    await from.evaluate((element) => {
      const origin = element.getBoundingClientRect();
      const headerBottom =
        document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
      const clearance = headerBottom + 8 - origin.top;
      if (clearance <= 0) return;
      let ancestor = element.parentElement;
      while (ancestor) {
        if (
          ancestor.scrollHeight > ancestor.clientHeight &&
          /auto|scroll/.test(getComputedStyle(ancestor).overflowY)
        ) {
          ancestor.scrollBy(0, -clearance);
          return;
        }
        ancestor = ancestor.parentElement;
      }
      window.scrollBy(0, -clearance);
    });
    const fromBox = await from.boundingBox();
    const toBox = await to.boundingBox();
    if (!fromBox || !toBox) throw new Error('stage row not found');
    const origin = {
      x: fromBox.x + fromBox.width / 2,
      y: fromBox.y + fromBox.height - Math.min(8, fromBox.height / 4),
    };
    // A successful drag must start on the requested heading, preview or card.
    // This positive check prevents a hidden origin from becoming a timeout in
    // the unrelated persisted-order assertion below.
    expect(
      await from.evaluate(
        (element, point) =>
          element.contains(document.elementFromPoint(point.x, point.y)),
        origin,
      ),
    ).toBe(true);
    await this.page.mouse.move(origin.x, origin.y);
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

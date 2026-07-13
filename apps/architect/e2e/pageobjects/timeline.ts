import { type Page } from '@playwright/test';

// No `data-testid` seam is added to Timeline.tsx for this — `data-field-name`
// is the suite's sole deliberately-added app-source seam. Instead this locks
// onto the real, framer-motion-driven DOM structure (verified from
// Timeline.tsx):
// - `Reorder.Group` defaults its `as` prop to `"ul"` and Timeline.tsx doesn't
//   override it, so the stage list renders as a `<ul>` carrying the
//   `justify-items-center` class — unique in the app's source (grepped), so
//   it scopes to this list without an ancestor `div` false-matching.
// - `Reorder.Item` likewise defaults to `"li"`; the `InsertButton` elements
//   interleaved between stages render as `<button>` (InsertButton.tsx), so a
//   bare `li` under the scoped root only ever matches stage rows.
// - Each row's stage label renders via fresco-ui's `Heading level="h4"`,
//   which defaults to a real `<h4>` tag — matched here by accessible role.
export class Timeline {
  constructor(private readonly page: Page) {}

  private container() {
    return this.page.locator('ul.justify-items-center');
  }

  rows() {
    return this.container().locator('li');
  }

  stageRowByLabel(label: string) {
    return this.rows().filter({
      has: this.page.getByRole('heading', { level: 4, name: label }),
    });
  }

  async openStage(label: string) {
    await this.stageRowByLabel(label).click();
    await this.page.waitForURL(/\/protocol\/stage\//);
  }

  async dragStage(fromLabel: string, toLabel: string) {
    const from = this.stageRowByLabel(fromLabel);
    const to = this.stageRowByLabel(toLabel);
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
  // a separate trailing "Add new stage" affordance (a plain `motion.div` with
  // an onClick, not a `<button>` — matched here by its visible text instead
  // of role).
  async insertAt(index: number) {
    const insertButtons = this.page.getByRole('button', {
      name: 'Add stage here',
    });
    const count = await insertButtons.count();
    if (index < count) {
      await insertButtons.nth(index).click();
      return;
    }
    await this.page.getByText('Add new stage', { exact: true }).click();
  }

  async deleteStage(label: string) {
    const row = this.stageRowByLabel(label);
    await row.hover(); // Delete button is opacity-0 until hover.
    await row.getByRole('button', { name: 'Delete stage' }).click();
  }
}

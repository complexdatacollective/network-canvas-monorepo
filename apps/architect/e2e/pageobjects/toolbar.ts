import { expect, type Page } from '@playwright/test';

// Accessible names follow the composed toolbar controls: text buttons such as
// Return, Download, Print, and Finished Editing derive their names from their
// visible content; icon-only Undo/Redo buttons provide explicit aria-labels.
// `print` only renders on `/protocol/summary` (ProjectLayout.tsx passes it as
// an additional action gated on that route); `finished-editing` only
// renders in the stage editor once there are unsaved changes.
export class Toolbar {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  button(id: string) {
    // Target either an icon button's aria-label or a text button's content.
    return this.page
      .getByRole('toolbar')
      .getByRole('button', { name: this.labelFor(id) });
  }

  private labelFor(id: string): string {
    const map: Record<string, string> = {
      'download': 'Download',
      'undo': 'Undo',
      'redo': 'Redo',
      'return-to-start': 'Return to Start Screen',
      'return-to-timeline': 'Return to Stages',
      'print': 'Print',
      'finished-editing': 'Finished Editing',
      'generate-synthetic-data': 'Generate synthetic data…',
    };
    return map[id] ?? id;
  }

  async download() {
    await this.button('download').click();
  }

  async generateSyntheticData() {
    await this.button('generate-synthetic-data').click();
  }

  async undo() {
    await this.button('undo').click();
  }

  async redo() {
    await this.button('redo').click();
  }

  async returnToStart() {
    await this.button('return-to-start').click();
  }

  async returnToTimeline() {
    await this.button('return-to-timeline').click();
  }

  async print() {
    await this.button('print').click();
  }

  // Asserts a toolbar button's current accessible name — for ids whose label
  // changes with async state (e.g. `download`: Download/Downloading.../
  // Downloaded), where `button(id)`'s static `labelFor` mapping only matches
  // the at-rest label.
  async expectLabel(id: string, text: string) {
    await expect(
      this.page
        .getByRole('toolbar')
        .getByRole('button', { name: text, exact: true }),
      `expected toolbar item "${id}" to show label "${text}"`,
    ).toBeVisible();
  }
}

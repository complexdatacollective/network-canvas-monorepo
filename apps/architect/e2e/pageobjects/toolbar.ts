import { expect, type Page } from '@playwright/test';

// Accessible names verified against the real ToolbarSegment definitions:
// - `return-to-start`/`download`/`print`/`finished-editing` all set
//   `showLabel: true` (ProjectActions.tsx, PrintProtocolAction.tsx,
//   StageEditorNav.tsx), so SegmentedToolbar renders the label as visible
//   text and leaves `aria-label` unset — the accessible name comes from the
//   button's text content.
// - `undo`/`redo` don't set `showLabel`, so SegmentedToolbar's
//   `isLabelVisible` (`showLabel ?? !icon`) hides the text and falls back to
//   `aria-label={label}` (icon-only + tooltip) — the accessible name is the
//   aria-label.
// `print` only renders on `/protocol/summary` (ProjectLayout.tsx passes it as
// an `additionalItems` entry gated on that route); `finished-editing` only
// renders in the stage editor once there are unsaved changes.
export class Toolbar {
  constructor(private readonly page: Page) {}

  button(id: string) {
    // ActionToolbar (SegmentedToolbar) renders items with aria-label = label
    // (icon-only) or visible text; target by accessible name either way.
    return this.page.getByRole('button', { name: this.labelFor(id) });
  }

  private labelFor(id: string): string {
    const map: Record<string, string> = {
      'download': 'Download',
      'undo': 'Undo',
      'redo': 'Redo',
      'return-to-start': 'Return to Start Screen',
      'print': 'Print',
      'finished-editing': 'Finished Editing',
    };
    return map[id] ?? id;
  }

  async download() {
    await this.button('download').click();
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

  async print() {
    await this.button('print').click();
  }

  // Asserts a toolbar button's current accessible name — for ids whose label
  // changes with async state (e.g. `download`: Download/Downloading.../
  // Downloaded), where `button(id)`'s static `labelFor` mapping only matches
  // the at-rest label.
  async expectLabel(id: string, text: string) {
    await expect(
      this.page.getByRole('button', { name: text, exact: true }),
      `expected toolbar item "${id}" to show label "${text}"`,
    ).toBeVisible();
  }
}

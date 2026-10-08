import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The stage editor's Preview control, and the interview running inside the
 * preview window.
 *
 * Preview is a real popup: `launchPreview.ts` calls
 * `window.open('/preview/', '_blank', 'popup,…')` and then hands the protocol
 * over a `window.opener` postMessage handshake, so the preview Page has to be
 * captured from the popup event — it cannot be reached by navigating to
 * `/preview/`, which would have no opener to handshake with.
 *
 * Seams used here, all verified against app source:
 * - `StageEditorNav.tsx` renders the launch button (label 'Preview', or
 *   'Opening preview…' while a launch is in flight) and, beside it, a split
 *   control with `aria-label="Preview settings"` whose popover content is
 *   `StageEditor.tsx`'s `previewOptionsContent` — two `ToggleField`s, each a
 *   `role="switch"` NAMED by the text beside it through `aria-labelledby`.
 *   Located by that name rather than by a wrapping element: `ToggleField`
 *   renders a bare `<button>`, and a `<label>` around a button contributes
 *   nothing to its accessible name (issue #1391), so a name-based locator is
 *   also the assertion that these two switches are named at all.
 * - The preview window mounts the shared `@codaco/interview` Shell, so its
 *   stage chrome (dialogs, prompts, nav) is the interview runtime's, not
 *   Architect's.
 */
export class StagePreview {
  private readonly page: Page;

  private readonly labels: {
    launch: string;
    settings: string;
    nextStep: string;
  };

  constructor(
    page: Page,
    labels = {
      launch: 'Preview',
      settings: 'Preview settings',
      nextStep: 'Next Step',
    },
  ) {
    this.page = page;
    this.labels = labels;
  }

  get launchButton(): Locator {
    return this.page.getByRole('button', {
      name: this.labels.launch,
      exact: true,
    });
  }

  get settingsButton(): Locator {
    return this.page.getByRole('button', { name: this.labels.settings });
  }

  /** Launch the preview and return its popup Page, ready to interact with. */
  async open(): Promise<Page> {
    const popup = this.page.waitForEvent('popup');
    await this.launchButton.click();
    const preview = await popup;
    await preview.waitForLoadState('domcontentloaded');
    // The handshake delivers the protocol after mount, so wait for the stage
    // itself rather than for load.
    await expect(
      preview.getByRole('button', { name: this.labels.nextStep, exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    return preview;
  }
}

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

  constructor(page: Page) {
    this.page = page;
  }

  get launchButton(): Locator {
    return this.page.getByRole('button', { name: 'Preview', exact: true });
  }

  get settingsButton(): Locator {
    return this.page.getByRole('button', { name: 'Preview settings' });
  }

  /**
   * Set 'Start preview with synthetic data'. Off starts the stage from its
   * empty state (for FamilyPedigree, the quick-start wizard) instead of a
   * generated synthetic network.
   */
  async setUseExampleData(enabled: boolean): Promise<void> {
    await this.settingsButton.click();
    const toggle = this.page.getByRole('switch', {
      name: 'Start preview with synthetic data',
      exact: true,
    });
    await expect(toggle).toBeVisible();
    if (((await toggle.getAttribute('aria-checked')) === 'true') !== enabled) {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', String(enabled));
    }
    // Dismiss the popover so its backdrop stops intercepting the launch click.
    await this.page.keyboard.press('Escape');
    await expect(toggle).toBeHidden();
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
      preview.getByRole('button', { name: 'Next Step' }),
    ).toBeVisible({ timeout: 20_000 });
    return preview;
  }
}

/**
 * Architect's global error boundary (`AppErrorBoundary.tsx`), which is what a
 * throw from inside dialog content reaches — dialog children render in
 * DialogProvider's own subtree, outside the interview's stage boundary. Its
 * absence is the assertion for issue #1390.
 */
export function appErrorBoundary(page: Page): Locator {
  return page.getByText('Something went wrong.');
}

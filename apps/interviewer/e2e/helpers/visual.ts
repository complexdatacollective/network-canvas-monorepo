import { expect, type Locator, type Page } from '@playwright/test';

// Hide non-deterministic chrome so snapshots don't depend on blob animation
// or which element last held focus. Mirrors the interview suite's VISUAL_STYLES.
export const VISUAL_STYLES = `
  [data-testid="background-blobs"] { visibility: hidden !important; }
  *:focus-visible, *:has(:focus-visible) { outline: none !important; }
  *:focus-visible { box-shadow: none !important; }
`;

type CaptureOptions = { mask?: Locator[]; fullPage?: boolean };
export type CaptureFn = (
  name: string,
  options?: CaptureOptions,
) => Promise<void>;

// Returns a capture function that is a no-op unless running in CI. This keeps
// local headed runs functional-only (no baselines needed) while CI asserts
// against the committed Docker-generated baselines.
export function makeCapture(page: Page): CaptureFn {
  const isCI = !!process.env.CI;

  return async (name, options = {}) => {
    if (!isCI) return;
    // Re-inject on every capture, not just once per page instance: a
    // page.reload()/second goto() drops the injected <style>, which would
    // silently un-hide blobs/focus-rings for a later capture() in the same test.
    await page.addStyleTag({ content: VISUAL_STYLES });
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: options.fullPage ?? false,
      mask: options.mask,
    });
  };
}

// Standard masks for the Home/status chrome — version string, storage estimate,
// installation id — whose text is environment-dependent.
export function statusMasks(page: Page): Locator[] {
  return [
    page.getByTestId('encryption-status-trigger'),
    page.getByTestId('storage-status-trigger'),
  ];
}

import { expect, type Locator, type Page } from '@playwright/test';

// Hide non-deterministic chrome so snapshots don't depend on blob animation
// or which element last held focus. Mirrors the interview suite's VISUAL_STYLES.
const VISUAL_STYLES = `
  [data-testid="background-blobs"] { visibility: hidden !important; }
  /* The app's ambient BackgroundLights (App.tsx) drifts via requestAnimationFrame
     with Math.random() seed positions — doubly non-deterministic and immune to
     reducedMotion / animations:'disabled'. Hide it so app-chrome snapshots are
     stable. (The interview route doesn't render it.) */
  [data-testid="background-lights"] { visibility: hidden !important; }
  *:focus-visible, *:has(:focus-visible) { outline: none !important; }
  *:focus-visible { box-shadow: none !important; }
`;

type CaptureOptions = { mask?: Locator[]; fullPage?: boolean };
export type CaptureFn = (
  name: string,
  options?: CaptureOptions,
) => Promise<void>;

export const APP_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// Returns a capture function that is a no-op unless running in CI. This keeps
// local headed runs functional-only (no baselines needed) while canonical CI
// and local Docker regeneration both provide Linux ARM64 pixels.
export function makeCapture(page: Page): CaptureFn {
  const isCI = !!process.env.CI;
  const isBaselinePlatform =
    process.platform === 'linux' && process.arch === 'arm64';

  return async (name, options = {}) => {
    if (!isCI) return;
    if (!isBaselinePlatform) {
      console.warn(
        `[visual] skipping pixel comparison for "${name}" — baselines require Linux ARM64 and this run is ${process.platform}/${process.arch}`,
      );
      return;
    }
    // Re-inject on every capture, not just once per page instance: a
    // page.reload()/second goto() drops the injected <style>, which would
    // silently un-hide blobs/focus-rings for a later capture() in the same test.
    await page.addStyleTag({ content: VISUAL_STYLES });
    const animationSettings = await page.evaluate(() => ({
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
      baseUiDisabled: Boolean(
        (
          globalThis as typeof globalThis & {
            BASE_UI_ANIMATIONS_DISABLED?: boolean;
          }
        ).BASE_UI_ANIMATIONS_DISABLED,
      ),
    }));
    expect(animationSettings).toEqual({
      reducedMotion: true,
      baseUiDisabled: true,
    });
    // Hide toasts for the screenshot only. Transient toasts (e.g. the "Protocol
    // imported" toast still entering/exiting when a post-import capture fires)
    // are time-dependent. A plain `mask` of the viewport box MISSES them —
    // Base UI translates a toast (translateY 150%) outside that box while it
    // animates. visibility:hidden ignores transform position and covers the
    // transformed descendants; removing the tag afterwards restores the toast
    // so post-capture getByText(...).toBeVisible() assertions still pass.
    const toastHide = await page.addStyleTag({
      content:
        '[data-testid="toast-viewport"], [data-testid="toast-viewport"] * { visibility: hidden !important; }',
    });
    try {
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: options.fullPage ?? false,
        mask: options.mask,
      });
    } finally {
      await toastHide.evaluate((el) => {
        el.parentNode?.removeChild(el);
      });
    }
  };
}

// Settings → About's app version varies between generated release branches;
// the storage estimate (the "Storage usage" progress bar and its "X of Y (Z%)"
// desc text) and per-device installation id vary by environment/browser
// profile. Mask those values so one canonical baseline works for every release
// gate while the row labels and layout remain asserted. The settings spec
// verifies the version value semantically before capture.
export function settingsAboutMasks(page: Page): Locator[] {
  const storageHeading = page.getByRole('heading', {
    level: 4,
    name: 'Storage',
    exact: true,
  });
  const installationHeading = page.getByRole('heading', {
    level: 4,
    name: 'Installation ID',
    exact: true,
  });
  return [
    // Match the text-bearing span itself. Walking up from the heading to the
    // control column can select a responsive layout container whose painted
    // area includes unrelated settings content.
    page.getByText(APP_VERSION_PATTERN, { exact: true }),
    page.getByRole('progressbar', { name: 'Storage usage' }),
    // SettingsRow renders the desc text as the heading's next sibling, inside
    // their shared title/desc column.
    storageHeading.locator('xpath=following-sibling::div[1]'),
    // The control column (here, the id span) is a sibling of the title/desc
    // column two levels above the heading — see SettingsRow.tsx.
    installationHeading.locator('xpath=../..').locator('> div').last(),
  ];
}

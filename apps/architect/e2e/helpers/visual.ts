import { expect, type Locator, type Page } from '@playwright/test';

// Hide non-deterministic chrome so snapshots don't depend on the ambient
// background's fade-in timing or which element last held focus. Mirrors the
// interview suite's VISUAL_STYLES.
const VISUAL_STYLES = `
  /* BackgroundLights (~/components/BackgroundLights.tsx) fades its opacity in
     via a framer-motion tween that animations:'disabled'/reducedMotion:'reduce'
     don't stop, so a capture taken mid-fade would be non-deterministic. Hide
     it so app-chrome snapshots are stable regardless of when the fade lands. */
  [data-testid="background-lights"] { visibility: hidden !important; }
  *:focus-visible, *:has(:focus-visible) { outline: none !important; }
  *:focus-visible { box-shadow: none !important; }
`;

type CaptureOptions = { mask?: Locator[]; fullPage?: boolean };
export type CaptureFn = (
  name: string,
  options?: CaptureOptions,
) => Promise<void>;

// Returns a capture function that is a no-op unless running in CI. This keeps
// local headed runs functional-only (no baselines needed) while canonical CI
// and local Docker regeneration both provide Linux ARM64 pixels.
export function makeCapture(page: Page): CaptureFn {
  const isCI = !!process.env.CI;
  // Baselines are ARM64-truth (see e2e/scripts/run.sh). The Playwright image's
  // amd64 and arm64 builds have subtly different glyph advance widths, so only
  // native Linux ARM64 may compare against or regenerate them.
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
    // silently un-hide the background lights/focus-rings for a later
    // capture() in the same test.
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
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: options.fullPage ?? false,
      mask: options.mask,
    });
  };
}

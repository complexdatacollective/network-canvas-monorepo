import { expect, type Locator, type Page } from '@playwright/test';

// Hide ambient chrome and focus indicators that are outside the snapshot's
// subject. Mirrors the interview suite's VISUAL_STYLES.
const VISUAL_STYLES = `
  /* BackgroundLights are decorative app chrome, not part of these assertions. */
  [data-testid="background-lights"] { visibility: hidden !important; }
  *:focus-visible, *:has(:focus-visible) { outline: none !important; }
  *:focus-visible { box-shadow: none !important; }
`;

type CaptureOptions = { mask?: Locator[]; fullPage?: boolean };
export type CaptureFn = (
  name: string,
  options?: CaptureOptions,
) => Promise<void>;

// CI runs this suite as two jobs: the pinned Playwright container compares the
// committed PNGs, and a plain runner runs everything else. The gates below key
// on `CI` and arch, NOT on Docker — a native amd64 runner satisfies both, so a
// test that escaped the `--grep @visual` partition would compare
// container-rasterised baselines against the runner's own font stack. That
// fails as a confusing pixel diff. Turn it into an actionable one instead.
function assertNotNativeLane(name: string): void {
  if (process.env.E2E_PIXEL_LANE === 'native') {
    throw new Error(
      `[visual] "${name}" tried to capture in the native e2e lane. Pixel ` +
        'baselines are only valid from the pinned Playwright image, so this ' +
        'test must carry the @visual tag to be routed to the Docker job.',
    );
  }
}

// Returns a capture function that is a no-op unless running in CI. This keeps
// local headed runs functional-only (no baselines needed) while CI asserts
// against the committed Docker-generated baselines.
export function makeCapture(page: Page): CaptureFn {
  const isCI = !!process.env.CI;
  // Baselines are amd64-truth (see e2e/scripts/run.sh): the Playwright
  // image's amd64 and arm64 builds have subtly different glyph advance
  // widths, which moves text wrap points in the print documents, so an
  // arm64 container can neither compare against nor regenerate them.
  const isBaselineArch = process.arch === 'x64';

  return async (name, options = {}) => {
    if (!isCI) return;
    assertNotNativeLane(name);
    if (!isBaselineArch) {
      console.warn(
        `[visual] skipping pixel comparison for "${name}" — baselines are amd64-truth and this run is ${process.arch}`,
      );
      return;
    }
    // Re-inject on every capture, not just once per page instance: a
    // page.reload()/second goto() drops the injected <style>, which would
    // silently un-hide the background lights/focus-rings for a later
    // capture() in the same test.
    await page.addStyleTag({ content: VISUAL_STYLES });
    // skipAnimations commits Motion's final variants from an effect after the
    // initial paint. Two animation frames let that effect and its paint land
    // before Playwright begins looking for identical screenshots.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: options.fullPage ?? false,
      mask: options.mask,
    });
  };
}

import { existsSync } from 'node:fs';
import { relative } from 'node:path';

import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

// Hide ambient chrome and focus indicators that are outside the snapshot's
// subject. Mirrors the interview suite's VISUAL_STYLES.
const VISUAL_STYLES = `
  /* BackgroundLights are decorative app chrome, not part of these assertions. */
  [data-testid="background-lights"] { visibility: hidden !important; }
  *:focus-visible, *:has(:focus-visible) { outline: none !important; }
  *:focus-visible { box-shadow: none !important; }
`;

type CaptureOptions = {
  mask?: Locator[];
  fullPage?: boolean;
  /**
   * Capture this element instead of the page. Use it to keep a long printed
   * document reviewable: one 1280x20190 baseline cannot be diffed by a human
   * (the commit that last adopted this suite's `summary-print.png` recorded
   * that its author could not find what had changed in it), whereas a
   * per-section baseline names the section that moved in the filename.
   */
  locator?: Locator;
};
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

/**
 * Fail ONCE, before a single capture runs, if the committed baselines for
 * `names` are not in the tree.
 *
 * Playwright's default `updateSnapshots: 'missing'` already handles an absent
 * baseline correctly — it writes the actual, attaches a `softError`, and sets
 * `shouldNotRetryTest`, so the test fails and `retries` cannot rescue it. What
 * it cannot do is say what to run: a spec that derives one baseline per
 * section of a printed document turns a single missing set into dozens of
 * identical "a snapshot doesn't exist at …" failures with no next action.
 *
 * This does NOT weaken that gate. It is not a skip and not conditional on
 * `CI`: a `test.skip` when baselines are absent would be an invisible green —
 * an assertion that cannot fail — and the whole point of the pixel gate is to
 * keep an unreviewed rendering change out of the tree. The run stays red until
 * the images land, and this check goes inert the moment they do.
 *
 * The caller passes the exact set it is about to capture, so deleting a SUBSET
 * fails here too; this is not a "some baselines exist" smoke check. Paths come
 * from `testInfo.snapshotPath(…, { kind: 'screenshot' })` — the same
 * resolution `toHaveScreenshot` performs — so it cannot drift from the
 * config's `snapshotDir` / `snapshotPathTemplate`.
 */
export function assertBaselinesCommitted(
  testInfo: TestInfo,
  names: readonly string[],
): void {
  const missing = names
    .map((name) => testInfo.snapshotPath(`${name}.png`, { kind: 'screenshot' }))
    .filter((path) => !existsSync(path));
  if (missing.length === 0) return;

  throw new Error(
    [
      `[visual] ${missing.length} of ${names.length} committed pixel baseline(s) are missing:`,
      ...missing.map((path) => `  ${relative(process.cwd(), path)}`),
      '',
      'Generate them with the "Regenerate E2E Visual Snapshots" GitHub Actions',
      'workflow, with input suite: architect. It runs',
      '  ./apps/architect/e2e/scripts/run.sh --grep @visual --update-snapshots',
      'in the pinned Playwright image on --platform linux/amd64. The baselines',
      'are amd64-truth, so an arm64 host can neither produce nor compare them.',
      'Download the artifact and inspect every image before committing it.',
      '',
      'Do NOT skip this test to get a green run: a skipped visual assertion is',
      'an invisible pass, and this gate is what keeps an unreviewed rendering',
      'change out of the tree.',
    ].join('\n'),
  );
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
    if (options.locator) {
      await expect(options.locator).toHaveScreenshot(`${name}.png`, {
        mask: options.mask,
      });
      return;
    }
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: options.fullPage ?? false,
      mask: options.mask,
    });
  };
}

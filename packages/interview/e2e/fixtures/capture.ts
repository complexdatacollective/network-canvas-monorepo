import { expect, type Locator, type Page } from '@playwright/test';

export type CaptureInterviewOptions = {
  mask?: Locator[];
  fullPage?: boolean;
};

export type CaptureInterviewFn = (
  name: string,
  options?: CaptureInterviewOptions,
) => Promise<void>;

const VISUAL_STYLES = `
  [data-testid="background-blobs"] { visibility: hidden !important; }
  /* Suppress focus rings so snapshots don't depend on what last held focus.
     Rings here are outlines (incl. the focusable-after ::after pseudo), so
     outline:none covers them on the focused element and on focusable-within
     ancestors. box-shadow:none is scoped to the focused element only — NOT
     :has(:focus-visible) ancestors — because a focused field's ancestor (e.g.
     a slider track) carries a real inset-surface box-shadow that must survive. */
  *:focus-visible,
  *:has(:focus-visible) {
    outline: none !important;
  }
  *:focus-visible {
    box-shadow: none !important;
  }
  .focusable-after::after,
  .focusable-after-within::after {
    outline: none !important;
    box-shadow: none !important;
    content: none !important;
  }
`;

// CI runs this suite as two jobs: the pinned Playwright container runs the
// `*-visual` projects that compare the committed PNGs, and a plain runner runs
// the `*-matrix` projects, whose ARIA baselines are OS-independent text. The
// `enabled` gate below keys on `CI`, NOT on Docker — a native runner sets
// `CI=true` too, so a capture reached outside the visual projects would compare
// container-rasterised baselines against the runner's own font stack. That
// fails as a confusing pixel diff. Turn it into an actionable one instead.
function assertNotNativeLane(name: string): void {
  if (process.env.E2E_PIXEL_LANE === 'native') {
    throw new Error(
      `[visual] "${name}" tried to capture in the native e2e lane. Pixel ` +
        'baselines are only valid from the pinned Playwright image, so this ' +
        'capture must run in a *-visual project to reach the Docker job.',
    );
  }
}

/**
 * Shared pixel-capture pipeline used by both the legacy interview-test
 * fixture and the matrix fixture. Captures are CI-only (`enabled`).
 */
export function createCaptureInterview(
  page: Page,
  opts: { enabled: boolean },
): CaptureInterviewFn {
  let stylesInjected = false;

  return async (name: string, options: CaptureInterviewOptions = {}) => {
    if (!opts.enabled) return;
    assertNotNativeLane(name);
    if (!stylesInjected) {
      await page.addStyleTag({ content: VISUAL_STYLES });
      stylesInjected = true;
    }
    // Wait out motion entrance choreography. Elements animating in sit
    // at their framer `initial` state (inline opacity 0) until the
    // animation scheduler's first frame applies — under load that can
    // lag mount by hundreds of ms. toHaveScreenshot cannot see this:
    // two identical pre-entrance frames count as "stable", which is
    // exactly how CategoricalBin stages captured without their bin
    // circles on firefox.
    //
    // Resolves on the first evaluation when nothing is pending, so the
    // settled-state cost is one round-trip per capture. Only elements
    // covering a significant area count as pending: small overlays
    // (the node bin, action-button badges) and zero-height collapsed
    // containers (the node drawer body) are transparent AT REST by
    // design, and treating them as pending would make every capture on
    // their stage pay the full timeout. The timeout log below surfaces
    // anything that still stalls the wait.
    const MIN_PENDING_AREA = 24_000;
    await page
      .waitForFunction(
        (minArea) =>
          !Array.from(
            document.querySelectorAll<HTMLElement>('main [style*="opacity"]'),
          ).some((el) => {
            if (el.style.opacity !== '0') return false;
            const rect = el.getBoundingClientRect();
            return rect.width * rect.height >= minArea;
          }),
        MIN_PENDING_AREA,
        { timeout: 3000 },
      )
      .catch(async () => {
        const offenders = await page.evaluate(
          (minArea) =>
            Array.from(
              document.querySelectorAll<HTMLElement>('main [style*="opacity"]'),
            )
              .filter((el) => {
                if (el.style.opacity !== '0') return false;
                const rect = el.getBoundingClientRect();
                return rect.width * rect.height >= minArea;
              })
              .map(
                (el) =>
                  `${el.tagName}.${(el.getAttribute('class') ?? '').slice(0, 60)} testid=${el.getAttribute('data-testid')}`,
              ),
          MIN_PENDING_AREA,
        );
        console.log(
          '[capture] entrance-settle wait timed out on:',
          offenders.join(' | '),
        );
      });
    await expect.soft(page).toHaveScreenshot(`${name}.png`, {
      fullPage: options.fullPage ?? false,
      mask: options.mask,
    });
  };
}

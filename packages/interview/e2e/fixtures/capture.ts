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

const MOTION_DRAG_SELECTOR = '[data-motion-drag-container]';
const MOTION_DRAG_QUIET_MS = 250;
const MOTION_DRAG_SETTLE_TIMEOUT_MS = 3000;
// A one-pixel translation of the translucent Geospatial prompt changed 1,909
// pixels (0.207% of its 1280x720 page) while its position-normalised crop
// changed only 35. Keep the normal 250-pixel limit everywhere else, and give
// pages containing audited Motion drag containers enough room for a one-pixel
// shift on both axes. Tight element snapshots below still protect the surface.
const MOTION_DRAG_MAX_DIFF_PIXELS = 5000;
const MOTION_DRAG_MAX_DIFF_RATIO = 0.005;
const MOTION_DRAG_ELEMENT_STYLES = `${MOTION_DRAG_SELECTOR} {
  transform: none !important;
  translate: none !important;
}`;

const dragOffset = process.env.E2E_VISUAL_DRAG_OFFSET;
const MOTION_DRAG_OFFSET_STYLES =
  dragOffset === 'x'
    ? `${MOTION_DRAG_SELECTOR} { translate: 1px 0 !important; }`
    : dragOffset === 'y'
      ? `${MOTION_DRAG_SELECTOR} { translate: 0 1px !important; }`
      : dragOffset === 'xy'
        ? `${MOTION_DRAG_SELECTOR} { translate: 1px 1px !important; }`
        : '';

type VisibleDragContainer = {
  key: string;
  locator: Locator;
};

async function waitForMotionDragContainersToSettle(
  page: Page,
): Promise<VisibleDragContainer[]> {
  await page.evaluate(
    async ({ quietMs, selector, timeoutMs }) => {
      await document.fonts.ready;

      const visibleContainers = () =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
          (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              rect.width > 0 &&
              rect.height > 0
            );
          },
        );

      if (visibleContainers().length === 0) return;

      const sample = () =>
        JSON.stringify(
          visibleContainers().map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              key: element.dataset.motionDragContainer,
              inlineTransform: element.style.transform,
              transform: getComputedStyle(element).transform,
              rect: [
                rect.top,
                rect.right,
                rect.bottom,
                rect.left,
                rect.width,
                rect.height,
              ],
            };
          }),
        );

      await new Promise<void>((resolve, reject) => {
        const startedAt = performance.now();
        let stableSince = startedAt;
        let previous = sample();

        const check = () => {
          const now = performance.now();
          const current = sample();
          if (current !== previous) {
            previous = current;
            stableSince = now;
          }

          if (now - stableSince >= quietMs) {
            resolve();
            return;
          }
          if (now - startedAt >= timeoutMs) {
            reject(
              new Error(
                `Motion drag containers did not settle within ${timeoutMs}ms: ${current}`,
              ),
            );
            return;
          }
          requestAnimationFrame(check);
        };

        requestAnimationFrame(check);
      });
    },
    {
      quietMs: MOTION_DRAG_QUIET_MS,
      selector: MOTION_DRAG_SELECTOR,
      timeoutMs: MOTION_DRAG_SETTLE_TIMEOUT_MS,
    },
  );

  const containers = page.locator(MOTION_DRAG_SELECTOR);
  const visible: VisibleDragContainer[] = [];
  for (let index = 0; index < (await containers.count()); index += 1) {
    const locator = containers.nth(index);
    if (!(await locator.isVisible())) continue;
    const rawKey = await locator.getAttribute('data-motion-drag-container');
    const key = (rawKey ?? `container-${index}`)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-');
    visible.push({ key, locator });
  }
  return visible;
}

function withScreenshotSuffix(name: string, suffix: string): string {
  return name.endsWith('.png')
    ? `${name.slice(0, -4)}-${suffix}.png`
    : `${name}-${suffix}.png`;
}

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
      await page.addStyleTag({
        content: `${VISUAL_STYLES}\n${MOTION_DRAG_OFFSET_STYLES}`,
      });
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
    const dragContainers = await waitForMotionDragContainersToSettle(page);
    await expect.soft(page).toHaveScreenshot(`${name}.png`, {
      fullPage: options.fullPage ?? false,
      mask: options.mask,
      ...(dragContainers.length > 0
        ? {
            maxDiffPixelRatio: MOTION_DRAG_MAX_DIFF_RATIO,
            maxDiffPixels: MOTION_DRAG_MAX_DIFF_PIXELS,
          }
        : {}),
    });

    for (const [index, container] of dragContainers.entries()) {
      const duplicateCount = dragContainers.filter(
        ({ key }) => key === container.key,
      ).length;
      const suffix =
        duplicateCount > 1 ? `${container.key}-${index + 1}` : container.key;
      // Compare the container's rendering independently from the resting
      // transform whose one-pixel variance is handled by the page capture.
      const normalization = await page.addStyleTag({
        content: MOTION_DRAG_ELEMENT_STYLES,
      });
      try {
        await expect
          .soft(container.locator)
          .toHaveScreenshot(withScreenshotSuffix(name, suffix), {
            animations: 'disabled',
            maxDiffPixels: 250,
          });
      } finally {
        await normalization.evaluate((element) =>
          element.parentNode?.removeChild(element),
        );
      }
    }
  };
}

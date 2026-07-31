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

/**
 * Shared pixel-capture pipeline used by both the legacy interview-test
 * fixture and the matrix fixture. Captures are CI-only (`enabled`).
 */
export function createCaptureInterview(
  page: Page,
  opts: { enabled: boolean },
): CaptureInterviewFn {
  let stylesInjected = false;
  const isBaselinePlatform =
    process.platform === 'linux' && process.arch === 'arm64';

  return async (name: string, options: CaptureInterviewOptions = {}) => {
    if (!opts.enabled) return;
    if (!isBaselinePlatform) {
      console.warn(
        `[visual] skipping pixel comparison for "${name}" — baselines require Linux ARM64 and this run is ${process.platform}/${process.arch}`,
      );
      return;
    }
    if (!stylesInjected) {
      await page.addStyleTag({ content: VISUAL_STYLES });
      stylesInjected = true;
    }
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
    await expect.soft(page).toHaveScreenshot(`${name}.png`, {
      fullPage: options.fullPage ?? false,
      mask: options.mask,
    });
  };
}

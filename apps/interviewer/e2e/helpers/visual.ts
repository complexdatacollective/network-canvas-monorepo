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
    // Wait for motion to reach REST before sampling. Two problems otherwise:
    // (1) entrance fades sit at their opacity:0 initial variant until a
    // useEffect commits, so toHaveScreenshot can stabilise on two identical
    // PRE-entrance frames; (2) the protocol deck is a spring-physics fan whose
    // cards drift for several frames after mount and, mid-transient, land at
    // frame-timing-dependent sub-pixel positions. A spring's EQUILIBRIUM is
    // deterministic, so we poll element geometry (rounded to whole px) until it
    // stops changing across consecutive animation frames — that is rest.
    // reducedMotion/animations:'disabled' do NOT stop these JS-rAF springs.
    await page.evaluate(async () => {
      const raf = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      // Sample from #root (the app mount) — the interviewer app has NO <main>
      // landmark (only the embedded interview engine does), so a 'main *'
      // selector would match nothing on plain routes like /data and let the
      // loop exit in one frame without waiting for e.g. DataView's spring-
      // physics table entrance. Base UI dialogs portal OUTSIDE #root, so keep
      // the explicit [role="dialog"] clause. Cap generously (#root spans the
      // whole app) so a deep, still-animating element isn't sampled off the end.
      const sample = () =>
        Array.from(document.querySelectorAll('#root *, [role="dialog"] *'))
          .slice(0, 1500)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
          })
          .join('|');
      // Wait until geometry is identical (whole-pixel) across several
      // CONSECUTIVE frames — that is spring rest. Requiring more than one
      // stable pair guards against a janky/dropped frame under CPU load
      // briefly matching mid-animation. Cap at ~150 frames (~2.5s) so a
      // perpetually-moving element can't hang the capture; toHaveScreenshot's
      // own frame-matching guards the fallback.
      const REQUIRED_STABLE = 4;
      let prev = '';
      let stable = 0;
      for (let i = 0; i < 150; i++) {
        await raf();
        const cur = sample();
        if (cur === prev) {
          stable += 1;
          if (stable >= REQUIRED_STABLE) return;
        } else {
          stable = 0;
        }
        prev = cur;
      }
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
  const versionHeading = page.getByRole('heading', {
    level: 4,
    name: 'App version',
    exact: true,
  });
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
    versionHeading.locator('xpath=../..').locator('> div').last(),
    page.getByRole('progressbar', { name: 'Storage usage' }),
    // SettingsRow renders the desc text as the heading's next sibling, inside
    // their shared title/desc column.
    storageHeading.locator('xpath=following-sibling::div[1]'),
    // The control column (here, the id span) is a sibling of the title/desc
    // column two levels above the heading — see SettingsRow.tsx.
    installationHeading.locator('xpath=../..').locator('> div').last(),
  ];
}

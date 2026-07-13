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
// local headed runs functional-only (no baselines needed) while CI asserts
// against the committed Docker-generated baselines.
export function makeCapture(page: Page): CaptureFn {
  const isCI = !!process.env.CI;

  return async (name, options = {}) => {
    if (!isCI) return;
    // Re-inject on every capture, not just once per page instance: a
    // page.reload()/second goto() drops the injected <style>, which would
    // silently un-hide the background lights/focus-rings for a later
    // capture() in the same test.
    await page.addStyleTag({ content: VISUAL_STYLES });
    // Wait for motion to reach REST before sampling. Two problems otherwise:
    // (1) entrance fades sit at their opacity:0 initial variant until a
    // useEffect commits, so toHaveScreenshot can stabilise on two identical
    // PRE-entrance frames; (2) spring-physics surfaces (e.g. the timeline's
    // drag-and-drop stage cards) drift for several frames after mount and,
    // mid-transient, land at frame-timing-dependent sub-pixel positions. A
    // spring's EQUILIBRIUM is deterministic, so we poll element geometry
    // (rounded to whole px) until it stops changing across consecutive
    // animation frames — that is rest. reducedMotion/animations:'disabled' do
    // NOT stop these JS-rAF-driven transitions.
    await page.evaluate(async () => {
      const raf = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      // Sample from #root (the app mount, apps/architect/index.html) — Base
      // UI dialogs portal OUTSIDE #root, so keep the explicit [role="dialog"]
      // clause. Cap generously (#root spans the whole app) so a deep,
      // still-animating element isn't sampled off the end.
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
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: options.fullPage ?? false,
      mask: options.mask,
    });
  };
}

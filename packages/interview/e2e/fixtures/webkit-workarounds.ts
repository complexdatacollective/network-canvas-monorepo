import type { Page } from '@playwright/test';

/**
 * Playwright's Linux WebKit renders `backdrop-filter` in software, and
 * recomputes each blur on EVERY rendering update that invalidates it: the
 * ModalBackdrop's full-viewport blur while any dialog is open, and floating
 * frosted panels (e.g. the pedigree checklist) whenever the canvas behind
 * them animates (measured 150ms-2.2s per frame under CI load). Playwright's
 * actionability checks poll element stability once per rAF frame and click
 * dispatch waits on the same rendering pipeline, so each affected click
 * stretches to seconds and dialog-heavy tests blow their budget. Real WebKit
 * GPU-accelerates backdrop-filter, so this is a test-environment pathology —
 * neutralise backdrop blurs on webkit only. Pixel effect: webkit baselines
 * show sharp (not blurred) content behind translucent veils and panels; the
 * tint itself remains.
 */
export async function neutraliseBackdropFilters(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement('style');
      style.textContent =
        '* { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
      document.head.appendChild(style);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject);
    } else {
      inject();
    }
  });
}

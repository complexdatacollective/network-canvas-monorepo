import { type Locator, type Page } from '@playwright/test';

const HEADER_SELECTOR =
  '[data-stage-section="form"] .sticky.top-0 button[aria-label]';

/**
 * Fixture for SlidesForm-based stages (AlterForm, AlterEdgeForm).
 *
 * SlidesForm has no progress-dot or slide-index UI (verified against
 * packages/interview/src/interfaces/SlidesForm/SlidesForm.tsx and
 * IntroPanel.tsx — no such element exists there), so slide position is
 * tracked by the caller via the current item's header label, not a DOM
 * index affordance. Use `interview.dismissIntro()` (already implemented,
 * e2e/fixtures/interview-fixture.ts) to leave the intro panel — it is
 * generic across AlterForm/AlterEdgeForm, so it is not duplicated here.
 * Field interactions inside a slide's form use the shared `FormFixture`
 * (`stage.form`).
 *
 * Instantiated directly by scenarios (`new SlidesFormFixture(page)`) rather
 * than hung off `StageFixture`, so parallel interface tasks can extend the
 * surface without contending over the shared stage fixture.
 */
export class SlidesFormFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * The current slide's header node locator. AlterForm's renderHeader renders
   * a ConnectedNode -> fresco-ui UINode (a `<button aria-label={label}>`)
   * inside SlidesForm's sticky header wrapper (the
   * `<div className="sticky top-0 z-10 shrink-0">` around `{header}`).
   * AlterEdgeForm's renderHeader returns null, so this resolves to zero
   * elements on edge-subject slides.
   */
  private headerNode(): Locator {
    return this.page.locator(HEADER_SELECTOR);
  }

  /**
   * Read the current slide's item label (node name via useNodeLabel).
   * Returns null on edge-subject slides (AlterEdgeForm has no header).
   */
  async getCurrentItemLabel(): Promise<string | null> {
    const header = this.headerNode();
    if ((await header.count()) === 0) return null;
    return header.getAttribute('aria-label');
  }

  /**
   * True while the stage shows the introduction panel
   * (AlterForm `data-stage-section="intro"`).
   */
  async isOnIntro(): Promise<boolean> {
    return (
      (await this.page.locator('[data-stage-section="intro"]').count()) > 0
    );
  }

  /**
   * Click next-button and wait for either the next slide to mount (header
   * label changes) or the stage to be left (URL step changes, since
   * SlidesForm advancing past the last item calls moveForward() -> the parent
   * navigation updates the `step` query param). Pass the label of the slide
   * being left so two identically-named alters can't false-positive a "slide
   * changed" read; omit on edge-subject stages (no header to compare — this
   * then only detects the URL/stage-section change). "next-button" is the
   * forward NavigationButton's `data-testid`.
   */
  async nextSlide(previousLabel?: string | null): Promise<void> {
    const beforeUrl = this.page.url();
    await this.page.getByTestId('next-button').click();
    await this.page.waitForFunction(
      ({ beforeUrl, previousLabel, selector }) => {
        if (window.location.href !== beforeUrl) return true;
        const stageSection = document.querySelector('[data-stage-section]');
        if (!stageSection) return true;
        if (previousLabel == null) return false;
        const header = document.querySelector(selector);
        return header?.getAttribute('aria-label') !== previousLabel;
      },
      { beforeUrl, previousLabel: previousLabel ?? null, selector: HEADER_SELECTOR },
      { timeout: 10_000 },
    );
  }

  /**
   * Click previous-button expecting NO discard dialog — valid path: slide 0
   * back to intro, or a valid dirty slide that autosaves. Detects the
   * transition via a URL change, the intro panel reappearing, or the header
   * label changing (a valid intra-form step back N -> N-1). "previous-button"
   * is the backward NavigationButton's `data-testid`.
   */
  async previousSlide(): Promise<void> {
    const beforeUrl = this.page.url();
    const beforeLabel = await this.getCurrentItemLabel();
    await this.page.getByTestId('previous-button').click();
    await this.page.waitForFunction(
      ({ beforeUrl, beforeLabel, selector }) => {
        if (window.location.href !== beforeUrl) return true;
        if (document.querySelector('[data-stage-section="intro"]') !== null) {
          return true;
        }
        const header = document.querySelector(selector);
        return header?.getAttribute('aria-label') !== beforeLabel;
      },
      { beforeUrl, beforeLabel: beforeLabel ?? null, selector: HEADER_SELECTOR },
      { timeout: 10_000 },
    );
  }

  /**
   * Click previous-button on an invalid, dirty slide and return once the
   * "Discard changes?" confirm dialog is visible (SlidesForm's
   * useDialog().confirm -> DialogProvider type:'choice'). "previous-button"
   * is the backward NavigationButton's `data-testid`. Resolve with
   * `discardConfirmButton` or `discardCancelButton`.
   */
  async previousSlideExpectingDiscardDialog(): Promise<Locator> {
    await this.page.getByTestId('previous-button').click();
    const dialog = this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', { name: 'Discard changes?' }),
    });
    await dialog.waitFor({ state: 'visible' });
    return dialog;
  }

  /** "Discard changes" primary button (DialogProvider `data-testid="dialog-primary"`). */
  get discardConfirmButton(): Locator {
    return this.page.getByTestId('dialog-primary');
  }

  /** "Cancel" button (DialogProvider `data-testid="dialog-cancel"`). */
  get discardCancelButton(): Locator {
    return this.page.getByTestId('dialog-cancel');
  }
}

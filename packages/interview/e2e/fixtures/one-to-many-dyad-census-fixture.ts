import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Fixture for OneToManyDyadCensus stages.
 *
 * Shows one "source"/focal node (a plain button, className="z-10", no
 * role="option" since it has no onClick — OneToManyDyadCensus.tsx:192-200)
 * and a grid of "target" nodes rendered inside NodeList id="dyad-census-targets"
 * (role="option" each, since they do have onClick — OneToManyDyadCensus.tsx:213-223).
 * Clicking a target toggles an edge to the current focal node
 * (OneToManyDyadCensus.tsx:140-152); selection state is reflected via
 * data-node-selected (Node.tsx:319) scoped to the prompt's createEdge type.
 *
 * Owned by the OneToManyDyadCensus matrix scenarios; instantiated directly in
 * each scenario's run() rather than hung off StageFixture.
 */
export class OneToManyDyadCensusFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** The current focal node — a button with no role="option" override. */
  getSourceNode(): Locator {
    return this.page.locator('button.z-10');
  }

  /**
   * The focal node's visible label (its aria-label).
   *
   * Reads the last matching z-10 button so a brief popLayout overlap during
   * a focal transition (old node still exiting) resolves to the entering node
   * instead of throwing a strict-mode violation.
   */
  async getSourceLabel(): Promise<string> {
    return (await this.getSourceNode().last().getAttribute('aria-label')) ?? '';
  }

  /** The target-grid container (NodeList id="dyad-census-targets"). */
  get targetsContainer(): Locator {
    return this.page.locator('#dyad-census-targets');
  }

  /** A single target node by its label. */
  getTargetNode(label: string): Locator {
    return this.targetsContainer.getByRole('option', { name: label });
  }

  /** Visible target labels, in DOM (i.e. binSortOrder-applied) order. */
  async getTargetLabels(): Promise<string[]> {
    const options = await this.targetsContainer.getByRole('option').all();
    return Promise.all(
      options.map(async (o) => (await o.getAttribute('aria-label')) ?? ''),
    );
  }

  /**
   * Whether a target is fully opaque on screen AND belongs to the active
   * prompt's list. Crossing a prompt boundary changes the NodeList
   * animationKey, which fades the old targets to inline opacity 0, swaps
   * items, then re-runs the stagger entrance — and Playwright's visibility
   * check ignores opacity, so mid-choreography targets count as "visible"
   * while rendering as an empty panel. Checks every ancestor up to the list
   * container because the animated opacity lives on wrapper elements, not
   * the option itself.
   *
   * Opacity alone can't guard the pre-exit window: a label present in both
   * the outgoing and incoming lists (NodeList buffers the old items until
   * the exit completes) matches the still-opaque OLD node. The stagger
   * wrapper's data-stagger-key carries the buffered displayAnimationKey,
   * which only advances to the active prompt index after the swap — so on
   * multi-prompt stages (pips rendered) also require it to match.
   */
  async isTargetSettled(label: string): Promise<boolean> {
    const activePromptIndex = await this.getActivePipIndex();
    try {
      return await this.getTargetNode(label).evaluate(
        (el, expectedStaggerKey) => {
          if (expectedStaggerKey !== null) {
            const wrapper = el.closest('[data-stagger-item]');
            if (
              wrapper?.getAttribute('data-stagger-key') !== expectedStaggerKey
            ) {
              return false;
            }
          }
          for (let node: Element | null = el; node; node = node.parentElement) {
            if (Number(getComputedStyle(node).opacity) < 1) return false;
            if (node.id === 'dyad-census-targets') break;
          }
          return true;
        },
        activePromptIndex === -1 ? null : String(activePromptIndex),
        { timeout: 1000 },
      );
    } catch {
      // Not in the DOM yet (or detached mid-choreography) — not settled.
      return false;
    }
  }

  /** Wait until a target has fully entered the list. */
  async waitForTargetSettled(label: string): Promise<void> {
    await expect.poll(() => this.isTargetSettled(label)).toBe(true);
  }

  /** Click a target node to toggle the edge to the current focal node. */
  async toggleTarget(label: string): Promise<void> {
    // Clicking while the prompt-boundary choreography is re-creating the
    // list detaches the element under the pointer (webkit flake).
    await this.waitForTargetSettled(label);
    await this.getTargetNode(label).click();
  }

  /** Whether a target currently has an edge to the focal node. */
  async isTargetSelected(label: string): Promise<boolean> {
    const selected =
      await this.getTargetNode(label).getAttribute('data-node-selected');
    return selected === 'true';
  }

  /** Pip dot locators (only present when prompts.length > 1). */
  getPips(): Locator {
    return this.page.locator('[data-active]');
  }

  /** Index of the currently active pip, or -1 if no pips are rendered. */
  async getActivePipIndex(): Promise<number> {
    const pips = await this.getPips().all();
    for (let i = 0; i < pips.length; i++) {
      if ((await pips[i]!.getAttribute('data-active')) === 'true') return i;
    }
    return -1;
  }
}

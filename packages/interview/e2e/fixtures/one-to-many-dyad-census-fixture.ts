import type { Locator, Page } from '@playwright/test';

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

  /** Click a target node to toggle the edge to the current focal node. */
  async toggleTarget(label: string): Promise<void> {
    await this.getTargetNode(label).click();
  }

  /** Whether a target currently has an edge to the focal node. */
  async isTargetSelected(label: string): Promise<boolean> {
    const selected = await this.getTargetNode(label).getAttribute(
      'data-node-selected',
    );
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

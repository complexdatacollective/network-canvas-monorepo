import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Fixture for Narrative stages — a read-only network visualisation.
 *
 * Nodes are canvas buttons whose accessible name is the node label (fresco-ui
 * Node.tsx `aria-label={ariaLabel ?? label}`, rendered by CanvasNode.tsx which
 * writes the authored layout as inline `left`/`top` percentages). Edges are
 * `<line data-edge-id>` (EdgeLayer.tsx). Convex hulls are
 * `<polygon fill="var(--cat-N)">` (ConvexHullLayer.tsx). The preset toolbar and
 * behaviours toolbar are fresco-ui SegmentedToolbar instances whose segments are
 * real `<button>`s named by their label. The legend popover is open on mount and
 * only closes on a press of the centre label button, so its accordion sections
 * ('Attributes' | 'Links' | 'Groups') stay reachable across other interactions.
 * Free-draw annotations are `<path stroke="white">` inside a foreground svg.
 *
 * Owned by the Narrative matrix scenarios; instantiated directly in each
 * scenario's run() rather than hung off StageFixture.
 */
export class NarrativeFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** [data-testid="narrative"] (Narrative.tsx). */
  root(): Locator {
    return this.page.getByTestId('narrative');
  }

  /**
   * Wait for the (mocked, identity-echo under e2e) auto-layout simulation to
   * settle. Only meaningful when behaviours.automaticLayout is true.
   */
  async waitForSimulationSettled(): Promise<void> {
    await expect(this.root()).toHaveAttribute(
      'data-simulation-running',
      'false',
      { timeout: 15000 },
    );
  }

  /** A canvas node button, matched by its exact accessible name. */
  getNode(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  /** The node's inline `left` percentage as a number (e.g. "25%" -> 25). */
  async getNodeLeftPercent(label: string): Promise<number> {
    const raw = await this.getNode(label).evaluate((el) => el.style.left);
    return Number.parseFloat(raw);
  }

  /** The node's inline `top` percentage as a number (e.g. "25%" -> 25). */
  async getNodeTopPercent(label: string): Promise<number> {
    const raw = await this.getNode(label).evaluate((el) => el.style.top);
    return Number.parseFloat(raw);
  }

  async isNodeHighlighted(label: string): Promise<boolean> {
    const attr = await this.getNode(label).getAttribute(
      'data-node-highlighted',
    );
    return attr === 'true';
  }

  /** svg line[data-edge-id] elements (EdgeLayer.tsx). */
  getEdgeLines(): Locator {
    return this.page.locator('svg line[data-edge-id]');
  }

  /** svg polygons rendered by ConvexHullLayer (one per group value). */
  getHullPolygons(): Locator {
    return this.page.locator('svg polygon[fill^="var(--cat-"]');
  }

  /** circle.canvas-radar__range rendered by ConcentricCircles.tsx. */
  getBackgroundCircles(): Locator {
    return this.page.locator('circle.canvas-radar__range');
  }

  /** Image background rendered in place of concentric circles. */
  getBackgroundImage(): Locator {
    return this.root().locator('img[alt=""]');
  }

  /** The r attribute of every background circle, in DOM order. */
  async getBackgroundCircleRadii(): Promise<number[]> {
    const circles = await this.getBackgroundCircles().all();
    return Promise.all(
      circles.map(async (c) =>
        Number.parseFloat((await c.getAttribute('r')) ?? '0'),
      ),
    );
  }

  /** Preset toolbar centre label button — also the legend popover trigger. */
  getPresetLabelButton(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  async goToNextPreset(): Promise<void> {
    await this.page.getByRole('button', { name: 'Next preset' }).click();
  }

  async goToPreviousPreset(): Promise<void> {
    await this.page.getByRole('button', { name: 'Previous preset' }).click();
  }

  isNextPresetDisabled(): Promise<boolean> {
    return this.page.getByRole('button', { name: 'Next preset' }).isDisabled();
  }

  isPreviousPresetDisabled(): Promise<boolean> {
    return this.page
      .getByRole('button', { name: 'Previous preset' })
      .isDisabled();
  }

  /** Legend accordion trigger — 'Attributes' | 'Links' | 'Groups'. */
  getAccordionTrigger(section: 'Attributes' | 'Links' | 'Groups'): Locator {
    return this.page.getByRole('button', { name: section, exact: true });
  }

  async toggleAccordionSection(
    section: 'Attributes' | 'Links' | 'Groups',
  ): Promise<void> {
    await this.getAccordionTrigger(section).click();
  }

  /** Highlight radio items inside the open 'Attributes' section. */
  getHighlightRadio(variableLabel: string): Locator {
    return this.page.getByRole('radio', { name: variableLabel, exact: true });
  }

  async selectHighlightRadio(variableLabel: string): Promise<void> {
    await this.getHighlightRadio(variableLabel).click();
  }

  // --- Behaviours panel (BehavioursPanel.tsx) ---

  async toggleAutomaticLayout(): Promise<void> {
    await this.page
      .getByRole('button', {
        name: /Pause automatic layout|Resume automatic layout/,
      })
      .click();
  }

  async toggleDrawing(): Promise<void> {
    await this.page
      .getByRole('button', { name: /Enable drawing|Disable drawing/ })
      .click();
  }

  async toggleFreeze(): Promise<void> {
    await this.page
      .getByRole('button', { name: /Freeze annotations|Unfreeze annotations/ })
      .click();
  }

  async resetAnnotations(): Promise<void> {
    await this.page.getByRole('button', { name: 'Reset annotations' }).click();
  }

  /** svg path elements drawn by Annotations.tsx (stroke="white"). */
  getAnnotationPaths(): Locator {
    return this.page.locator('svg path[stroke="white"]');
  }

  /**
   * Draw a stroke across the canvas as a sequence of relative (0..1) points,
   * mapped onto the narrative root's bounding box and dispatched as a real
   * pointer down/move/up sequence (Annotations.tsx pointer handlers).
   */
  async drawStroke(points: { x: number; y: number }[]): Promise<void> {
    const first = points[0];
    if (!first) throw new Error('drawStroke requires at least one point');
    const box = await this.root().boundingBox();
    if (!box) throw new Error('Narrative root has no bounding box');
    const abs = (p: { x: number; y: number }) => ({
      x: box.x + p.x * box.width,
      y: box.y + p.y * box.height,
    });
    const start = abs(first);
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    for (const p of points.slice(1)) {
      const a = abs(p);
      await this.page.mouse.move(a.x, a.y, { steps: 4 });
    }
    await this.page.mouse.up();
  }

  /**
   * Drag a canvas node by a pixel delta (requires
   * behaviours.allowRepositioning: true — CanvasNode.tsx forwards
   * `disabled: disabled || !allowRepositioning` into useCanvasDrag, whose
   * onPointerDown bails out on `disabled`).
   */
  async dragNodeBy(label: string, dx: number, dy: number): Promise<void> {
    const box = await this.getNode(label).boundingBox();
    if (!box) throw new Error(`Node "${label}" has no bounding box`);
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + dx / 2, startY + dy / 2, { steps: 3 });
    await this.page.mouse.move(startX + dx, startY + dy, { steps: 3 });
    await this.page.mouse.up();
  }
}

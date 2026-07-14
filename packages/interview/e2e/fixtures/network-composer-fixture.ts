import type { Locator, Page } from '@playwright/test';

/**
 * NetworkComposer fixture: single-screen free-form network canvas.
 *
 * Toolbar buttons are icon-only (aria-label only, no visible text) — see
 * packages/interview/src/interfaces/NetworkComposer/ToolPalette.tsx and the
 * SegmentedToolbar `segmentButton` helper (aria-label = the segment's label).
 * The add-node and groups segments are Base UI popovers whose trigger button
 * carries no `aria-pressed`, so open-state is detected via the popover contents
 * being visible rather than an attribute on the button.
 *
 * Owned by the NetworkComposer matrix scenarios; instantiated directly in each
 * scenario's run() rather than hung off StageFixture.
 */
export class NetworkComposerFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get root(): Locator {
    return this.page.getByTestId('network-composer');
  }

  get canvas(): Locator {
    return this.root.getByRole('application');
  }

  /** Every node currently rendered on the canvas (each is a <button>). */
  get nodeButtons(): Locator {
    return this.canvas.getByRole('button');
  }

  get selectToolButton(): Locator {
    return this.page.getByRole('button', { name: 'Select', exact: true });
  }

  get addNodeToolButton(): Locator {
    return this.page.getByRole('button', { name: 'Add node', exact: true });
  }

  get drawEdgeToolButton(): Locator {
    return this.page.getByRole('button', { name: 'Draw edge', exact: true });
  }

  get groupsToolButton(): Locator {
    return this.page.getByRole('button', { name: 'Groups', exact: true });
  }

  get automaticLayoutToggle(): Locator {
    return this.page.getByRole('button', {
      name: 'Automatic layout',
      exact: true,
    });
  }

  get undoButton(): Locator {
    return this.page.getByRole('button', { name: 'Undo', exact: true });
  }

  get redoButton(): Locator {
    return this.page.getByRole('button', { name: 'Redo', exact: true });
  }

  get inspectorPanel(): Locator {
    return this.page.getByTestId('inspector-panel');
  }

  get drawerDeleteButton(): Locator {
    return this.page.getByRole('button', { name: 'Delete', exact: true });
  }

  /** Node button by its quickAdd-variable name (Node.tsx aria-label). */
  getNode(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  /**
   * Add a node by name via the Add-node popover. Opens the popover only when
   * the name field isn't already visible — the popover stays open after Enter
   * so repeated calls add several nodes in a row (AddNodeInput.tsx).
   */
  async addNode(entityLabel: string, name: string): Promise<void> {
    const input = this.page.getByLabel(`${entityLabel} name`);
    if (!(await input.isVisible())) {
      await this.addNodeToolButton.click();
      await input.waitFor({ state: 'visible' });
    }
    await input.fill(name);
    await input.press('Enter');
    await this.getNode(name).waitFor({ state: 'visible' });
  }

  async selectTool(): Promise<void> {
    await this.selectToolButton.click();
  }

  /** Tap a node in whatever tool is currently active. */
  async tapNode(name: string, modifier?: 'Shift' | 'Meta'): Promise<void> {
    const node = this.getNode(name);
    if (modifier) {
      await node.click({ modifiers: [modifier] });
    } else {
      await node.click();
    }
  }

  /** Tap empty canvas background — clears selection (NetworkComposer.tsx). */
  async tapBackground(): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    await this.page.mouse.click(
      box.x + box.width * 0.5,
      box.y + box.height * 0.95,
    );
  }

  /**
   * Drag a node to a normalized (0..1) canvas-relative position. Uses raw
   * mouse events (not locator.dragTo) so intermediate pointermove events fire —
   * the canvas drag handler needs them to track live position.
   */
  async dragNodeTo(name: string, to: { x: number; y: number }): Promise<void> {
    const node = this.getNode(name);
    const nodeBox = await node.boundingBox();
    const canvasBox = await this.canvas.boundingBox();
    if (!nodeBox || !canvasBox) throw new Error('Node or canvas not visible');
    const startX = nodeBox.x + nodeBox.width / 2;
    const startY = nodeBox.y + nodeBox.height / 2;
    const endX = canvasBox.x + canvasBox.width * to.x;
    const endY = canvasBox.y + canvasBox.height * to.y;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + 15, startY + 15);
    await this.page.mouse.move(endX, endY, { steps: 10 });
    await this.page.mouse.up();
  }

  /** Absolute screen coordinate for a normalized (0..1) canvas point. */
  async pointAt(x: number, y: number): Promise<{ x: number; y: number }> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    return { x: box.x + box.width * x, y: box.y + box.height * y };
  }

  /**
   * Drag a lasso selection over the given normalized canvas-relative points,
   * dragging from empty background. Requires the Groups tool active, or the
   * select tool with a convexHullVariable configured (ComposerCanvas.tsx).
   */
  async lassoSelect(points: { x: number; y: number }[]): Promise<void> {
    const abs = await Promise.all(points.map((p) => this.pointAt(p.x, p.y)));
    const first = abs[0]!;
    await this.page.mouse.move(first.x, first.y);
    await this.page.mouse.down();
    for (const point of abs.slice(1)) {
      await this.page.mouse.move(point.x, point.y, { steps: 5 });
    }
    await this.page.mouse.up();
  }

  /** Open the Groups popover (if closed) and pick an option by its label. */
  async pickGroup(optionLabel: string): Promise<void> {
    const option = this.page.getByRole('button', {
      name: optionLabel,
      exact: true,
    });
    if (!(await option.isVisible())) {
      await this.groupsToolButton.click();
      await option.waitFor({ state: 'visible' });
    }
    await option.click();
  }

  /** Open the Draw-edge menu and pick an edge type by its codebook label. */
  async selectEdgeType(label: string): Promise<void> {
    await this.drawEdgeToolButton.click();
    const item = this.page.getByRole('menuitemradio', { name: label });
    await item.waitFor({ state: 'visible' });
    await item.click();
  }

  /**
   * Click the rendered edge line between two nodes (by their names). The line
   * renders at the two nodes' live canvas positions (EdgeLayer.tsx), so this
   * clicks their midpoint rather than the (largely invisible) SVG line element.
   */
  async clickEdgeBetween(nameA: string, nameB: string): Promise<void> {
    const boxA = await this.getNode(nameA).boundingBox();
    const boxB = await this.getNode(nameB).boundingBox();
    if (!boxA || !boxB) throw new Error('Endpoint node(s) not visible');
    const midX = (boxA.x + boxA.width / 2 + boxB.x + boxB.width / 2) / 2;
    const midY = (boxA.y + boxA.height / 2 + boxB.y + boxB.height / 2) / 2;
    await this.page.mouse.click(midX, midY);
  }

  /** Selection-bar "Add all to X" button (2+ nodes selected). */
  getSelectionBarButton(label: string): Locator {
    return this.page.getByRole('button', { name: `Add all to ${label}` });
  }

  async toggleAutomaticLayout(): Promise<void> {
    await this.automaticLayoutToggle.click();
  }

  async undo(): Promise<void> {
    await this.undoButton.click();
  }

  async redo(): Promise<void> {
    await this.redoButton.click();
  }

  async undoViaKeyboard(): Promise<void> {
    await this.root.focus();
    await this.page.keyboard.press('ControlOrMeta+z');
  }

  async redoViaKeyboard(): Promise<void> {
    await this.root.focus();
    await this.page.keyboard.press('ControlOrMeta+Shift+z');
  }

  async deleteSelection(): Promise<void> {
    await this.root.focus();
    await this.page.keyboard.press('Delete');
  }

  /** Concentric-circles background rings (ConcentricCircles.tsx). */
  get backgroundCircles(): Locator {
    return this.root.locator(
      'svg[aria-hidden="true"] > circle.canvas-radar__range',
    );
  }

  /**
   * Convex-hull group shapes. ConvexHullLayer renders one <polygon> per group
   * (not <path>); the lasso overlay also renders a <polygon>, so scope reads to
   * the relevant gesture. One element exists per group with a positioned node.
   */
  get hullShapes(): Locator {
    return this.root.locator('svg polygon');
  }

  /** Visible edge lines (EdgeLayer.tsx renders one <line data-edge-id> each). */
  get edgeLines(): Locator {
    return this.root.locator('svg line[data-edge-id]');
  }

  /**
   * Attribute-form field container, keyed by the codebook variable id — the
   * same `data-field-name` convention the shared form fixture uses.
   */
  getField(variableId: string): Locator {
    return this.inspectorPanel.locator(`[data-field-name="${variableId}"]`);
  }
}

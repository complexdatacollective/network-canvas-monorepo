import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  edgeSourceProperty,
  edgeTargetProperty,
  entityAttributesProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import { expectResponsiveCanvasBackgroundImage } from '../helpers/canvas-background-image.js';
import type { InterfaceScenarios, ScenarioDefinition } from './types.js';

const BACKGROUND_IMAGE_FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../../apps/documentation/public/assets/responsive-svg-background.svg',
);

// --- module-private helpers ------------------------------------------------

/**
 * A canvas or drawer node, matched by the accessible label the codebook's
 * `name` variable resolves to. Mirrors `SociogramFixture.getNode` — kept local
 * because the drag helpers below are not on the shared fixture (this task owns
 * only its scenarios file).
 */
function sociogramNode(page: Page, label: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${label}`) });
}

/**
 * Drag a node — from the drawer (first placement) or already placed on the
 * canvas (reposition) — to a normalized (0-1) position on the sociogram
 * canvas. Both cases use pointer-capture-based drag (useCanvasDrag.ts /
 * fresco-ui's useDragSource), NOT native HTML5 DnD, so Playwright's
 * dragAndDrop() cannot simulate it — this uses raw mouse.down/move/up.
 */
async function dragNodeToCanvasPosition(
  page: Page,
  label: string,
  target: { x: number; y: number },
): Promise<void> {
  const node = sociogramNode(page, label);
  const canvas = page.locator('[data-zone-id="sociogram-canvas"]');
  const nodeBox = await node.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!nodeBox || !canvasBox) {
    throw new Error(`Could not measure node "${label}" or the canvas`);
  }
  const startX = nodeBox.x + nodeBox.width / 2;
  const startY = nodeBox.y + nodeBox.height / 2;
  const endX = canvasBox.x + canvasBox.width * target.x;
  const endY = canvasBox.y + canvasBox.height * target.y;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Clear the 5px DRAG_THRESHOLD (useCanvasDrag.ts) before the real move,
  // otherwise the eventual pointerup is treated as a click.
  await page.mouse.move(startX + 8, startY + 8);
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
}

/**
 * Drag a placed canvas node onto the unplaced-node drawer to unplace it (the
 * drag-based equivalent of `unplaceNodeViaKeyboard`).
 */
async function dragNodeToDrawer(page: Page, label: string): Promise<void> {
  const node = sociogramNode(page, label);
  const drawer = page.locator('[data-zone-id="node-drawer"]');
  const nodeBox = await node.boundingBox();
  const drawerBox = await drawer.boundingBox();
  if (!nodeBox || !drawerBox) {
    throw new Error(`Could not measure node "${label}" or the drawer`);
  }
  const startX = nodeBox.x + nodeBox.width / 2;
  const startY = nodeBox.y + nodeBox.height / 2;
  const endX = drawerBox.x + drawerBox.width / 2;
  const endY = drawerBox.y + Math.min(20, drawerBox.height / 2);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY + 8);
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
}

/**
 * Unplace a focused, placed canvas node via the keyboard (Delete), the
 * accessible equivalent of `dragNodeToDrawer` (Sociogram.tsx wires
 * `onNodeRemove` only in MANUAL mode).
 */
async function unplaceNodeViaKeyboard(
  page: Page,
  label: string,
): Promise<void> {
  const node = sociogramNode(page, label);
  await node.focus();
  await node.press('Delete');
}

/** Read a node's raw attribute value from a network snapshot, by name. */
function nodeAttribute(
  network: NcNetwork | undefined,
  nameVariableId: string,
  name: string,
  attributeId: string,
): unknown {
  const node = network?.nodes.find(
    (n) => n[entityAttributesProperty][nameVariableId] === name,
  );
  return node?.[entityAttributesProperty][attributeId];
}

/** Narrow an unknown layout value to a numeric {x, y} point (or null). */
function asPoint(value: unknown): { x: number; y: number } | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value
  ) {
    const { x, y } = value;
    if (typeof x === 'number' && typeof y === 'number') {
      return { x, y };
    }
  }
  return null;
}

// --- manual-baseline-placed-and-unplaced ---------------------------------

function buildManualBaseline(): ScenarioDefinition {
  return {
    id: 'manual-baseline-placed-and-unplaced',
    covers: [
      'type',
      'id',
      'label',
      'interviewScript',
      'subject',
      'prompts',
      'prompts[].id',
      'prompts[].text',
      'prompts[].layout.layoutVariable',
      'behaviours.automaticLayout',
      'background.concentricCircles',
      'background.skewedTowardCenter',
    ],
    smoke: true,
    visual: true,
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      const stage = synth.addStage('Sociogram', {
        label: 'Friendship map',
        interviewScript: 'Ask about closeness.',
      });
      // Placed: explicit layout attribute.
      synth.addManualNode(stage.id, personType.id, 'p0', {
        [nameVar.id]: 'Ash',
        [layoutVar.id]: { x: 0.3, y: 0.3 },
      });
      synth.addManualNode(stage.id, personType.id, 'p1', {
        [nameVar.id]: 'Bea',
        [layoutVar.id]: { x: 0.6, y: 0.4 },
      });
      synth.addManualNode(stage.id, personType.id, 'p2', {
        [nameVar.id]: 'Cy',
        [layoutVar.id]: { x: 0.5, y: 0.7 },
      });
      // Unplaced: layout explicitly null (unset key would also normalise to
      // null via getNetwork's neutral-fill, but null is pinned so `has()`
      // holds and the node is counted as unplaced rather than dropped).
      synth.addManualNode(stage.id, personType.id, 'p3', {
        [nameVar.id]: 'Dee',
        [layoutVar.id]: null,
      });
      synth.addManualNode(stage.id, personType.id, 'p4', {
        [nameVar.id]: 'Eve',
        [layoutVar.id]: null,
      });
      stage.addPrompt({
        text: 'Position each person.',
        layout: { layoutVariable: layoutVar.id },
      });
      return synth;
    },
    run: async ({ page }) => {
      const sociogram = page.getByTestId('sociogram');
      await expect(sociogram).toHaveAttribute('data-layout-mode', 'MANUAL');

      await expect(
        sociogram.locator(
          '[data-zone-id="sociogram-canvas"] button[aria-label]',
        ),
      ).toHaveCount(3);
      await expect(page.locator('[data-zone-id="node-drawer"]')).toContainText(
        '2 unplaced',
      );

      // behaviours.automaticLayout is absent, so SimulationPanel never mounts
      // (Sociogram.tsx only renders it when layoutMode === 'AUTOMATIC').
      await expect(
        page.getByRole('button', { name: 'Pause Auto Layout' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Resume Auto Layout' }),
      ).toHaveCount(0);

      // label/interviewScript are stage metadata, never rendered to the
      // participant.
      await expect(page.getByText('Friendship map')).toHaveCount(0);
      await expect(page.getByText('Ask about closeness.')).toHaveCount(0);

      // Default background: ConcentricCircles n=4, skewed=true. Scope to the
      // radar class — every Node renders its own aria-hidden icon svg, so a
      // bare `svg[aria-hidden] circle` would also count those.
      await expect(sociogram.locator('circle.canvas-radar__range')).toHaveCount(
        4,
      );
    },
  };
}

// --- background-concentric-circles-variants ------------------------------

function buildBackgroundConcentricCirclesVariants(): ScenarioDefinition {
  return {
    id: 'background-concentric-circles-variants',
    covers: ['background.concentricCircles', 'background.skewedTowardCenter'],
    visual: true,
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      // 3 stages sharing one personType/layoutVar; 0 nodes each — background
      // rendering doesn't depend on any nodes being present.
      const stage0 = synth.addStage('Sociogram', {
        initialNodes: { count: 0 },
        background: { concentricCircles: 4, skewedTowardCenter: true },
      });
      stage0.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      const stage1 = synth.addStage('Sociogram', {
        initialNodes: { count: 0 },
        background: { concentricCircles: 2, skewedTowardCenter: false },
      });
      stage1.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      const stage2 = synth.addStage('Sociogram', {
        initialNodes: { count: 0 },
        background: { concentricCircles: 0 },
      });
      stage2.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      return synth;
    },
    run: async ({ page, interview }) => {
      const sociogram = page.getByTestId('sociogram');
      // Scope to the radar class: the off-screen node-measurement container
      // renders a Node (its own aria-hidden icon svg) even with zero nodes.
      const circles = sociogram.locator('circle.canvas-radar__range');

      // ConcentricCircles.tsx reverses its radii array before rendering, so
      // the FIRST rendered circle is the outermost (r=50) and the LAST is the
      // innermost.
      await expect(circles).toHaveCount(4);
      expect(Number(await circles.first().getAttribute('r'))).toBeCloseTo(
        50,
        0,
      );
      expect(Number(await circles.last().getAttribute('r'))).toBeCloseTo(
        16.6,
        0,
      );

      // 3 single-prompt stages, so next() advances the STAGE each time.
      await interview.next();
      await expect(circles).toHaveCount(2);
      expect(Number(await circles.first().getAttribute('r'))).toBeCloseTo(
        50,
        0,
      );
      expect(Number(await circles.last().getAttribute('r'))).toBeCloseTo(25, 0);

      await interview.next();
      // ConcentricCircles returns null at n=0 — no radar circles render.
      await expect(circles).toHaveCount(0);
    },
  };
}

// --- background-image ----------------------------------------------------

function buildBackgroundImage(): ScenarioDefinition {
  const bgAssetId = 'sociogram-bg-1';
  return {
    id: 'background-image',
    covers: ['background.image'],
    visual: true,
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      const stage = synth.addStage('Sociogram', {
        initialNodes: { count: 3 },
        // The image variant excludes concentricCircles (schema XOR); the run()
        // asserts no radar circles render alongside the image.
        background: { image: bgAssetId },
      });
      stage.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      synth.addAsset({
        id: bgAssetId,
        name: 'Background',
        type: 'image',
        source: 'responsive-svg-background.svg',
      });
      return synth;
    },
    assets: [
      {
        assetId: bgAssetId,
        name: 'Background',
        type: 'image',
        source: 'responsive-svg-background.svg',
        localPath: BACKGROUND_IMAGE_FIXTURE,
      },
    ],
    run: async ({ page }) => {
      const sociogram = page.getByTestId('sociogram');
      const img = sociogram.locator('img[alt="Background"]');
      await expect(img).toBeVisible();
      await expect(img).toHaveAttribute(
        'src',
        /responsive-svg-background\.svg/,
      );
      // Actually loaded from the asset server, not a broken image.
      await expect
        .poll(() =>
          img.evaluate((el) =>
            el instanceof HTMLImageElement ? el.naturalWidth : 0,
          ),
        )
        .toBeGreaterThan(0);
      // background.image wins: no ConcentricCircles renders alongside it.
      // (Scoped to the radar class — nodes render their own aria-hidden svgs.)
      await expect(sociogram.locator('circle.canvas-radar__range')).toHaveCount(
        0,
      );
      await expectResponsiveCanvasBackgroundImage(page, img);
    },
  };
}

// --- manual-drag-place-and-reposition ------------------------------------

function buildManualDragPlaceAndReposition(): ScenarioDefinition {
  let layoutVarId = '';
  let nameVarId = '';
  return {
    id: 'manual-drag-place-and-reposition',
    covers: [
      'prompts[].layout.layoutVariable',
      'behaviours.allowRepositioning',
      'behaviours.freeDraw',
    ],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      nameVarId = nameVar.id;
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      layoutVarId = layoutVar.id;
      const stage = synth.addStage('Sociogram', {
        // Both are dead config for Sociogram — asserted in run().
        behaviours: { allowRepositioning: false, freeDraw: true },
      });
      synth.addManualNode(stage.id, personType.id, 'p0', {
        [nameVar.id]: 'Ash',
        [layoutVar.id]: { x: 0.2, y: 0.2 },
      });
      synth.addManualNode(stage.id, personType.id, 'p1', {
        [nameVar.id]: 'Bea',
        [layoutVar.id]: null,
      });
      stage.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      return synth;
    },
    run: async ({ page, protocol, interview }) => {
      const sociogram = page.getByTestId('sociogram');

      // freeDraw is read only by Narrative — Sociogram.tsx never passes a
      // `foreground` prop to Canvas, so the Narrative-only annotation layer
      // (its distinctive `path[stroke="white"]`) can never mount here.
      await expect(sociogram.locator('path[stroke="white"]')).toHaveCount(0);

      await dragNodeToCanvasPosition(page, 'Bea', { x: 0.7, y: 0.3 });

      await expect(page.locator('[data-zone-id="node-drawer"]')).toContainText(
        '0 unplaced',
      );
      let state = await protocol.getNetworkState(interview.interviewId);
      const bea = asPoint(nodeAttribute(state, nameVarId, 'Bea', layoutVarId));
      expect(bea).not.toBeNull();
      expect(bea!.x).toBeCloseTo(0.7, 1);
      expect(bea!.y).toBeCloseTo(0.3, 1);

      // behaviours.allowRepositioning:false is dead for Sociogram — dragging an
      // already-placed node still repositions it (Sociogram never passes
      // `allowRepositioning` through to Canvas, so CanvasNode's own default of
      // `true` always wins).
      await dragNodeToCanvasPosition(page, 'Ash', { x: 0.4, y: 0.6 });

      await expect
        .poll(async () => {
          state = await protocol.getNetworkState(interview.interviewId);
          const ash = asPoint(
            nodeAttribute(state, nameVarId, 'Ash', layoutVarId),
          );
          return ash
            ? Math.abs(ash.x - 0.4) < 0.1 && Math.abs(ash.y - 0.6) < 0.1
            : false;
        })
        .toBe(true);

      // Annotation layer still never renders after both drags.
      await expect(sociogram.locator('path[stroke="white"]')).toHaveCount(0);
    },
  };
}

// --- unplace-drag-and-keyboard -------------------------------------------

function buildUnplaceDragAndKeyboard(): ScenarioDefinition {
  let layoutVarId = '';
  let nameVarId = '';
  return {
    id: 'unplace-drag-and-keyboard',
    covers: ['prompts[].layout.layoutVariable'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      nameVarId = nameVar.id;
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      layoutVarId = layoutVar.id;
      const stage = synth.addStage('Sociogram');
      synth.addManualNode(stage.id, personType.id, 'p0', {
        [nameVar.id]: 'Ash',
        [layoutVar.id]: { x: 0.3, y: 0.3 },
      });
      synth.addManualNode(stage.id, personType.id, 'p1', {
        [nameVar.id]: 'Bea',
        [layoutVar.id]: { x: 0.6, y: 0.3 },
      });
      synth.addManualNode(stage.id, personType.id, 'p2', {
        [nameVar.id]: 'Cy',
        [layoutVar.id]: { x: 0.45, y: 0.6 },
      });
      stage.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      return synth;
    },
    run: async ({ page, protocol, interview }) => {
      await dragNodeToDrawer(page, 'Ash');

      // announce() fires a transient (~1s) polite status update; assert first.
      await expect(
        page.locator('[role="status"]', {
          hasText: 'Ash returned to the drawer.',
        }),
      ).toHaveCount(1);
      await expect(page.locator('[data-zone-id="node-drawer"]')).toContainText(
        '1 unplaced',
      );
      let state = await protocol.getNetworkState(interview.interviewId);
      expect(nodeAttribute(state, nameVarId, 'Ash', layoutVarId)).toBeNull();

      await unplaceNodeViaKeyboard(page, 'Bea');

      await expect(page.locator('[data-zone-id="node-drawer"]')).toContainText(
        '2 unplaced',
      );
      state = await protocol.getNetworkState(interview.interviewId);
      expect(nodeAttribute(state, nameVarId, 'Bea', layoutVarId)).toBeNull();
    },
  };
}

// --- automatic-layout-settle ---------------------------------------------

function buildAutomaticLayoutSettle(): ScenarioDefinition {
  let layoutVarId = '';
  return {
    id: 'automatic-layout-settle',
    covers: ['behaviours.automaticLayout'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      layoutVarId = layoutVar.id;
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      const stage = synth.addStage('Sociogram', {
        initialNodes: { count: 6 },
        behaviours: { automaticLayout: true },
      });
      stage.addPrompt({
        layout: { layoutVariable: layoutVar.id },
        edges: { create: friendshipType.id, display: [friendshipType.id] },
      });
      // Nodes are NOT given explicit layout attrs — the simulation is
      // responsible for placing all 6 from scratch.
      synth.addEdges(
        [
          [0, 1],
          [0, 2],
          [1, 2],
          [3, 4],
          [4, 5],
        ],
        friendshipType.id,
      );
      return synth;
    },
    run: async ({ page, protocol, interview, stage }) => {
      const sociogram = page.getByTestId('sociogram');
      await expect(sociogram).toHaveAttribute('data-layout-mode', 'AUTOMATIC');
      await expect(page.locator('[data-zone-id="node-drawer"]')).toHaveCount(0);

      await stage.sociogram.waitForSimulationSettled();

      await expect(
        sociogram.locator(
          '[data-zone-id="sociogram-canvas"] button[aria-label]',
        ),
      ).toHaveCount(6);

      const state = await protocol.getNetworkState(interview.interviewId);
      const positions = (state?.nodes ?? []).map((n) =>
        asPoint(n[entityAttributesProperty][layoutVarId]),
      );
      expect(positions).toHaveLength(6);
      for (const position of positions) {
        expect(position).not.toBeNull();
      }
    },
  };
}

// --- automatic-layout-pause-resume ---------------------------------------

function buildAutomaticLayoutPauseResume(): ScenarioDefinition {
  return {
    id: 'automatic-layout-pause-resume',
    covers: ['behaviours.automaticLayout'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      const stage = synth.addStage('Sociogram', {
        behaviours: { automaticLayout: true },
      });
      // Named nodes with null layout — the simulation grids them from scratch.
      ['Ash', 'Bea', 'Cy', 'Dee'].forEach((name, i) => {
        synth.addManualNode(stage.id, personType.id, `person-${i}`, {
          [nameVar.id]: name,
          [layoutVar.id]: null,
        });
      });
      stage.addPrompt({
        layout: { layoutVariable: layoutVar.id },
        edges: { create: friendshipType.id, display: [friendshipType.id] },
      });
      synth.addEdges(
        [
          [0, 1],
          [2, 3],
        ],
        friendshipType.id,
      );
      return synth;
    },
    run: async ({ page, stage }) => {
      const sociogram = page.getByTestId('sociogram');
      await stage.sociogram.waitForSimulationSettled();

      await expect(
        page.getByRole('button', { name: 'Pause Auto Layout' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Pause Auto Layout' }).click();

      // After pause the toggle flips label; the worker is stopped.
      await expect(
        page.getByRole('button', { name: 'Resume Auto Layout' }),
      ).toBeVisible();

      // Dragging while paused pins the node but does not restart the worker.
      await dragNodeToCanvasPosition(page, 'Ash', { x: 0.12, y: 0.12 });
      await expect(sociogram).toHaveAttribute(
        'data-simulation-running',
        'false',
      );

      await page.getByRole('button', { name: 'Resume Auto Layout' }).click();
      // Resuming re-settles ~instantly via the mock grid worker — it must
      // transition back to false, not hang at true.
      await expect
        .poll(() => sociogram.getAttribute('data-simulation-running'))
        .toBe('false');
      await expect(
        page.getByRole('button', { name: 'Pause Auto Layout' }),
      ).toBeVisible();
    },
  };
}

// --- automatic-layout-node-drag ------------------------------------------

function buildAutomaticLayoutNodeDrag(): ScenarioDefinition {
  let layoutVarId = '';
  let nameVarId = '';
  return {
    id: 'automatic-layout-node-drag',
    covers: ['behaviours.automaticLayout'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      nameVarId = nameVar.id;
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      layoutVarId = layoutVar.id;
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      const stage = synth.addStage('Sociogram', {
        behaviours: { automaticLayout: true },
      });
      ['Ash', 'Bea', 'Cy', 'Dee', 'Eve'].forEach((name, i) => {
        synth.addManualNode(stage.id, personType.id, `person-${i}`, {
          [nameVar.id]: name,
          [layoutVar.id]: null,
        });
      });
      stage.addPrompt({
        layout: { layoutVariable: layoutVar.id },
        edges: { create: friendshipType.id, display: [friendshipType.id] },
      });
      synth.addEdges(
        [
          [0, 1],
          [1, 2],
          [3, 4],
        ],
        friendshipType.id,
      );
      return synth;
    },
    run: async ({ page, protocol, interview, stage }) => {
      await stage.sociogram.waitForSimulationSettled();

      let state = await protocol.getNetworkState(interview.interviewId);
      const before = asPoint(
        nodeAttribute(state, nameVarId, 'Ash', layoutVarId),
      );
      expect(before).not.toBeNull();

      await dragNodeToCanvasPosition(page, 'Ash', { x: 0.15, y: 0.85 });
      await stage.sociogram.waitForSimulationSettled();

      state = await protocol.getNetworkState(interview.interviewId);
      const after = asPoint(
        nodeAttribute(state, nameVarId, 'Ash', layoutVarId),
      );
      expect(after).not.toBeNull();
      // The dragged position is persisted (handleNodeDragEnd) even though the
      // simulation owns positions — Ash moved from its settled grid cell.
      expect(
        Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y),
      ).toBeGreaterThan(0.05);
    },
  };
}

// --- edges-full-matrix ----------------------------------------------------

function buildEdgesFullMatrix(): ScenarioDefinition {
  let friendshipTypeId = '';
  let workTypeId = '';
  return {
    id: 'edges-full-matrix',
    covers: ['prompts[].edges.create', 'prompts[].edges.display'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      friendshipTypeId = friendshipType.id;
      const workType = synth.addEdgeType({ name: 'Work' });
      workTypeId = workType.id;

      const stage = synth.addStage('Sociogram');
      const placements: [string, string, { x: number; y: number }][] = [
        ['ash', 'Ash', { x: 0.2, y: 0.3 }],
        ['bea', 'Bea', { x: 0.55, y: 0.3 }],
        ['cy', 'Cy', { x: 0.35, y: 0.65 }],
        ['dee', 'Dee', { x: 0.7, y: 0.65 }],
      ];
      for (const [uid, name, layout] of placements) {
        synth.addManualNode(stage.id, personType.id, uid, {
          [nameVar.id]: name,
          [layoutVar.id]: layout,
        });
      }

      // prompt0: create + display the same type.
      stage.addPrompt({
        text: 'Connect friends.',
        layout: { layoutVariable: layoutVar.id },
        edges: {
          create: friendshipType.id,
          display: [friendshipType.id],
        },
      });
      // prompt1: display both existing edge types, no create.
      stage.addPrompt({
        text: 'Review all relationships.',
        layout: { layoutVariable: layoutVar.id },
        edges: { display: [friendshipType.id, workType.id] },
      });
      // prompt2: create work edges with an explicitly EMPTY display — proves
      // edges.create is not auto-added to edges.display at runtime.
      stage.addPrompt({
        text: 'Connect colleagues.',
        layout: { layoutVariable: layoutVar.id },
        edges: { create: workType.id, display: [] },
      });

      // Seed one edge of each type, chosen not to collide with the taps below.
      synth.addEdges([[2, 3]], friendshipType.id); // Cy—Dee friendship
      synth.addEdges([[0, 1]], workType.id); // Ash—Bea work
      return synth;
    },
    run: async ({ page, protocol, interview, stage }) => {
      const lines = page.locator('line[data-edge-id]');
      const ash = stage.sociogram.getNode('Ash');

      // prompt0: only the seeded friendship (Cy—Dee) shows.
      await expect(lines).toHaveCount(1);

      await stage.sociogram.connectNodes('Ash', 'Bea');
      let state = await protocol.getNetworkState(interview.interviewId);
      expect(
        state?.edges.some(
          (e) =>
            e.type === friendshipTypeId &&
            [e[edgeSourceProperty], e[edgeTargetProperty]].includes('ash') &&
            [e[edgeSourceProperty], e[edgeTargetProperty]].includes('bea'),
        ),
      ).toBe(true);
      await expect(lines).toHaveCount(2);

      // Toggle the same pair back off.
      await stage.sociogram.connectNodes('Ash', 'Bea');
      await expect(lines).toHaveCount(1);
      state = await protocol.getNetworkState(interview.interviewId);
      expect(
        state?.edges.some(
          (e) =>
            e.type === friendshipTypeId &&
            [e[edgeSourceProperty], e[edgeTargetProperty]].includes('ash') &&
            [e[edgeSourceProperty], e[edgeTargetProperty]].includes('bea'),
        ),
      ).toBe(false);

      // Select then deselect the same node: no edge, linking clears.
      await stage.sociogram.clickNode('Ash');
      await expect(ash).toHaveAttribute('data-node-linking', 'true');
      await stage.sociogram.clickNode('Ash');
      await expect(ash).not.toHaveAttribute('data-node-linking');
      await expect(lines).toHaveCount(1);

      // prompt1: both seeded edges shown, with two distinct stroke colours.
      await interview.nextButton.click();
      await expect(lines).toHaveCount(2);
      const strokes = await lines.evaluateAll((els) =>
        els.map((el) => el.getAttribute('stroke')),
      );
      expect(new Set(strokes).size).toBe(2);

      // prompt2 (gotcha): create is set but display is empty, so a new work
      // edge lands in the network yet nothing new renders.
      await interview.nextButton.click();
      await expect(lines).toHaveCount(0);

      await stage.sociogram.clickNode('Cy');
      await expect(stage.sociogram.getNode('Cy')).toHaveAttribute(
        'data-node-linking',
        'true',
      );
      await stage.sociogram.clickNode('Dee');
      await expect(stage.sociogram.getNode('Cy')).not.toHaveAttribute(
        'data-node-linking',
      );
      await expect
        .poll(async () => {
          state = await protocol.getNetworkState(interview.interviewId);
          return state?.edges.filter((e) => e.type === workTypeId).length ?? 0;
        })
        .toBe(2);
      // edges.create is NOT auto-added to edges.display — still nothing renders.
      await expect(lines).toHaveCount(0);
    },
  };
}

// --- highlight-toggle -----------------------------------------------------

function buildHighlightToggle(): ScenarioDefinition {
  let closeFriendVarId = '';
  let nameVarId = '';
  return {
    id: 'highlight-toggle',
    covers: [
      'prompts[].highlight.allowHighlighting',
      'prompts[].highlight.variable',
    ],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      nameVarId = nameVar.id;
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      const closeFriendVar = personType.addVariable({
        type: 'boolean',
        name: 'closeFriend',
      });
      closeFriendVarId = closeFriendVar.id;
      const stage = synth.addStage('Sociogram');
      synth.addManualNode(stage.id, personType.id, 'p0', {
        [nameVar.id]: 'Ash',
        [layoutVar.id]: { x: 0.35, y: 0.4 },
        [closeFriendVar.id]: true,
      });
      synth.addManualNode(stage.id, personType.id, 'p1', {
        [nameVar.id]: 'Bea',
        [layoutVar.id]: { x: 0.65, y: 0.4 },
        [closeFriendVar.id]: false,
      });
      stage.addPrompt({
        text: 'Mark your close friends.',
        layout: { layoutVariable: layoutVar.id },
        // Builder default: allowHighlighting resolves to true.
        highlight: { variable: closeFriendVar.id },
      });
      return synth;
    },
    run: async ({ protocol, interview, stage }) => {
      await expect
        .poll(() => stage.sociogram.isNodeHighlighted('Ash'))
        .toBe(true);
      expect(await stage.sociogram.isNodeHighlighted('Bea')).toBe(false);

      await stage.sociogram.clickNode('Bea');
      await expect
        .poll(() => stage.sociogram.isNodeHighlighted('Bea'))
        .toBe(true);
      let state = await protocol.getNetworkState(interview.interviewId);
      expect(nodeAttribute(state, nameVarId, 'Bea', closeFriendVarId)).toBe(
        true,
      );

      await stage.sociogram.clickNode('Ash');
      await expect
        .poll(() => stage.sociogram.isNodeHighlighted('Ash'))
        .toBe(false);
      state = await protocol.getNetworkState(interview.interviewId);
      expect(nodeAttribute(state, nameVarId, 'Ash', closeFriendVarId)).toBe(
        false,
      );

      // No edges.create on this prompt, so linking never engages.
      await expect(stage.sociogram.getNode('Ash')).not.toHaveAttribute(
        'data-node-linking',
      );
      await expect(stage.sociogram.getNode('Bea')).not.toHaveAttribute(
        'data-node-linking',
      );
    },
  };
}

// --- highlight-display-only-with-edges-create ----------------------------

function buildHighlightDisplayOnlyWithEdgesCreate(): ScenarioDefinition {
  let closeFriendVarId = '';
  let friendshipTypeId = '';
  let nameVarId = '';
  return {
    id: 'highlight-display-only-with-edges-create',
    covers: [
      'prompts[].highlight.variable',
      'prompts[].highlight.allowHighlighting',
    ],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      nameVarId = nameVar.id;
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      const closeFriendVar = personType.addVariable({
        type: 'boolean',
        name: 'closeFriend',
      });
      closeFriendVarId = closeFriendVar.id;
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      friendshipTypeId = friendshipType.id;

      const stage = synth.addStage('Sociogram');
      synth.addManualNode(stage.id, personType.id, 'ash', {
        [nameVar.id]: 'Ash',
        [layoutVar.id]: { x: 0.3, y: 0.3 },
        [closeFriendVar.id]: true,
      });
      synth.addManualNode(stage.id, personType.id, 'bea', {
        [nameVar.id]: 'Bea',
        [layoutVar.id]: { x: 0.7, y: 0.3 },
        [closeFriendVar.id]: false,
      });
      synth.addManualNode(stage.id, personType.id, 'cy', {
        [nameVar.id]: 'Cy',
        [layoutVar.id]: { x: 0.5, y: 0.7 },
        [closeFriendVar.id]: false,
      });
      stage.addPrompt({
        text: 'Draw a line between people who know each other.',
        layout: { layoutVariable: layoutVar.id },
        edges: { create: friendshipType.id, display: [friendshipType.id] },
      });
      // Schema-legal display-only highlight: the superRefine only forbids
      // edges.create combined with allowHighlighting:true, not a bare
      // display-only highlight.variable. The fluent builder hardcodes
      // allowHighlighting:true whenever `highlight` is passed, so we set the
      // display-only highlight directly on the built prompt entry instead
      // (the builder change is out of this task's file ownership).
      const lastPrompt =
        stage.stageEntry.prompts[stage.stageEntry.prompts.length - 1];
      if (lastPrompt && 'highlight' in lastPrompt) {
        lastPrompt.highlight = {
          allowHighlighting: false,
          variable: closeFriendVar.id,
        };
      }
      return synth;
    },
    run: async ({ protocol, interview, stage }) => {
      // Read-only highlight renders from the seeded attribute before any
      // interaction — allowHighlighting:false never blocks display.
      await expect
        .poll(() => stage.sociogram.isNodeHighlighted('Ash'))
        .toBe(true);
      expect(await stage.sociogram.isNodeHighlighted('Bea')).toBe(false);

      // Tapping nodes on this prompt always creates/toggles an edge — the
      // create handler branch runs before the highlight branch is reached.
      await stage.sociogram.connectNodes('Ash', 'Bea');

      expect(await stage.sociogram.getEdgeCount()).toBe(1);
      const state = await protocol.getNetworkState(interview.interviewId);
      expect(state?.edges.some((e) => e.type === friendshipTypeId)).toBe(true);

      // Highlight attribute is untouched by the tap — display-only confirmed.
      expect(nodeAttribute(state, nameVarId, 'Ash', closeFriendVarId)).toBe(
        true,
      );
      expect(await stage.sociogram.isNodeHighlighted('Ash')).toBe(true);
      expect(await stage.sociogram.isNodeHighlighted('Bea')).toBe(false);
    },
  };
}

// --- multi-prompt-navigation-and-collapse --------------------------------

function buildMultiPromptNavigationAndCollapse(): ScenarioDefinition {
  return {
    id: 'multi-prompt-navigation-and-collapse',
    covers: ['prompts', 'prompts[].text'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      const closeFriendVar = personType.addVariable({
        type: 'boolean',
        name: 'closeFriend',
      });
      const stage = synth.addStage('Sociogram');
      const grid: { x: number; y: number }[] = [
        { x: 0.25, y: 0.3 },
        { x: 0.5, y: 0.3 },
        { x: 0.75, y: 0.3 },
        { x: 0.35, y: 0.6 },
        { x: 0.6, y: 0.6 },
      ];
      grid.forEach((layout, i) => {
        synth.addManualNode(stage.id, personType.id, `person-${i}`, {
          [nameVar.id]: `Person ${i + 1}`,
          [layoutVar.id]: layout,
          [closeFriendVar.id]: false,
        });
      });
      stage.addPrompt({
        text: 'Position each person.',
        layout: { layoutVariable: layoutVar.id },
      });
      stage.addPrompt({
        text: 'Now mark close friends.',
        layout: { layoutVariable: layoutVar.id },
        highlight: { variable: closeFriendVar.id },
      });
      return synth;
    },
    run: async ({ page, interview }) => {
      const toggle = page.getByTestId('prompts-toggle');
      // Two prompts => two navigation pips (Pips is the only data-active user).
      await expect(page.locator('[data-active]')).toHaveCount(2);

      const controlsId = await toggle.getAttribute('aria-controls');
      expect(controlsId).toBeTruthy();
      const region = page.locator(`[id="${controlsId}"]`);

      // Collapse.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect
        .poll(() => region.evaluate((el) => el.getBoundingClientRect().height))
        .toBe(0);

      // Expand.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect
        .poll(() => region.evaluate((el) => el.getBoundingClientRect().height))
        .toBeGreaterThan(0);

      // Advance the prompt (same stage — plain click, not interview.next()).
      const stepBefore = new URL(page.url()).searchParams.get('step');
      await interview.nextButton.click();
      await expect(page.getByText('Now mark close friends.')).toBeVisible();
      // Toggle auto-reopens when the prompt changes (CollapsablePrompts).
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const stepAfter = new URL(page.url()).searchParams.get('step');
      expect(stepAfter).toBe(stepBefore);
    },
  };
}

// --- sortorder-drawer-unplaced-nodes -------------------------------------

function buildSortOrderDrawer(): ScenarioDefinition {
  return {
    id: 'sortorder-drawer-unplaced-nodes',
    covers: ['prompts[].sortOrder'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      const stage = synth.addStage('Sociogram');

      const names = ['Dave', 'Alice', 'Carol', 'Bob'];
      names.forEach((name, i) => {
        // Layout explicitly null => unplaced (in the drawer).
        synth.addManualNode(stage.id, personType.id, `person-${i}`, {
          [nameVar.id]: name,
          [layoutVar.id]: null,
        });
      });

      stage.addPrompt({
        text: 'Unplaced people, sorted by name descending.',
        layout: { layoutVariable: layoutVar.id },
        sortOrder: [{ property: nameVar.id, direction: 'desc' }],
      });
      stage.addPrompt({
        text: 'Unplaced people, sorted by name ascending.',
        layout: { layoutVariable: layoutVar.id },
        sortOrder: [{ property: nameVar.id, direction: 'asc' }],
      });
      return synth;
    },
    run: async ({ page, interview }) => {
      const drawerLabels = () =>
        page
          .locator('[data-zone-id="node-drawer"] button[aria-label]')
          .evaluateAll((buttons) =>
            buttons
              .map((b) => b.getAttribute('aria-label') ?? '')
              .filter((l) => l !== 'Expand drawer' && l !== 'Collapse drawer'),
          );

      await expect
        .poll(drawerLabels)
        .toEqual(['Dave', 'Carol', 'Bob', 'Alice']);

      // 2 prompts on 1 stage: "next" advances the prompt, not the stage, so the
      // URL step never changes — interview.next() would time out.
      await interview.nextButton.click();
      await expect(
        page.getByText('Unplaced people, sorted by name ascending.'),
      ).toBeVisible();
      await expect
        .poll(drawerLabels)
        .toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
    },
  };
}

// --- subject-filters-to-node-type ----------------------------------------

function buildSubjectFiltersToNodeType(): ScenarioDefinition {
  return {
    id: 'subject-filters-to-node-type',
    covers: ['subject'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const personName = personType.addVariable({
        type: 'text',
        name: 'name',
      });
      const personLayoutVar = personType.addVariable({
        type: 'layout',
        name: 'personLayout',
      });
      const venueType = synth.addNodeType({ name: 'Venue' });
      const venueName = venueType.addVariable({ type: 'text', name: 'name' });
      const venueLayoutVar = venueType.addVariable({
        type: 'layout',
        name: 'venueLayout',
      });

      const stage = synth.addStage('Sociogram', {
        subject: { entity: 'node', type: personType.id },
        initialNodes: { count: 0 },
      });
      const people: [string, string, { x: number; y: number }][] = [
        ['person-0', 'Ash', { x: 0.3, y: 0.3 }],
        ['person-1', 'Bea', { x: 0.6, y: 0.3 }],
        ['person-2', 'Cy', { x: 0.45, y: 0.6 }],
      ];
      for (const [uid, name, layout] of people) {
        synth.addManualNode(stage.id, personType.id, uid, {
          [personName.id]: name,
          [personLayoutVar.id]: layout,
        });
      }
      const venues: [string, string, { x: number; y: number }][] = [
        ['venue-0', 'Cafe', { x: 0.2, y: 0.8 }],
        ['venue-1', 'Park', { x: 0.8, y: 0.8 }],
      ];
      for (const [uid, name, layout] of venues) {
        synth.addManualNode(stage.id, venueType.id, uid, {
          [venueName.id]: name,
          [venueLayoutVar.id]: layout,
        });
      }
      stage.addPrompt({ layout: { layoutVariable: personLayoutVar.id } });
      return synth;
    },
    run: async ({ page, protocol, interview }) => {
      const sociogram = page.getByTestId('sociogram');
      // Only the 3 Person nodes render on the canvas.
      await expect(
        sociogram.locator(
          '[data-zone-id="sociogram-canvas"] button[aria-label]',
        ),
      ).toHaveCount(3);
      // Pinned observed behaviour: the drawer always renders in MANUAL mode
      // (the plan's "drawer absent" is incorrect). All 3 Person nodes are
      // placed and the 2 Venue nodes are off-type, so the drawer shows
      // "0 unplaced" — filtering is by subject type, not node existence.
      await expect(page.locator('[data-zone-id="node-drawer"]')).toContainText(
        '0 unplaced',
      );

      // All 5 nodes are retained in the network — filtering is display-only.
      const state = await protocol.getNetworkState(interview.interviewId);
      expect(state?.nodes).toHaveLength(5);
    },
  };
}

export const sociogramScenarios: InterfaceScenarios = {
  interfaceType: 'Sociogram',
  scenarios: [
    buildManualBaseline(),
    buildBackgroundConcentricCirclesVariants(),
    buildBackgroundImage(),
    buildManualDragPlaceAndReposition(),
    buildUnplaceDragAndKeyboard(),
    buildAutomaticLayoutSettle(),
    buildAutomaticLayoutPauseResume(),
    buildAutomaticLayoutNodeDrag(),
    buildEdgesFullMatrix(),
    buildHighlightToggle(),
    buildHighlightDisplayOnlyWithEdgesCreate(),
    buildMultiPromptNavigationAndCollapse(),
    buildSortOrderDrawer(),
    buildSubjectFiltersToNodeType(),
  ],
};

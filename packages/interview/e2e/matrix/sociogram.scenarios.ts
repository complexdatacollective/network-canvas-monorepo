import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  edgeSourceProperty,
  edgeTargetProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import { expectResponsiveCanvasBackgroundImage } from '../helpers/canvas-background-image.js';
import type { InterfaceScenarios, ScenarioDefinition } from './types.js';

const BACKGROUND_IMAGE_FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../../apps/documentation/public/assets/responsive-svg-background.svg',
);

// A researcher's own wording for the layout toggle, distinct from the text
// Network Canvas supplies, so an assertion on it proves the stage's own
// setting is what the participant sees.
const PAUSE_LAYOUT = 'Hold the layout - matrix check';
const RESUME_LAYOUT = 'Release the layout - matrix check';

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
  startYFraction = 0.5,
): Promise<void> {
  const node = sociogramNode(page, label);
  const canvas = page.locator('[data-zone-id="sociogram-canvas"]');
  const nodeBox = await node.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!nodeBox || !canvasBox) {
    throw new Error(`Could not measure node "${label}" or the canvas`);
  }
  const startX = nodeBox.x + nodeBox.width / 2;
  const startY = nodeBox.y + nodeBox.height * startYFraction;
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
  const drawer = page.locator('[aria-label="Drawer"]');
  const drawerTab = drawer.getByRole('button');
  const nodeBox = await node.boundingBox();
  const drawerBox = await drawer.boundingBox();
  const drawerTabBox = await drawerTab.boundingBox();
  if (!nodeBox || !drawerBox || !drawerTabBox) {
    throw new Error(`Could not measure node "${label}" or the drawer tab`);
  }
  const startX = nodeBox.x + nodeBox.width / 2;
  const startY = nodeBox.y + nodeBox.height / 2;
  const tabX = drawerTabBox.x + drawerTabBox.width / 2;
  const tabY = drawerTabBox.y + drawerTabBox.height / 2;
  const outsideTabX = drawerBox.x + 8;
  const restingTabColor = await drawerTab.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  if (
    outsideTabX >= drawerTabBox.x &&
    outsideTabX <= drawerTabBox.x + drawerTabBox.width
  ) {
    throw new Error('Could not find space beside the collapsed drawer tab');
  }

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY + 8);

  await expect(drawerTab).toHaveAttribute('data-drop-target-valid', 'true');
  await expect(drawerTab).toHaveAttribute('aria-expanded', 'false');
  const illuminatedTabColor = await drawerTab.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(illuminatedTabColor).not.toBe(restingTabColor);

  // The collapsed wrapper is wider than its visible tab. Moving along that
  // otherwise invisible strip must leave the drawer closed.
  await page.mouse.move(outsideTabX, tabY, { steps: 10 });
  await expect(drawerTab).toHaveAttribute('aria-expanded', 'false');

  await page.mouse.move(tabX, tabY, { steps: 5 });
  await expect(drawerTab).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(async () => {
      const expandedDrawerBox = await drawer.boundingBox();
      const currentTabBox = await drawerTab.boundingBox();
      if (!expandedDrawerBox || !currentTabBox) return 0;
      return expandedDrawerBox.height - currentTabBox.height;
    })
    .toBeGreaterThan(48);

  const dropHint = page.getByText('Drop here to remove');
  await expect(dropHint).toBeVisible();
  const dropHintBox = await dropHint.boundingBox();
  if (!dropHintBox) {
    throw new Error('Could not measure the expanded drawer drop area');
  }
  await page.mouse.move(
    dropHintBox.x + dropHintBox.width / 2,
    dropHintBox.y + dropHintBox.height / 2,
    { steps: 5 },
  );
  await expect(drawerTab).toHaveAttribute('aria-expanded', 'true');
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
      'layout',
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
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      const stage = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        label: 'Friendship map',
        interviewScript: 'Ask about closeness.',
      });
      // Placed: an explicit position in the layout.
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
      await expect(
        page.getByRole('button', { name: /^2 unplaced\b/ }),
      ).toBeVisible();

      // behaviours.automaticLayout is absent, so SimulationPanel never mounts
      // (Sociogram.tsx only renders it when layoutMode === 'AUTOMATIC').
      await expect(
        page.getByRole('button', { name: 'Pause automatic layout' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Resume automatic layout' }),
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
      const concentricBackground = sociogram.getByTestId(
        'sociogram-concentric-background',
      );
      await expect(concentricBackground).toHaveJSProperty('tagName', 'svg');
      await expect(concentricBackground).toHaveCSS('padding', '0px');
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
      synth.addNodeType({ name: 'Person' });
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      // 3 stages sharing one personType/layoutVar. Background rendering
      // doesn't depend on nodes, but a canvas with no one on it is skipped,
      // so the first stage seeds one person that all three stages show.
      const stage0 = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        initialNodes: { count: 1 },
        background: { concentricCircles: 4, skewedTowardCenter: true },
      });
      stage0.addPrompt();
      const stage1 = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        initialNodes: { count: 0 },
        background: { concentricCircles: 2, skewedTowardCenter: false },
      });
      stage1.addPrompt();
      const stage2 = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        initialNodes: { count: 0 },
        background: { concentricCircles: 0 },
      });
      stage2.addPrompt();
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
      synth.addNodeType({ name: 'Person' });
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      const stage = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        initialNodes: { count: 3 },
        // The image variant excludes concentricCircles (schema XOR); the run()
        // asserts no radar circles render alongside the image.
        background: { image: bgAssetId },
      });
      stage.addPrompt();
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
      const img = sociogram.locator('img[alt=""]');
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
    covers: ['layout', 'prompts[].task'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      nameVarId = nameVar.id;
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      layoutVarId = layoutVar.id;
      const stage = synth.addStage('Sociogram', { layout: layoutVar.id });
      synth.addManualNode(stage.id, personType.id, 'p0', {
        [nameVar.id]: 'Ash',
        [layoutVar.id]: { x: 0.2, y: 0.2 },
      });
      synth.addManualNode(stage.id, personType.id, 'p1', {
        [nameVar.id]: 'Bea',
        [layoutVar.id]: null,
      });
      stage.addPrompt({ task: 'layout' });
      return synth;
    },
    run: async ({ page, protocol, interview }) => {
      const sociogram = page.getByTestId('sociogram');

      // A Sociogram never offers free-draw, so the Narrative-only annotation
      // layer (its distinctive `path[stroke="white"]`) can never mount here.
      await expect(sociogram.locator('path[stroke="white"]')).toHaveCount(0);

      await dragNodeToCanvasPosition(page, 'Bea', { x: 0.7, y: 0.3 });

      await expect(
        page.getByRole('button', { name: /^0 unplaced\b/ }),
      ).toBeVisible();
      let state = await protocol.getNetworkState(interview.interviewId);
      const bea = asPoint(nodeAttribute(state, nameVarId, 'Bea', layoutVarId));
      expect(bea).not.toBeNull();
      expect(bea!.x).toBeCloseTo(0.7, 1);
      expect(bea!.y).toBeCloseTo(0.3, 1);

      // In a layout task dragging an already-placed node repositions it.
      const canvas = page.locator('[data-zone-id="sociogram-canvas"]');
      const ashNode = sociogramNode(page, 'Ash');
      const drawer = page.getByLabel('Drawer', { exact: true });
      const drawerTab = drawer.getByRole('button');
      const canvasBox = await canvas.boundingBox();
      const drawerBox = await drawer.boundingBox();
      const drawerTabBox = await drawerTab.boundingBox();
      if (!canvasBox || !drawerBox || !drawerTabBox) {
        throw new Error('Could not measure the canvas or collapsed drawer');
      }

      const drawerGapWidth = drawerTabBox.x - drawerBox.x;
      if (drawerGapWidth <= 0) {
        throw new Error(
          'Collapsed drawer has no transparent area beside its tab',
        );
      }

      const coveredTarget = {
        x: (drawerBox.x + drawerGapWidth / 2 - canvasBox.x) / canvasBox.width,
        y:
          (drawerTabBox.y + drawerTabBox.height / 2 - canvasBox.y) /
          canvasBox.height,
      };
      await dragNodeToCanvasPosition(page, 'Ash', coveredTarget);

      await expect
        .poll(async () => {
          state = await protocol.getNetworkState(interview.interviewId);
          const ash = asPoint(
            nodeAttribute(state, nameVarId, 'Ash', layoutVarId),
          );
          return ash
            ? Math.abs(ash.x - coveredTarget.x) < 0.1 && ash.y > 0.85
            : false;
        })
        .toBe(true);

      const ashBox = await ashNode.boundingBox();
      const updatedDrawerBox = await drawer.boundingBox();
      const updatedDrawerTabBox = await drawerTab.boundingBox();
      if (!ashBox || !updatedDrawerBox || !updatedDrawerTabBox) {
        throw new Error(
          'Could not measure the bottom node or collapsed drawer',
        );
      }

      const overlapTop = Math.max(ashBox.y, updatedDrawerBox.y);
      const overlapBottom = Math.min(
        ashBox.y + ashBox.height,
        updatedDrawerBox.y + updatedDrawerBox.height,
      );
      const coveredNodePoint = {
        x: ashBox.x + ashBox.width / 2,
        y: overlapTop + (overlapBottom - overlapTop) / 2,
      };
      if (
        overlapBottom <= overlapTop ||
        coveredNodePoint.x < updatedDrawerBox.x ||
        coveredNodePoint.x > updatedDrawerBox.x + updatedDrawerBox.width ||
        (coveredNodePoint.x >= updatedDrawerTabBox.x &&
          coveredNodePoint.x <=
            updatedDrawerTabBox.x + updatedDrawerTabBox.width)
      ) {
        throw new Error(
          'Bottom node did not overlap the drawer outside its tab',
        );
      }

      const hitNodeLabel = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return element?.closest('button')?.getAttribute('aria-label') ?? null;
      }, coveredNodePoint);
      expect(hitNodeLabel).toMatch(/^Ash/);

      const coveredStartYFraction =
        (coveredNodePoint.y - ashBox.y) / ashBox.height;
      await dragNodeToCanvasPosition(
        page,
        'Ash',
        { x: 0.4, y: 0.6 },
        coveredStartYFraction,
      );

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
    covers: ['layout'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      nameVarId = nameVar.id;
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      layoutVarId = layoutVar.id;
      const stage = synth.addStage('Sociogram', { layout: layoutVar.id });
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
      stage.addPrompt();
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
      await expect(
        page.getByRole('button', { name: /^1 unplaced\b/ }),
      ).toBeVisible();
      let state = await protocol.getNetworkState(interview.interviewId);
      expect(
        nodeAttribute(state, nameVarId, 'Ash', layoutVarId),
      ).toBeUndefined();

      await unplaceNodeViaKeyboard(page, 'Bea');

      await expect(
        page.getByRole('button', { name: /^2 unplaced\b/ }),
      ).toBeVisible();
      state = await protocol.getNetworkState(interview.interviewId);
      expect(
        nodeAttribute(state, nameVarId, 'Bea', layoutVarId),
      ).toBeUndefined();
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
      synth.addNodeType({ name: 'Person' });
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      layoutVarId = layoutVar.id;
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      const stage = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        initialNodes: { count: 6 },
        behaviours: { automaticLayout: true },
      });
      stage.addPrompt({
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
    covers: [
      'behaviours.automaticLayout',
      'tooltips.pauseLayout',
      'tooltips.resumeLayout',
    ],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      const stage = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        behaviours: { automaticLayout: true },
      });
      synth.setInterfaceText('buttons', 'pauseLayout', PAUSE_LAYOUT);
      synth.setInterfaceText('buttons', 'resumeLayout', RESUME_LAYOUT);
      // Named nodes with null layout — the simulation grids them from scratch.
      ['Ash', 'Bea', 'Cy', 'Dee'].forEach((name, i) => {
        synth.addManualNode(stage.id, personType.id, `person-${i}`, {
          [nameVar.id]: name,
          [layoutVar.id]: null,
        });
      });
      stage.addPrompt({
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
        page.getByRole('button', { name: PAUSE_LAYOUT }),
      ).toBeVisible();
      // The words Network Canvas supplies are not shown in either state.
      const supplied = page.getByRole('button', {
        name: /Pause automatic layout|Resume automatic layout/,
      });
      await expect(supplied).toHaveCount(0);
      await page.getByRole('button', { name: PAUSE_LAYOUT }).click();

      // After pause the toggle flips label; the worker is stopped.
      await expect(
        page.getByRole('button', { name: RESUME_LAYOUT }),
      ).toBeVisible();
      await expect(supplied).toHaveCount(0);

      // Dragging while paused pins the node but does not restart the worker.
      await dragNodeToCanvasPosition(page, 'Ash', { x: 0.12, y: 0.12 });
      await expect(sociogram).toHaveAttribute(
        'data-simulation-running',
        'false',
      );

      await page.getByRole('button', { name: RESUME_LAYOUT }).click();
      // Resuming re-settles ~instantly via the mock grid worker — it must
      // transition back to false, not hang at true.
      await expect
        .poll(() => sociogram.getAttribute('data-simulation-running'))
        .toBe('false');
      await expect(
        page.getByRole('button', { name: PAUSE_LAYOUT }),
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
    covers: ['behaviours.automaticLayout', 'prompts[].task'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      nameVarId = nameVar.id;
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      layoutVarId = layoutVar.id;
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      const stage = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        behaviours: { automaticLayout: true },
      });
      ['Ash', 'Bea', 'Cy', 'Dee', 'Eve'].forEach((name, i) => {
        synth.addManualNode(stage.id, personType.id, `person-${i}`, {
          [nameVar.id]: name,
          [layoutVar.id]: null,
        });
      });
      stage.addPrompt({
        task: 'layout',
        text: 'Move people where you like.',
        edges: { display: [friendshipType.id] },
      });
      stage.addPrompt({
        task: 'connect',
        text: 'Link people who know each other.',
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
      // In a layout task the dragged position is persisted
      // (handleNodeDragEnd) even though the simulation owns positions — Ash
      // moved from its settled grid cell.
      expect(
        Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y),
      ).toBeGreaterThan(0.05);

      // In the connect task nobody can be moved: a drag leaves Ash exactly
      // where it was before the drag, the mirror of the layout task above.
      await interview.nextButton.click();
      await expect(
        page.getByText('Link people who know each other.'),
      ).toBeVisible();
      await stage.sociogram.waitForSimulationSettled();
      state = await protocol.getNetworkState(interview.interviewId);
      const beforeConnectDrag = asPoint(
        nodeAttribute(state, nameVarId, 'Ash', layoutVarId),
      );
      expect(beforeConnectDrag).not.toBeNull();
      await dragNodeToCanvasPosition(page, 'Ash', { x: 0.9, y: 0.1 });
      await stage.sociogram.waitForSimulationSettled();
      state = await protocol.getNetworkState(interview.interviewId);
      const afterConnect = asPoint(
        nodeAttribute(state, nameVarId, 'Ash', layoutVarId),
      );
      expect(afterConnect).not.toBeNull();
      expect(
        Math.abs(afterConnect!.x - beforeConnectDrag!.x) +
          Math.abs(afterConnect!.y - beforeConnectDrag!.y),
      ).toBeLessThan(0.001);
    },
  };
}

// --- edges-full-matrix ----------------------------------------------------

function buildEdgesFullMatrix(): ScenarioDefinition {
  let friendshipTypeId = '';
  let workTypeId = '';
  return {
    id: 'edges-full-matrix',
    covers: [
      'prompts[].task',
      'prompts[].edges.create',
      'prompts[].edges.display',
    ],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      friendshipTypeId = friendshipType.id;
      const workType = synth.addEdgeType({ name: 'Work' });
      workTypeId = workType.id;

      const stage = synth.addStage('Sociogram', { layout: layoutVar.id });
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
        task: 'connect',
        text: 'Connect friends.',
        edges: {
          create: friendshipType.id,
          display: [friendshipType.id],
        },
      });
      // prompt1: a layout task that displays both existing edge types.
      stage.addPrompt({
        task: 'layout',
        text: 'Review all relationships.',
        edges: { display: [friendshipType.id, workType.id] },
      });
      // prompt2: create work edges with an explicitly EMPTY display — proves
      // edges.create is not auto-added to edges.display at runtime.
      stage.addPrompt({
        task: 'connect',
        text: 'Connect colleagues.',
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
      'prompts[].task',
      'prompts[].highlight[].type',
      'prompts[].highlight[].variable',
    ],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      nameVarId = nameVar.id;
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      const closeFriendVar = personType.addVariable({
        type: 'boolean',
        name: 'closeFriend',
      });
      closeFriendVarId = closeFriendVar.id;
      const stage = synth.addStage('Sociogram', { layout: layoutVar.id });
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
        task: 'highlight',
        text: 'Mark your close friends.',
        highlight: [{ type: personType.id, variable: closeFriendVar.id }],
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

      // A highlight task creates no edges, so linking never engages.
      await expect(stage.sociogram.getNode('Ash')).not.toHaveAttribute(
        'data-node-linking',
      );
      await expect(stage.sociogram.getNode('Bea')).not.toHaveAttribute(
        'data-node-linking',
      );
    },
  };
}

// --- the three tasks ------------------------------------------------------

/**
 * Ash and Bea placed, Cy still in the drawer; Ash is marked as a close friend.
 * The stage has one prompt of the given task.
 */
function buildTaskStage(
  task: 'layout' | 'highlight' | 'connect',
  ids: { nameVarId: string; layoutVarId: string; closeFriendVarId: string },
): SyntheticInterview {
  const synth = new SyntheticInterview();
  const personType = synth.addNodeType({ name: 'Person' });
  const nameVar = personType.addVariable({ type: 'text', name: 'name' });
  ids.nameVarId = nameVar.id;
  const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
  ids.layoutVarId = layoutVar.id;
  const closeFriendVar = personType.addVariable({
    type: 'boolean',
    name: 'closeFriend',
  });
  ids.closeFriendVarId = closeFriendVar.id;
  const friendshipType = synth.addEdgeType({ name: 'Friendship' });

  const stage = synth.addStage('Sociogram', { layout: layoutVar.id });
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
    [layoutVar.id]: null,
    [closeFriendVar.id]: false,
  });
  if (task === 'layout') {
    stage.addPrompt({ task: 'layout', text: 'Place everyone.' });
  }
  if (task === 'highlight') {
    stage.addPrompt({
      task: 'highlight',
      text: 'Mark your close friends.',
      highlight: [{ variable: closeFriendVar.id }],
    });
  }
  if (task === 'connect') {
    stage.addPrompt({
      task: 'connect',
      text: 'Link people who know each other.',
      edges: { create: friendshipType.id, display: [friendshipType.id] },
    });
  }
  return synth;
}

function buildTaskLayout(): ScenarioDefinition {
  const ids = { nameVarId: '', layoutVarId: '', closeFriendVarId: '' };
  return {
    id: 'task-layout',
    covers: ['prompts[].task'],
    seedNetwork: true,
    build: () => buildTaskStage('layout', ids),
    run: async ({ page, protocol, interview, stage }) => {
      // A highlight is drawn only during a highlight task.
      expect(await stage.sociogram.isNodeHighlighted('Ash')).toBe(false);
      await expect(stage.sociogram.getNode('Cy')).toBeEnabled();

      await dragNodeToCanvasPosition(page, 'Ash', { x: 0.5, y: 0.7 });
      await expect
        .poll(async () => {
          const state = await protocol.getNetworkState(interview.interviewId);
          const ash = asPoint(
            nodeAttribute(state, ids.nameVarId, 'Ash', ids.layoutVarId),
          );
          return ash ? Math.abs(ash.y - 0.7) < 0.1 : false;
        })
        .toBe(true);

      // Tapping toggles nothing in a layout task.
      await stage.sociogram.clickNode('Bea');
      await expect(stage.sociogram.getNode('Bea')).not.toHaveAttribute(
        'data-node-linking',
      );
      const state = await protocol.getNetworkState(interview.interviewId);
      expect(
        nodeAttribute(state, ids.nameVarId, 'Bea', ids.closeFriendVarId),
      ).toBe(false);
    },
  };
}

function buildTaskHighlight(): ScenarioDefinition {
  const ids = { nameVarId: '', layoutVarId: '', closeFriendVarId: '' };
  return {
    id: 'task-highlight',
    covers: ['prompts[].task', 'prompts[].highlight[].variable'],
    seedNetwork: true,
    build: () => buildTaskStage('highlight', ids),
    run: async ({ page, protocol, interview, stage }) => {
      await expect
        .poll(() => stage.sociogram.isNodeHighlighted('Ash'))
        .toBe(true);

      // Nobody can be moved in a highlight task.
      await dragNodeToCanvasPosition(page, 'Bea', { x: 0.5, y: 0.8 });
      let state = await protocol.getNetworkState(interview.interviewId);
      expect(
        asPoint(nodeAttribute(state, ids.nameVarId, 'Bea', ids.layoutVarId)),
      ).toEqual({ x: 0.7, y: 0.3 });

      // The drag ended as a tap, or no tap at all; either way one tap now
      // decides Bea's highlight.
      const beaBefore = await stage.sociogram.isNodeHighlighted('Bea');
      await stage.sociogram.clickNode('Bea');
      await expect
        .poll(() => stage.sociogram.isNodeHighlighted('Bea'))
        .toBe(!beaBefore);
      state = await protocol.getNetworkState(interview.interviewId);
      expect(
        nodeAttribute(state, ids.nameVarId, 'Bea', ids.closeFriendVarId),
      ).toBe(!beaBefore);
    },
  };
}

function buildTaskConnect(): ScenarioDefinition {
  const ids = { nameVarId: '', layoutVarId: '', closeFriendVarId: '' };
  return {
    id: 'task-connect',
    covers: ['prompts[].task', 'prompts[].edges.create'],
    seedNetwork: true,
    build: () => buildTaskStage('connect', ids),
    run: async ({ page, protocol, interview, stage }) => {
      // A highlight is drawn only during a highlight task.
      expect(await stage.sociogram.isNodeHighlighted('Ash')).toBe(false);

      // Nobody can be moved in a connect task.
      await dragNodeToCanvasPosition(page, 'Bea', { x: 0.5, y: 0.8 });
      let state = await protocol.getNetworkState(interview.interviewId);
      expect(
        asPoint(nodeAttribute(state, ids.nameVarId, 'Bea', ids.layoutVarId)),
      ).toEqual({ x: 0.7, y: 0.3 });
      // A drag that does not move a node may end as a tap; clear any pending
      // source before linking.
      if (
        (await stage.sociogram
          .getNode('Bea')
          .getAttribute('data-node-linking')) === 'true'
      ) {
        await stage.sociogram.clickNode('Bea');
      }

      await stage.sociogram.connectNodes('Ash', 'Bea');
      expect(await stage.sociogram.getEdgeCount()).toBe(1);
      state = await protocol.getNetworkState(interview.interviewId);
      expect(state?.edges).toHaveLength(1);
      // Tapping writes no highlight in a connect task.
      expect(
        nodeAttribute(state, ids.nameVarId, 'Bea', ids.closeFriendVarId),
      ).toBe(false);
    },
  };
}

// --- unplaced-nodes-disabled-outside-layout -------------------------------

function buildUnplacedNodesDisabledOutsideLayout(): ScenarioDefinition {
  return {
    id: 'unplaced-nodes-disabled-outside-layout',
    covers: ['prompts[].task'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      const closeFriendVar = personType.addVariable({
        type: 'boolean',
        name: 'closeFriend',
      });
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      const stage = synth.addStage('Sociogram', { layout: layoutVar.id });
      synth.addManualNode(stage.id, personType.id, 'ash', {
        [nameVar.id]: 'Ash',
        [layoutVar.id]: { x: 0.4, y: 0.4 },
      });
      synth.addManualNode(stage.id, personType.id, 'bea', {
        [nameVar.id]: 'Bea',
        [layoutVar.id]: null,
      });
      stage.addPrompt({ task: 'layout', text: 'Place everyone.' });
      stage.addPrompt({
        task: 'highlight',
        text: 'Mark your close friends.',
        highlight: [{ variable: closeFriendVar.id }],
      });
      stage.addPrompt({
        task: 'connect',
        text: 'Link people who know each other.',
        edges: { create: friendshipType.id },
      });
      return synth;
    },
    run: async ({ page, interview, stage }) => {
      const bea = stage.sociogram.getNode('Bea');
      const ash = stage.sociogram.getNode('Ash');

      await expect(bea).toBeEnabled();

      await interview.nextButton.click();
      await expect(bea).toBeDisabled();
      await expect(ash).toBeEnabled();

      await interview.nextButton.click();
      await expect(bea).toBeDisabled();
      await expect(ash).toBeEnabled();
      // The drawer stays visible so the gap is evident.
      await expect(
        page.getByRole('button', { name: /^1 unplaced\b/ }),
      ).toBeVisible();
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
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      const closeFriendVar = personType.addVariable({
        type: 'boolean',
        name: 'closeFriend',
      });
      const stage = synth.addStage('Sociogram', { layout: layoutVar.id });
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
      });
      stage.addPrompt({
        text: 'Now mark close friends.',
        highlight: [{ variable: closeFriendVar.id }],
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
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      const stage = synth.addStage('Sociogram', { layout: layoutVar.id });

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
        sortOrder: [{ property: nameVar.id, direction: 'desc' }],
      });
      stage.addPrompt({
        text: 'Unplaced people, sorted by name ascending.',
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
      const venueType = synth.addNodeType({ name: 'Venue' });
      const venueName = venueType.addVariable({ type: 'text', name: 'name' });
      const groupType = synth.addNodeType({ name: 'Group' });
      const groupName = groupType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });

      // The stage shows people and venues, but not groups.
      const stage = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        subject: { entity: 'node', types: [personType.id, venueType.id] },
      });
      const nodes: [string, string, string, { x: number; y: number }][] = [
        [personType.id, personName.id, 'Ash', { x: 0.3, y: 0.3 }],
        [personType.id, personName.id, 'Bea', { x: 0.6, y: 0.3 }],
        [personType.id, personName.id, 'Cy', { x: 0.45, y: 0.6 }],
        [venueType.id, venueName.id, 'Cafe', { x: 0.2, y: 0.8 }],
        [venueType.id, venueName.id, 'Park', { x: 0.8, y: 0.8 }],
        [groupType.id, groupName.id, 'Choir', { x: 0.5, y: 0.5 }],
      ];
      nodes.forEach(([typeId, nameId, name, layout], index) => {
        synth.addManualNode(stage.id, typeId, `node-${index}`, {
          [nameId]: name,
          [layoutVar.id]: layout,
        });
      });
      // A group in the drawer's position is not counted either.
      synth.addManualNode(stage.id, groupType.id, 'node-unplaced-group', {
        [groupName.id]: 'Band',
        [layoutVar.id]: null,
      });
      stage.addPrompt();
      return synth;
    },
    run: async ({ page, protocol, interview }) => {
      const canvasLabels = () =>
        page
          .locator('[data-zone-id="sociogram-canvas"] button[aria-label]')
          .evaluateAll((buttons) =>
            buttons.map((b) => b.getAttribute('aria-label') ?? '').toSorted(),
          );
      // Both types the stage shows are on the canvas; the group is not.
      await expect
        .poll(canvasLabels)
        .toEqual(['Ash', 'Bea', 'Cafe', 'Cy', 'Park']);
      // Every person and venue is placed, and the unplaced group is not
      // the stage's, so the drawer is empty.
      await expect(
        page.getByRole('button', { name: /^0 unplaced\b/ }),
      ).toBeVisible();

      // All 7 nodes are retained in the network; filtering is display-only.
      const state = await protocol.getNetworkState(interview.interviewId);
      expect(state?.nodes).toHaveLength(7);
    },
  };
}

// --- two-type stages with a directed edge type ------------------------------

/**
 * A stage showing people (Ash, Bea) and venues (Cafe), placed, with a
 * directed "Goes to" edge type that `endpointRules` may restrict, and a
 * connect prompt for it.
 */
function buildTwoTypeConnectStage(
  ids: { nameVarIds: string[] },
  endpointRules?: (types: {
    person: string;
    venue: string;
  }) => { sourceType: string; targetType: string }[],
): SyntheticInterview {
  const synth = new SyntheticInterview();
  const personType = synth.addNodeType({ name: 'Person' });
  const personName = personType.addVariable({ type: 'text', name: 'name' });
  const venueType = synth.addNodeType({
    name: 'Venue',
    shape: { default: 'square' },
  });
  const venueName = venueType.addVariable({ type: 'text', name: 'name' });
  ids.nameVarIds = [personName.id, venueName.id];
  const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
  const rules = endpointRules?.({ person: personType.id, venue: venueType.id });
  const goesTo = synth.addEdgeType({
    name: 'Goes to',
    directed: true,
    ...(rules ? { endpointRules: rules } : {}),
  });
  const stage = synth.addStage('Sociogram', {
    layout: layoutVar.id,
    subject: { entity: 'node', types: [personType.id, venueType.id] },
  });
  synth.addManualNode(stage.id, personType.id, 'ash', {
    [personName.id]: 'Ash',
    [layoutVar.id]: { x: 0.25, y: 0.3 },
  });
  synth.addManualNode(stage.id, personType.id, 'bea', {
    [personName.id]: 'Bea',
    [layoutVar.id]: { x: 0.75, y: 0.3 },
  });
  synth.addManualNode(stage.id, venueType.id, 'cafe', {
    [venueName.id]: 'Cafe',
    [layoutVar.id]: { x: 0.5, y: 0.75 },
  });
  stage.addPrompt({
    task: 'connect',
    text: 'Tap someone, then who or where they go to.',
    edges: { create: goesTo.id, display: [goesTo.id] },
  });
  return synth;
}

/** The network's edges as "from>to", by node name. */
function edgesByName(
  network: NcNetwork | undefined,
  nameVarIds: readonly string[],
): string[] {
  const nameOf = (id: string): string => {
    const node = network?.nodes.find((n) => n[entityPrimaryKeyProperty] === id);
    const attributes = node?.[entityAttributesProperty] ?? {};
    for (const nameId of nameVarIds) {
      const name = attributes[nameId];
      if (typeof name === 'string') return name;
    }
    return id;
  };
  return (network?.edges ?? [])
    .map(
      (edge) =>
        `${nameOf(edge[edgeSourceProperty])}>${nameOf(edge[edgeTargetProperty])}`,
    )
    .toSorted();
}

/** Tap `first`, wait for it to be the pending source, then tap `second`. */
async function tapInOrder(
  page: Page,
  first: string,
  second: string,
): Promise<void> {
  const source = sociogramNode(page, first);
  await source.click();
  await expect(source).toHaveAttribute('data-node-linking', 'true');
  await sociogramNode(page, second).click();
  await expect(source).not.toHaveAttribute('data-node-linking');
}

const visibleArrowheads = (page: Page) =>
  page.locator('polygon[data-edge-arrowhead][visibility="visible"]');

// --- several-node-types ----------------------------------------------------

function buildSeveralNodeTypes(): ScenarioDefinition {
  const ids = { personName: '', venueName: '', trusted: '', favourite: '' };
  return {
    id: 'several-node-types',
    covers: [
      'subject=several-types',
      'prompts[].highlight[].type',
      'prompts[].highlight[].variable',
    ],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const personName = personType.addVariable({ type: 'text', name: 'name' });
      const trusted = personType.addVariable({
        type: 'boolean',
        name: 'trusted',
      });
      const venueType = synth.addNodeType({
        name: 'Venue',
        shape: { default: 'square' },
      });
      const venueName = venueType.addVariable({ type: 'text', name: 'name' });
      const favourite = venueType.addVariable({
        type: 'boolean',
        name: 'favourite',
      });
      Object.assign(ids, {
        personName: personName.id,
        venueName: venueName.id,
        trusted: trusted.id,
        favourite: favourite.id,
      });
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      const stage = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        subject: { entity: 'node', types: [personType.id, venueType.id] },
      });
      synth.addManualNode(stage.id, personType.id, 'ash', {
        [personName.id]: 'Ash',
        [trusted.id]: false,
        [layoutVar.id]: { x: 0.3, y: 0.4 },
      });
      synth.addManualNode(stage.id, venueType.id, 'cafe', {
        [venueName.id]: 'Cafe',
        [favourite.id]: false,
        [layoutVar.id]: { x: 0.7, y: 0.4 },
      });
      // Each type has its own highlight variable.
      stage.addPrompt({
        task: 'highlight',
        text: 'Tap the people you trust and the places you like best.',
        highlight: [
          { type: personType.id, variable: trusted.id },
          { type: venueType.id, variable: favourite.id },
        ],
      });
      // Only people are highlighted here, so the venue is disabled.
      stage.addPrompt({
        task: 'highlight',
        text: 'Tap the people you trust.',
        highlight: [{ type: personType.id, variable: trusted.id }],
      });
      return synth;
    },
    run: async ({ page, protocol, interview }) => {
      await sociogramNode(page, 'Ash').click();
      await sociogramNode(page, 'Cafe').click();
      await expect(sociogramNode(page, 'Ash')).toHaveAttribute(
        'data-node-highlighted',
        'true',
      );
      await expect(sociogramNode(page, 'Cafe')).toHaveAttribute(
        'data-node-highlighted',
        'true',
      );
      const state = await protocol.getNetworkState(interview.interviewId);
      expect(nodeAttribute(state, ids.personName, 'Ash', ids.trusted)).toBe(
        true,
      );
      expect(nodeAttribute(state, ids.venueName, 'Cafe', ids.favourite)).toBe(
        true,
      );
      // Each node is written only through its own type's variable.
      expect(
        nodeAttribute(state, ids.personName, 'Ash', ids.favourite),
      ).toBeUndefined();

      await interview.nextButton.click();
      await expect(
        page.getByText('Tap the people you trust.', { exact: true }),
      ).toBeVisible();
      await expect(sociogramNode(page, 'Cafe')).toBeDisabled();
      await expect(sociogramNode(page, 'Ash')).toBeEnabled();
    },
  };
}

// --- directed-connect-reverse ----------------------------------------------

function buildDirectedConnectReverse(): ScenarioDefinition {
  const ids: { nameVarIds: string[] } = { nameVarIds: [] };
  return {
    id: 'directed-connect-reverse',
    covers: ['codebook.edge=directed-type', 'prompts[].edges.create'],
    seedNetwork: true,
    build: () => buildTwoTypeConnectStage(ids),
    run: async ({ page, protocol, interview }) => {
      const edges = async () =>
        edgesByName(
          await protocol.getNetworkState(interview.interviewId),
          ids.nameVarIds,
        );

      await tapInOrder(page, 'Ash', 'Bea');
      await expect.poll(edges).toEqual(['Ash>Bea']);
      await expect(visibleArrowheads(page)).toHaveCount(1);

      // The reverse order adds the opposite edge, drawn on the same line.
      await tapInOrder(page, 'Bea', 'Ash');
      await expect.poll(edges).toEqual(['Ash>Bea', 'Bea>Ash']);
      await expect(page.locator('line[data-edge-id]')).toHaveCount(1);
      await expect(visibleArrowheads(page)).toHaveCount(2);

      // The same order again removes that edge only.
      await tapInOrder(page, 'Ash', 'Bea');
      await expect.poll(edges).toEqual(['Bea>Ash']);
      await expect(visibleArrowheads(page)).toHaveCount(1);
    },
  };
}

// --- endpoint-rules-disable ------------------------------------------------

function buildEndpointRulesDisable(): ScenarioDefinition {
  const ids: { nameVarIds: string[] } = { nameVarIds: [] };
  return {
    id: 'endpoint-rules-disable',
    covers: ['codebook.edge=endpoint-rules'],
    seedNetwork: true,
    // People go to venues, and nothing else.
    build: () =>
      buildTwoTypeConnectStage(ids, ({ person, venue }) => [
        { sourceType: person, targetType: venue },
      ]),
    run: async ({ page, protocol, interview }) => {
      // A venue cannot be a source, so it is disabled before the first tap.
      await expect(sociogramNode(page, 'Cafe')).toBeDisabled();
      await expect(sociogramNode(page, 'Ash')).toBeEnabled();

      // After Ash is tapped, another person is not a valid target.
      const ash = sociogramNode(page, 'Ash');
      await ash.click();
      await expect(ash).toHaveAttribute('data-node-linking', 'true');
      await expect(sociogramNode(page, 'Bea')).toBeDisabled();
      await expect(sociogramNode(page, 'Cafe')).toBeEnabled();
      await sociogramNode(page, 'Cafe').click();

      await expect
        .poll(async () =>
          edgesByName(
            await protocol.getNetworkState(interview.interviewId),
            ids.nameVarIds,
          ),
        )
        .toEqual(['Ash>Cafe']);
    },
  };
}

// --- sort-by-node-type -----------------------------------------------------

function buildSortByNodeType(): ScenarioDefinition {
  return {
    id: 'sort-by-node-type',
    covers: ['prompts[].sortOrder[].type', 'prompts[].nodeTypeOrder'],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const personName = personType.addVariable({ type: 'text', name: 'name' });
      const venueType = synth.addNodeType({ name: 'Venue' });
      const venueName = venueType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = synth.addLayout({ name: 'sociogramLayout' });
      const stage = synth.addStage('Sociogram', {
        layout: layoutVar.id,
        subject: { entity: 'node', types: [personType.id, venueType.id] },
      });
      const nodes: [string, string, string][] = [
        [personType.id, personName.id, 'Dave'],
        [personType.id, personName.id, 'Alice'],
        [venueType.id, venueName.id, 'Cafe'],
        [venueType.id, venueName.id, 'Park'],
      ];
      nodes.forEach(([typeId, nameId, name], index) => {
        synth.addManualNode(stage.id, typeId, `node-${index}`, {
          [nameId]: name,
          [layoutVar.id]: null,
        });
      });

      // Venues first, each type sorted by its own rule.
      stage.addPrompt({
        text: 'Venues first, then people.',
        nodeTypeOrder: [venueType.id, personType.id],
        sortOrder: [
          { type: personType.id, property: personName.id, direction: 'asc' },
          { type: venueType.id, property: venueName.id, direction: 'desc' },
        ],
      });
      // No node type order: people first, as the stage lists them, in the
      // order they were added; venues by name.
      stage.addPrompt({
        text: 'People first, then venues by name.',
        sortOrder: [
          { type: venueType.id, property: venueName.id, direction: 'asc' },
        ],
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
        .toEqual(['Park', 'Cafe', 'Alice', 'Dave']);

      await interview.nextButton.click();
      await expect(
        page.getByText('People first, then venues by name.'),
      ).toBeVisible();
      await expect
        .poll(drawerLabels)
        .toEqual(['Dave', 'Alice', 'Cafe', 'Park']);
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
    buildTaskLayout(),
    buildTaskHighlight(),
    buildTaskConnect(),
    buildUnplacedNodesDisabledOutsideLayout(),
    buildMultiPromptNavigationAndCollapse(),
    buildSortOrderDrawer(),
    buildSubjectFiltersToNodeType(),
    buildSeveralNodeTypes(),
    buildDirectedConnectReverse(),
    buildEndpointRulesDisable(),
    buildSortByNodeType(),
  ],
};

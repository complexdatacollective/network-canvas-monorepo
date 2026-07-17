import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import { NetworkComposerFixture } from '../fixtures/network-composer-fixture.js';
import { expectResponsiveCanvasBackgroundImage } from '../helpers/canvas-background-image.js';
import type { SyntheticAssetSpec } from '../helpers/synthetic-payload.js';
import type { InterfaceScenarios } from './types.js';

const BACKGROUND_IMAGE_FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../../apps/documentation/public/assets/responsive-svg-background.svg',
);

/** Narrow an unknown attribute value to a canvas {x,y} position. */
function isPosition(value: unknown): value is { x: number; y: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    typeof value.x === 'number' &&
    typeof value.y === 'number'
  );
}

function positionOf(value: unknown): { x: number; y: number } {
  if (!isPosition(value)) {
    throw new Error(`Expected a position, received ${JSON.stringify(value)}`);
  }
  return value;
}

// Refs captured in build() and read in run(). Each scenario runs build→run
// atomically within a worker, so per-scenario mutable records are safe
// (matches the name-generator-roster convention).
const gridRefs = { quickAdd: '', layout: '', personType: '' };
const dragRefs = { quickAdd: '', layout: '' };
const nodeFormRefs = { age: '' };
const hullTapRefs = { community: '' };
const lassoRefs = { quickAdd: '', community: '' };
const undoRefs = { quickAdd: '', community: '' };
const multiDelRefs = { friendship: '' };
const backgroundImageAsset: SyntheticAssetSpec = {
  assetId: 'network-composer-bg-1',
  name: 'Background',
  type: 'image',
  source: 'responsive-svg-background.svg',
  localPath: BACKGROUND_IMAGE_FIXTURE,
};
const drawRefs = { friendship: '' };
const multiEdgeRefs = { friendship: '', advice: '', reciprocated: '' };
const validationRefs = { textA: '', textB: '', number: '' };
const matrixRefs = {
  fullName: '',
  bio: '',
  age: '',
  closeness: '',
  keepInTouch: '',
  livesTogether: '',
  seenRecently: '',
  community: '',
  closenessScore: '',
  talkFrequency: '',
  metDate: '',
  lastContact: '',
  occupation: '',
};

export const networkComposerScenarios: InterfaceScenarios = {
  interfaceType: 'NetworkComposer',
  scenarios: [
    {
      id: 'subject-quickadd-grid-defaults',
      covers: [
        'type',
        'subject',
        'quickAdd',
        'layoutVariable',
        'behaviours.automaticLayout.absent',
        'label',
        'interviewScript',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview(180);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        // A second node type that is NOT the stage subject — its nodes must
        // never render on the composer canvas.
        synth.addNodeType({ name: 'Place' });
        synth.addStage('NetworkComposer', {
          label: 'SECRET-LABEL',
          interviewScript: 'SECRET-SCRIPT',
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
        });
        synth.addInformationStage({ title: 'Complete' });
        gridRefs.quickAdd = quickAdd.id;
        gridRefs.layout = layoutVar.id;
        gridRefs.personType = person.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);

        // Two nodes, added back-to-back (the popover stays open).
        await composer.addNode('Person', 'Alice');
        await composer.addNode('Person', 'Bob');

        // No behaviours.automaticLayout → MANUAL.
        await expect(composer.root).toHaveAttribute(
          'data-layout-mode',
          'MANUAL',
        );

        await expect
          .poll(async () => {
            const state = await protocol.getNetworkState(interview.interviewId);
            return state?.nodes.length ?? 0;
          })
          .toBe(2);

        const state = await protocol.getNetworkState(interview.interviewId);
        const byName = (name: string) =>
          state?.nodes.find(
            (n) => n[entityAttributesProperty][gridRefs.quickAdd] === name,
          );
        const alice = byName('Alice');
        const bob = byName('Bob');

        expect(alice?.type).toBe(gridRefs.personType);
        expect(bob?.type).toBe(gridRefs.personType);

        // Grid placement: successive cells from the top-left.
        const aliceLayout = positionOf(
          alice?.[entityAttributesProperty][gridRefs.layout],
        );
        const bobLayout = positionOf(
          bob?.[entityAttributesProperty][gridRefs.layout],
        );
        expect(aliceLayout.x).toBeCloseTo(0.12, 5);
        expect(aliceLayout.y).toBeCloseTo(0.12, 5);
        expect(bobLayout.x).toBeCloseTo(0.22, 5);
        expect(bobLayout.y).toBeCloseTo(0.12, 5);

        // Only the two Person nodes render — no toolbar/label leakage.
        await expect(composer.nodeButtons).toHaveCount(2);
        await expect(composer.getNode('Alice')).toBeVisible();

        // label / interviewScript are author-only, never rendered.
        await expect(page.getByText('SECRET-LABEL')).toHaveCount(0);
        await expect(page.getByText('SECRET-SCRIPT')).toHaveCount(0);
      },
    },

    {
      id: 'node-drag-updates-layout-variable',
      covers: ['layoutVariable'],
      build: () => {
        const synth = new SyntheticInterview(181);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
        });
        synth.addInformationStage({ title: 'Complete' });
        dragRefs.quickAdd = quickAdd.id;
        dragRefs.layout = layoutVar.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);
        await composer.addNode('Person', 'Carol');
        await composer.selectTool();
        await composer.dragNodeTo('Carol', { x: 0.6, y: 0.6 });

        await expect
          .poll(async () => {
            const s = await protocol.getNetworkState(interview.interviewId);
            const layout =
              s?.nodes[0]?.[entityAttributesProperty][dragRefs.layout];
            return isPosition(layout) ? layout.x : 0;
          })
          .toBeGreaterThan(0.4);

        const s = await protocol.getNetworkState(interview.interviewId);
        const layout = positionOf(
          s?.nodes[0]?.[entityAttributesProperty][dragRefs.layout],
        );
        expect(layout.x).toBeCloseTo(0.6, 1);
        expect(layout.y).toBeCloseTo(0.6, 1);

        // The rendered node's inline position tracks the layout variable.
        const style = await composer.getNode('Carol').getAttribute('style');
        const leftMatch = /left:\s*([\d.]+)%/.exec(style ?? '');
        expect(leftMatch).not.toBeNull();
        expect(Number(leftMatch![1])).toBeGreaterThan(50);
      },
    },

    {
      id: 'nodeform-present-autosave-undo-deselect',
      covers: ['nodeForm.present', 'implicit.drawerDeselect'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview(182);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        const age = person.addVariable({ type: 'number', name: 'Age' });
        const stage = synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
          nodeForm: {
            fields: [{ variable: age.id, component: 'Number', label: 'Age' }],
          },
        });
        // Seed a known prior value so undo has a deterministic target: the
        // update-node-attributes undo restores the pre-edit value (25), not
        // absence — a first-ever attribute set has an empty captured prior and
        // its undo is a no-op (updateNode merges).
        synth.addManualNode(stage.id, person.id, 'nc-dev', {
          [quickAdd.id]: 'Dev',
          [layoutVar.id]: { x: 0.5, y: 0.4 },
          [age.id]: 25,
        });
        synth.addInformationStage({ title: 'Complete' });
        nodeFormRefs.age = age.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);
        const ageValue = async () => {
          const s = await protocol.getNetworkState(interview.interviewId);
          return s?.nodes[0]?.[entityAttributesProperty][nodeFormRefs.age];
        };

        await composer.getNode('Dev').click();
        await expect(composer.inspectorPanel).toBeVisible();

        await composer
          .getField(nodeFormRefs.age)
          .getByRole('spinbutton')
          .fill('30');

        // Autosave debounce (400ms) — poll the persisted state past it.
        await expect.poll(ageValue).toBe(30);

        // Background tap clears the selection and closes the drawer.
        await composer.tapBackground();
        await expect(composer.getNode('Dev')).not.toHaveAttribute(
          'data-node-selected',
        );
        await expect(composer.inspectorPanel).not.toBeVisible();

        // Re-select and undo — reverts to the seeded prior value.
        await composer.getNode('Dev').click();
        await composer.undoViaKeyboard();
        await expect.poll(ageValue).toBe(25);
      },
    },

    {
      id: 'nodeform-absent-edges-absent-convexhull-unset',
      covers: ['nodeForm.absent', 'edges[].absent', 'convexHullVariable.unset'],
      build: () => {
        const synth = new SyntheticInterview(183);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
        });
        synth.addInformationStage({ title: 'Complete' });
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);
        const nodeCount = async () =>
          (await protocol.getNetworkState(interview.interviewId))?.nodes
            .length ?? 0;

        await composer.addNode('Person', 'Eve');
        await composer.addNode('Person', 'Frank');
        await composer.addNode('Person', 'Gina');
        await composer.selectTool();

        // No edge or groups tools when the stage declares neither.
        await expect(
          page.getByRole('button', { name: 'Draw edge', exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Groups', exact: true }),
        ).toHaveCount(0);

        // Selecting a node with no node form shows the empty state + Delete.
        await composer.getNode('Eve').click();
        await expect(page.getByText('No attributes to edit')).toBeVisible();
        await expect(composer.drawerDeleteButton).toBeVisible();
        await composer.drawerDeleteButton.click();
        await expect.poll(nodeCount).toBe(2);
        await expect(page.getByText('No attributes to edit')).not.toBeVisible();

        // With no hull variable, dragging the background never draws a lasso.
        await composer.lassoSelect([
          { x: 0.3, y: 0.3 },
          { x: 0.6, y: 0.3 },
          { x: 0.6, y: 0.6 },
          { x: 0.3, y: 0.6 },
        ]);
        await expect(composer.hullShapes).toHaveCount(0);

        // Multi-selecting offers no "Add all to" bar without groups.
        await composer.selectTool();
        await composer.tapNode('Frank');
        await composer.tapNode('Gina', 'Shift');
        await expect(
          page.getByRole('button', { name: /Add all to/ }),
        ).toHaveCount(0);
      },
    },

    {
      id: 'convexhull-tap-toggle-groups-popover',
      covers: [
        'convexHullVariable.tapToggle',
        'hullVariable.categoricalOptions',
      ],
      build: () => {
        const synth = new SyntheticInterview(184);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        const community = person.addVariable({
          type: 'categorical',
          name: 'Community',
          options: [
            { value: 'school', label: 'School' },
            { value: 'work', label: 'Work' },
            { value: 'family', label: 'Family' },
          ],
        });
        synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
          convexHullVariable: community.id,
        });
        synth.addInformationStage({ title: 'Complete' });
        hullTapRefs.community = community.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);
        const communityValue = async () => {
          const s = await protocol.getNetworkState(interview.interviewId);
          return s?.nodes[0]?.[entityAttributesProperty][hullTapRefs.community];
        };

        await composer.addNode('Person', 'Hank');
        await composer.selectTool();
        await composer.pickGroup('School');

        // Groups tool active with School (option 0) → button adopts --cat-1.
        await expect(composer.groupsToolButton).toHaveClass(/bg-\(--cat-1\)/);

        await composer.tapNode('Hank');
        await expect.poll(communityValue).toEqual(['school']);
        await expect(composer.hullShapes).toHaveCount(1);

        await composer.tapNode('Hank');
        await expect.poll(communityValue).toEqual([]);
        await expect(composer.hullShapes).toHaveCount(0);
      },
    },

    {
      id: 'convexhull-lasso-bulk-add',
      covers: ['convexHullVariable.lasso'],
      build: () => {
        const synth = new SyntheticInterview(185);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        const community = person.addVariable({
          type: 'categorical',
          name: 'Community',
          options: [
            { value: 'school', label: 'School' },
            { value: 'work', label: 'Work' },
            { value: 'family', label: 'Family' },
          ],
        });
        synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
          convexHullVariable: community.id,
        });
        synth.addInformationStage({ title: 'Complete' });
        lassoRefs.quickAdd = quickAdd.id;
        lassoRefs.community = community.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);

        // Grid places Ida/Jack at x≈0.12/0.22 and Kim at x≈0.32 (all y≈0.12).
        await composer.addNode('Person', 'Ida');
        await composer.addNode('Person', 'Jack');
        await composer.addNode('Person', 'Kim');
        await composer.selectTool();

        // Split the lasso gesture so the polygon can be observed mid-drag. The
        // box stays right of the vertical tool palette (canvas x > ~0.093) so
        // every pointer event — including mouse-up — lands on the canvas, not a
        // toolbar button. It encloses Ida (0.12) and Jack (0.22) but not Kim
        // (0.32).
        const p0 = await composer.pointAt(0.1, 0.02);
        const p1 = await composer.pointAt(0.3, 0.02);
        const p2 = await composer.pointAt(0.3, 0.18);
        const p3 = await composer.pointAt(0.1, 0.18);
        await page.mouse.move(p0.x, p0.y);
        await page.mouse.down();
        await page.mouse.move(p1.x, p1.y, { steps: 5 });
        await page.mouse.move(p2.x, p2.y, { steps: 5 });
        await page.mouse.move(p3.x, p3.y, { steps: 5 });
        await expect(composer.hullShapes).toHaveCount(1);
        await page.mouse.up();

        // Only Ida + Jack fall inside the lasso.
        await expect(composer.getNode('Ida')).toHaveAttribute(
          'data-node-selected',
          'true',
        );
        await expect(composer.getNode('Jack')).toHaveAttribute(
          'data-node-selected',
          'true',
        );
        await expect(composer.getNode('Kim')).not.toHaveAttribute(
          'data-node-selected',
        );

        // One selection-bar button per hull option.
        await expect(composer.getSelectionBarButton('School')).toBeVisible();
        await expect(composer.getSelectionBarButton('Work')).toBeVisible();
        await expect(composer.getSelectionBarButton('Family')).toBeVisible();

        await composer.getSelectionBarButton('Work').click();

        const communityOf = (
          s: Awaited<ReturnType<typeof protocol.getNetworkState>>,
          name: string,
        ) =>
          s?.nodes.find(
            (n) => n[entityAttributesProperty][lassoRefs.quickAdd] === name,
          )?.[entityAttributesProperty][lassoRefs.community];

        await expect
          .poll(async () =>
            communityOf(
              await protocol.getNetworkState(interview.interviewId),
              'Ida',
            ),
          )
          .toEqual(['work']);

        const s = await protocol.getNetworkState(interview.interviewId);
        expect(communityOf(s, 'Jack')).toEqual(['work']);
        expect(communityOf(s, 'Kim')).not.toEqual(['work']);

        // Selection is retained after a bulk assignment.
        await expect(composer.getNode('Ida')).toHaveAttribute(
          'data-node-selected',
          'true',
        );
      },
    },

    {
      id: 'background-custom-concentric-skew',
      covers: ['background.concentricCircles', 'background.skewedTowardCenter'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview(186);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
          background: {
            concentricCircles: 6,
            skewedTowardCenter: false,
          },
        });
        synth.addInformationStage({ title: 'Complete' });
        return synth;
      },
      run: async ({ page }) => {
        const composer = new NetworkComposerFixture(page);

        // 6 unskewed (q=1) rings: computeRadii(6,1) reversed.
        const expectedRadii = [1, 2, 3, 4, 5, 6]
          .map((i) => 50 * (1 - (1 - i / 6) ** 1))
          .toReversed();
        await expect(composer.backgroundCircles).toHaveCount(6);
        const radii = await composer.backgroundCircles.evaluateAll((circles) =>
          circles.map((c) => Number(c.getAttribute('r'))),
        );
        radii.forEach((r, i) => {
          expect(r).toBeCloseTo(expectedRadii[i]!, 1);
        });

        // The decorative background does not intercept pointer events: the
        // add-node popover still opens on top of it.
        await composer.addNodeToolButton.click();
        await expect(page.getByLabel('Person name')).toBeVisible();
      },
    },

    {
      id: 'background-image',
      covers: ['background.image'],
      visual: true,
      assets: [backgroundImageAsset],
      build: () => {
        const synth = new SyntheticInterview(188);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        synth.addAsset({
          id: backgroundImageAsset.assetId,
          name: backgroundImageAsset.name,
          type: 'image',
          source: backgroundImageAsset.source,
        });
        synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
          background: {
            image: backgroundImageAsset.assetId,
          },
        });
        synth.addInformationStage({ title: 'Complete' });
        return synth;
      },
      run: async ({ page }) => {
        const composer = new NetworkComposerFixture(page);
        const img = composer.root.locator('img[alt="Background"]');
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

        // background.image wins: it replaces ConcentricCircles rather than
        // layering with it.
        await expect(composer.backgroundCircles).toHaveCount(0);

        await expectResponsiveCanvasBackgroundImage(page, img);

        // The image does not intercept pointer events: the add-node popover
        // still opens on top of it.
        await composer.addNodeToolButton.click();
        await expect(page.getByLabel('Person name')).toBeVisible();
      },
    },

    {
      id: 'background-zero-concentric-circles',
      covers: ['background.concentricCircles'],
      build: () => {
        const synth = new SyntheticInterview(187);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
          background: { concentricCircles: 0 },
        });
        synth.addInformationStage({ title: 'Complete' });
        return synth;
      },
      run: async ({ page }) => {
        const composer = new NetworkComposerFixture(page);
        // n=0 → ConcentricCircles renders null → no rings at all.
        await expect(composer.backgroundCircles).toHaveCount(0);
      },
    },

    {
      id: 'automatic-layout-toggle-persistence',
      covers: ['id', 'behaviours.automaticLayout'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview(190);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
          initialNodes: { count: 4 },
          initialEdges: [
            [0, 1],
            [1, 2],
            [2, 3],
          ],
          behaviours: { automaticLayout: true },
        });
        stage.addEdgeType({ type: friendship.id });
        synth.addInformationStage({ title: 'Complete' });
        return synth;
      },
      run: async ({ page, interview }) => {
        const composer = new NetworkComposerFixture(page);

        await expect(composer.root).toHaveAttribute(
          'data-layout-mode',
          'AUTOMATIC',
        );
        await expect(composer.automaticLayoutToggle).toHaveAttribute(
          'aria-pressed',
          'true',
        );

        // Toggle off: this writes stage metadata that now wins over the stage's
        // behaviours.automaticLayout default.
        await composer.toggleAutomaticLayout();
        await expect(composer.root).toHaveAttribute(
          'data-layout-mode',
          'MANUAL',
        );
        await expect(composer.automaticLayoutToggle).toHaveAttribute(
          'aria-pressed',
          'false',
        );

        // Navigate forward then back with client-side navigation (no reload) so
        // the persisted metadata must survive the stage remount.
        await interview.next();
        await page.getByTestId('previous-button').click();

        const composerAfter = new NetworkComposerFixture(page);
        await expect(composerAfter.root).toHaveAttribute(
          'data-layout-mode',
          'MANUAL',
        );
        await expect(composerAfter.automaticLayoutToggle).toHaveAttribute(
          'aria-pressed',
          'false',
        );
      },
    },

    {
      id: 'edges-draw-toggle-cancel',
      covers: ['edges[]'],
      build: () => {
        const synth = new SyntheticInterview(191);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
        });
        stage.addEdgeType({ type: friendship.id });
        synth.addInformationStage({ title: 'Complete' });
        drawRefs.friendship = friendship.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);
        const edgeCount = async () =>
          (await protocol.getNetworkState(interview.interviewId))?.edges
            .length ?? 0;

        await composer.addNode('Person', 'Leo');
        await composer.addNode('Person', 'Mia');
        await composer.selectEdgeType('Friendship');

        // Arm on Leo, cancel, re-arm, complete to Mia.
        await composer.tapNode('Leo');
        await expect(composer.getNode('Leo')).toHaveAttribute(
          'data-node-linking',
          'true',
        );
        await composer.tapNode('Leo');
        await expect(composer.getNode('Leo')).not.toHaveAttribute(
          'data-node-linking',
        );
        await composer.tapNode('Leo');
        await composer.tapNode('Mia');

        await expect.poll(edgeCount).toBe(1);
        await expect(composer.edgeLines).toHaveCount(1);
        const s = await protocol.getNetworkState(interview.interviewId);
        expect(s?.edges[0]?.type).toBe(drawRefs.friendship);

        // Re-tapping the same pair toggles the edge off.
        await composer.tapNode('Leo');
        await composer.tapNode('Mia');
        await expect.poll(edgeCount).toBe(0);
        await expect(composer.edgeLines).toHaveCount(0);
      },
    },

    {
      id: 'edges-multiple-types-form-and-delete',
      covers: [
        'edges[].multipleTypes',
        'edges[].form',
        'codebook.nodeEdgeColorAndName',
      ],
      build: () => {
        const synth = new SyntheticInterview(192);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const advice = synth.addEdgeType({ name: 'Advice' });
        const reciprocated = advice.addVariable({
          type: 'boolean',
          name: 'Reciprocated',
        });
        const stage = synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
        });
        stage.addEdgeType({ type: friendship.id });
        stage.addEdgeType({
          type: advice.id,
          form: {
            fields: [
              {
                variable: reciprocated.id,
                component: 'Toggle',
                label: 'Reciprocated?',
              },
            ],
          },
        });
        synth.addInformationStage({ title: 'Complete' });
        multiEdgeRefs.friendship = friendship.id;
        multiEdgeRefs.advice = advice.id;
        multiEdgeRefs.reciprocated = reciprocated.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);
        const edgeCount = async () =>
          (await protocol.getNetworkState(interview.interviewId))?.edges
            .length ?? 0;

        await composer.addNode('Person', 'Nia');
        await composer.addNode('Person', 'Omar');

        await composer.selectEdgeType('Friendship');
        await composer.tapNode('Nia');
        await composer.tapNode('Omar');
        await expect.poll(edgeCount).toBe(1);

        await composer.selectEdgeType('Advice');
        await composer.tapNode('Nia');
        await composer.tapNode('Omar');
        await expect.poll(edgeCount).toBe(2);

        // Two rendered lines with distinct codebook colours.
        await expect(composer.edgeLines).toHaveCount(2);
        const strokes = await composer.edgeLines.evaluateAll((lines) =>
          lines.map((l) => l.getAttribute('stroke')),
        );
        expect(new Set(strokes).size).toBe(2);

        // Select the Advice edge — the only one with a form, so the inspector
        // (with the Toggle field) appears. Retry if the formless Friendship
        // edge was hit first (both occupy the same coordinates).
        await composer.selectTool();
        let selected = false;
        for (let attempt = 0; attempt < 4 && !selected; attempt++) {
          await composer.clickEdgeBetween('Nia', 'Omar');
          if (await composer.inspectorPanel.isVisible()) {
            selected = true;
          } else {
            await composer.tapBackground();
          }
        }
        expect(selected).toBe(true);
        await expect(page.getByText('Advice', { exact: true })).toBeVisible();

        // Flip the Reciprocated toggle and confirm it persists on the edge.
        await composer
          .getField(multiEdgeRefs.reciprocated)
          .getByRole('switch')
          .click();
        await expect
          .poll(async () => {
            const s = await protocol.getNetworkState(interview.interviewId);
            const adviceEdge = s?.edges.find(
              (e) => e.type === multiEdgeRefs.advice,
            );
            return adviceEdge?.[entityAttributesProperty][
              multiEdgeRefs.reciprocated
            ];
          })
          .toBe(true);

        // Delete the Advice edge from the drawer — Friendship remains.
        await composer.drawerDeleteButton.click();
        await expect.poll(edgeCount).toBe(1);
        const s = await protocol.getNetworkState(interview.interviewId);
        expect(s?.edges[0]?.type).toBe(multiEdgeRefs.friendship);
      },
    },

    {
      id: 'fields-component-full-matrix',
      covers: [
        'fields[].component',
        'fields[].component.overridesCodebook',
        'fields[].parameters',
        'fields[].label',
        'fields[].hint',
      ],
      slow: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview(193);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });

        const fullName = person.addVariable({ type: 'text', name: 'fullName' });
        const bio = person.addVariable({ type: 'text', name: 'Bio' });
        const age = person.addVariable({ type: 'number', name: 'Age' });
        const closeness = person.addVariable({
          type: 'ordinal',
          name: 'Closeness',
          options: [
            { value: 1, label: 'Not close' },
            { value: 2, label: 'Somewhat close' },
            { value: 3, label: 'Very close' },
          ],
        });
        const keepInTouch = person.addVariable({
          type: 'categorical',
          name: 'keepInTouch',
          options: [
            { value: 'call', label: 'Phone call' },
            { value: 'text', label: 'Text message' },
            { value: 'inperson', label: 'In person' },
          ],
        });
        const livesTogether = person.addVariable({
          type: 'boolean',
          name: 'livesTogether',
        });
        const seenRecently = person.addVariable({
          type: 'boolean',
          name: 'seenRecently',
        });
        const community = person.addVariable({
          type: 'categorical',
          name: 'Community',
          options: [
            { value: 'school', label: 'School' },
            { value: 'work', label: 'Work' },
          ],
        });
        const closenessScore = person.addVariable({
          type: 'scalar',
          name: 'closenessScore',
        });
        const talkFrequency = person.addVariable({
          type: 'ordinal',
          name: 'talkFrequency',
          options: [
            { value: 1, label: 'Rarely' },
            { value: 2, label: 'Sometimes' },
            { value: 3, label: 'Often' },
          ],
        });
        const metDate = person.addVariable({
          type: 'datetime',
          name: 'dateMet',
        });
        const lastContact = person.addVariable({
          type: 'datetime',
          name: 'lastContact',
        });
        // Declared Text in the codebook; the stage field below overrides it to
        // render as a TextArea (the stage field's component wins).
        const occupation = person.addVariable({
          type: 'text',
          name: 'Occupation',
        });

        const stage = synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
          nodeForm: {
            fields: [
              // Custom label overrides the codebook variable name.
              { variable: fullName.id, component: 'Text', label: 'How old?' },
              { variable: bio.id, component: 'TextArea', label: 'Bio' },
              {
                variable: age.id,
                component: 'Number',
                label: 'Age',
                hint: 'In whole years',
              },
              {
                variable: closeness.id,
                component: 'RadioGroup',
                label: 'Closeness',
              },
              {
                variable: keepInTouch.id,
                component: 'CheckboxGroup',
                label: 'Keep in touch',
              },
              {
                variable: livesTogether.id,
                component: 'Boolean',
                label: 'Lives together?',
              },
              {
                variable: seenRecently.id,
                component: 'Toggle',
                label: 'Seen recently?',
              },
              {
                variable: community.id,
                component: 'ToggleButtonGroup',
                label: 'Community',
              },
              {
                variable: closenessScore.id,
                component: 'VisualAnalogScale',
                label: 'Closeness score',
                parameters: { minLabel: 'Not at all', maxLabel: 'Completely' },
              },
              {
                variable: talkFrequency.id,
                component: 'LikertScale',
                label: 'Talk frequency',
              },
              {
                variable: metDate.id,
                component: 'DatePicker',
                label: 'Date met',
              },
              {
                variable: lastContact.id,
                component: 'RelativeDatePicker',
                label: 'Last contact',
                parameters: { before: 30, after: 0 },
              },
              // No label → falls back to the codebook variable's own name.
              { variable: occupation.id, component: 'TextArea' },
            ],
          },
        });
        synth.addManualNode(stage.id, person.id, 'nc-pat', {
          [quickAdd.id]: 'Pat',
          [layoutVar.id]: { x: 0.5, y: 0.4 },
        });
        synth.addInformationStage({ title: 'Complete' });

        matrixRefs.fullName = fullName.id;
        matrixRefs.bio = bio.id;
        matrixRefs.age = age.id;
        matrixRefs.closeness = closeness.id;
        matrixRefs.keepInTouch = keepInTouch.id;
        matrixRefs.livesTogether = livesTogether.id;
        matrixRefs.seenRecently = seenRecently.id;
        matrixRefs.community = community.id;
        matrixRefs.closenessScore = closenessScore.id;
        matrixRefs.talkFrequency = talkFrequency.id;
        matrixRefs.metDate = metDate.id;
        matrixRefs.lastContact = lastContact.id;
        matrixRefs.occupation = occupation.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);
        await composer.getNode('Pat').click();
        await expect(composer.inspectorPanel).toBeVisible();

        // Label handling: custom label, codebook-name fallback, and hint.
        await expect(composer.getField(matrixRefs.fullName)).toContainText(
          'How old?',
        );
        await expect(composer.getField(matrixRefs.occupation)).toContainText(
          'Occupation',
        );
        await expect(composer.getField(matrixRefs.age)).toContainText(
          'In whole years',
        );

        await composer
          .getField(matrixRefs.fullName)
          .getByRole('textbox')
          .fill('Alex');
        await composer
          .getField(matrixRefs.bio)
          .getByRole('textbox')
          .fill('Met at university');
        await composer
          .getField(matrixRefs.age)
          .getByRole('spinbutton')
          .fill('34');
        await composer
          .getField(matrixRefs.closeness)
          .getByRole('radio', { name: 'Very close' })
          .click();
        await composer
          .getField(matrixRefs.keepInTouch)
          .getByRole('checkbox', { name: 'Text message' })
          .click();
        // Boolean renders as Yes/No radios.
        await composer
          .getField(matrixRefs.livesTogether)
          .getByRole('radio', { name: 'Yes' })
          .click();
        // Toggle renders as a switch.
        await composer
          .getField(matrixRefs.seenRecently)
          .getByRole('switch')
          .click();
        await composer
          .getField(matrixRefs.community)
          .getByRole('checkbox', { name: 'Work' })
          .click();

        // VisualAnalogScale: keyboard-only. `End` jumps to its max (1).
        const vasSlider = composer
          .getField(matrixRefs.closenessScore)
          .getByRole('slider');
        await vasSlider.focus();
        await vasSlider.press('End');
        await expect(
          composer.getField(matrixRefs.closenessScore).getByText('Not at all'),
        ).toBeVisible();
        await expect(
          composer.getField(matrixRefs.closenessScore).getByText('Completely'),
        ).toBeVisible();

        // LikertScale: same keyboard approach; `End` picks the last option.
        const likertSlider = composer
          .getField(matrixRefs.talkFrequency)
          .getByRole('slider');
        await likertSlider.focus();
        await likertSlider.press('End');

        await composer
          .getField(matrixRefs.metDate)
          .locator('input[type="date"]')
          .fill('2020-05-01');
        // RelativeDatePicker (before:30/after:0) also renders a date input. A
        // date a few days back is always inside the window regardless of the
        // run date.
        const recent = new Date(Date.now() - 7 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        await composer
          .getField(matrixRefs.lastContact)
          .locator('input[type="date"]')
          .fill(recent);

        // Codebook Text → stage TextArea override renders a <textarea>.
        await expect(
          composer.getField(matrixRefs.occupation).locator('textarea'),
        ).toBeVisible();
        // Fill occupation last: the coalesced autosave persists the whole form,
        // so once this lands every prior field has persisted too.
        await composer
          .getField(matrixRefs.occupation)
          .getByRole('textbox')
          .fill('Teacher');

        await expect
          .poll(async () => {
            const s = await protocol.getNetworkState(interview.interviewId);
            return s?.nodes[0]?.[entityAttributesProperty][
              matrixRefs.occupation
            ];
          })
          .toBe('Teacher');

        const state = await protocol.getNetworkState(interview.interviewId);
        const attrs = state?.nodes[0]?.[entityAttributesProperty];
        expect(attrs?.[matrixRefs.fullName]).toBe('Alex');
        expect(attrs?.[matrixRefs.bio]).toBe('Met at university');
        expect(attrs?.[matrixRefs.age]).toBe(34);
        expect(attrs?.[matrixRefs.closeness]).toBe(3);
        expect(attrs?.[matrixRefs.keepInTouch]).toEqual(['text']);
        expect(attrs?.[matrixRefs.livesTogether]).toBe(true);
        expect(attrs?.[matrixRefs.seenRecently]).toBe(true);
        expect(attrs?.[matrixRefs.community]).toEqual(['work']);
        expect(typeof attrs?.[matrixRefs.closenessScore]).toBe('number');
        expect(typeof attrs?.[matrixRefs.talkFrequency]).toBe('number');
        expect(attrs?.[matrixRefs.metDate]).toBe('2020-05-01');
        expect(attrs?.[matrixRefs.lastContact]).toBe(recent);
        expect(attrs?.[matrixRefs.occupation]).toBe('Teacher');
      },
    },

    {
      id: 'validation-hints-and-autosave-gating',
      covers: [
        'fields[].showValidationHints',
        'codebook.validationGatesAutosave',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview(194);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        const textA = person.addVariable({
          type: 'text',
          name: 'bioA',
          validation: { required: true, minLength: 3 },
        });
        const textB = person.addVariable({
          type: 'text',
          name: 'bioB',
          validation: { required: true, minLength: 3 },
        });
        const numberC = person.addVariable({
          type: 'number',
          name: 'Count',
          validation: { minValue: 10 },
        });
        const stage = synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
          nodeForm: {
            fields: [
              {
                variable: textA.id,
                component: 'Text',
                label: 'Bio A',
                showValidationHints: true,
              },
              { variable: textB.id, component: 'Text', label: 'Bio B' },
              { variable: numberC.id, component: 'Number', label: 'Count' },
            ],
          },
        });
        // Seed the text fields valid so only the number field can gate saves.
        synth.addManualNode(stage.id, person.id, 'nc-priya', {
          [quickAdd.id]: 'Priya',
          [layoutVar.id]: { x: 0.5, y: 0.4 },
          [textA.id]: 'Known',
          [textB.id]: 'Known',
        });
        synth.addInformationStage({ title: 'Complete' });
        validationRefs.textA = textA.id;
        validationRefs.textB = textB.id;
        validationRefs.number = numberC.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);
        const attr = async (id: string) => {
          const s = await protocol.getNetworkState(interview.interviewId);
          return s?.nodes[0]?.[entityAttributesProperty][id];
        };

        await composer.getNode('Priya').click();
        await expect(composer.inspectorPanel).toBeVisible();

        // showValidationHints: field A renders a rule list; field B does not.
        await expect(
          composer.getField(validationRefs.textA).getByRole('list'),
        ).toBeVisible();
        await expect(
          composer.getField(validationRefs.textB).getByRole('list'),
        ).toHaveCount(0);

        const numberInput = composer
          .getField(validationRefs.number)
          .getByRole('spinbutton');

        // A valid number autosaves.
        await numberInput.fill('12');
        await expect.poll(() => attr(validationRefs.number)).toBe(12);

        // codebook.validationGatesAutosave: an invalid number gates the whole
        // form. Edit the text field to a marker while the number is invalid;
        // neither persists. Restoring a valid number flushes the held edits.
        await numberInput.fill('5');
        await composer
          .getField(validationRefs.textA)
          .getByRole('textbox')
          .fill('Gated marker');
        await numberInput.fill('30');

        await expect.poll(() => attr(validationRefs.number)).toBe(30);
        await expect
          .poll(() => attr(validationRefs.textA))
          .toBe('Gated marker');
      },
    },

    {
      id: 'undo-redo-toolbar-and-keyboard',
      covers: ['implicit.undoRedo'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview(195);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        const community = person.addVariable({
          type: 'categorical',
          name: 'Community',
          options: [
            { value: 'school', label: 'School' },
            { value: 'work', label: 'Work' },
          ],
        });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
          convexHullVariable: community.id,
        });
        stage.addEdgeType({ type: friendship.id });
        // Seed the two baseline nodes so they carry no undo entries — the undo
        // stack under test contains only the four runtime actions below.
        synth.addManualNode(stage.id, person.id, 'nc-quinn', {
          [quickAdd.id]: 'Quinn',
          [layoutVar.id]: { x: 0.3, y: 0.4 },
        });
        synth.addManualNode(stage.id, person.id, 'nc-rita', {
          [quickAdd.id]: 'Rita',
          [layoutVar.id]: { x: 0.5, y: 0.4 },
        });
        synth.addInformationStage({ title: 'Complete' });
        undoRefs.quickAdd = quickAdd.id;
        undoRefs.community = community.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);
        const countNodes = async () =>
          (await protocol.getNetworkState(interview.interviewId))?.nodes
            .length ?? 0;
        const countEdges = async () =>
          (await protocol.getNetworkState(interview.interviewId))?.edges
            .length ?? 0;

        const baseline = await countNodes();

        // 1) Add a node.
        await composer.addNode('Person', 'Sam');
        await expect.poll(countNodes).toBe(baseline + 1);

        // 2) Draw an edge Quinn→Rita.
        await composer.selectEdgeType('Friendship');
        await composer.tapNode('Quinn');
        await composer.tapNode('Rita');
        await expect.poll(countEdges).toBe(1);

        // 3) Toggle a group membership on Quinn.
        await composer.pickGroup('School');
        await composer.tapNode('Quinn');
        await expect
          .poll(async () => {
            const s = await protocol.getNetworkState(interview.interviewId);
            return s?.nodes.find(
              (n) => n[entityAttributesProperty][undoRefs.quickAdd] === 'Quinn',
            )?.[entityAttributesProperty][undoRefs.community];
          })
          .toEqual(['school']);

        // 4) Move a node.
        await composer.selectTool();
        await composer.dragNodeTo('Sam', { x: 0.7, y: 0.7 });

        // Undo x4 via the toolbar (LIFO): move, group, edge, node.
        await composer.undo();
        await composer.undo();
        await composer.undo();
        await expect.poll(countEdges).toBe(0);
        await composer.undo();
        await expect.poll(countNodes).toBe(baseline);
        await expect(composer.undoButton).toBeDisabled();

        // Redo x4 replays them.
        await composer.redo();
        await composer.redo();
        await composer.redo();
        await composer.redo();
        await expect.poll(countNodes).toBe(baseline + 1);
        await expect.poll(countEdges).toBe(1);
        await expect(composer.redoButton).toBeDisabled();

        // Undo the whole stack again via the keyboard, confirming parity.
        await composer.undoViaKeyboard();
        await composer.undoViaKeyboard();
        await composer.undoViaKeyboard();
        await composer.undoViaKeyboard();
        await expect.poll(countNodes).toBe(baseline);
        await expect(composer.undoButton).toBeDisabled();
      },
    },

    {
      id: 'multi-delete-coalesced-undo',
      covers: ['implicit.deleteMultiSelect'],
      build: () => {
        const synth = new SyntheticInterview(196);
        const person = synth.addNodeType({ name: 'Person' });
        const quickAdd = person.addVariable({ type: 'text', name: 'name' });
        const layoutVar = person.addVariable({
          type: 'layout',
          name: 'composerLayout',
        });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('NetworkComposer', {
          subject: { entity: 'node', type: person.id },
          quickAdd: quickAdd.id,
          layoutVariable: layoutVar.id,
        });
        stage.addEdgeType({ type: friendship.id });
        synth.addInformationStage({ title: 'Complete' });
        multiDelRefs.friendship = friendship.id;
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const composer = new NetworkComposerFixture(page);
        const countNodes = async () =>
          (await protocol.getNetworkState(interview.interviewId))?.nodes
            .length ?? 0;
        const countEdges = async () =>
          (await protocol.getNetworkState(interview.interviewId))?.edges
            .length ?? 0;

        await composer.addNode('Person', 'Sam');
        await composer.addNode('Person', 'Tia');
        await composer.addNode('Person', 'Uma');

        // Draw Sam–Tia.
        await composer.selectEdgeType('Friendship');
        await composer.tapNode('Sam');
        await composer.tapNode('Tia');
        await expect.poll(countEdges).toBe(1);

        // Multi-select Sam + Tia and delete both at once.
        await composer.selectTool();
        await composer.tapNode('Sam');
        await composer.tapNode('Tia', 'Shift');
        await expect(composer.getNode('Sam')).toHaveAttribute(
          'data-node-selected',
          'true',
        );
        await expect(composer.getNode('Tia')).toHaveAttribute(
          'data-node-selected',
          'true',
        );

        await composer.deleteSelection();
        await expect.poll(countNodes).toBe(1);
        await expect.poll(countEdges).toBe(0);

        // A single undo restores both nodes AND the incident edge — one
        // coalesced entry, not three.
        await composer.undoViaKeyboard();
        await expect.poll(countNodes).toBe(3);
        await expect.poll(countEdges).toBe(1);
      },
    },
  ],
};

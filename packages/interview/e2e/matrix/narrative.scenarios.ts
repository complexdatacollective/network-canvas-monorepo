import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import { NarrativeFixture } from '../fixtures/narrative-fixture.js';
import type { InterfaceScenarios, ScenarioDefinition } from './types.js';

/**
 * Base Narrative builder: a Person node type with a real "name" text variable
 * (deduped against the auto-seeded one) and a layout variable. Every Narrative
 * scenario seeds manual nodes, so callers MUST set `seedNetwork: true` —
 * buildSyntheticPayload wipes nodes/edges otherwise (synthetic-payload.ts).
 */
function buildBaseNarrative() {
  const synth = new SyntheticInterview();
  const person = synth.addNodeType({ name: 'Person' });
  const nameVar = person.addVariable({ type: 'text', name: 'name' });
  const layoutVar = person.addVariable({
    type: 'layout',
    name: 'NarrativeLayout',
  });
  return { synth, person, nameVar, layoutVar };
}

const layoutVariableNodeInclusion: ScenarioDefinition = {
  id: 'layout-variable-node-inclusion-and-defaults',
  covers: [
    'presets',
    'presets[].label',
    'presets[].layoutVariable',
    'presets[].edges',
    'behaviours',
    'label',
    'interviewScript',
  ],
  smoke: true,
  visual: true,
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
      label: 'SECRET-LABEL-XYZ',
      interviewScript: 'SECRET-SCRIPT-XYZ',
    });
    stage.addPreset({ label: 'Social View', layoutVariable: layoutVar.id });
    synth.addManualNode(stage.id, person.id, 'node-alice', {
      [nameVar.id]: 'Alice',
      [layoutVar.id]: { x: 0.25, y: 0.25 },
    });
    synth.addManualNode(stage.id, person.id, 'node-bob', {
      [nameVar.id]: 'Bob',
      [layoutVar.id]: { x: 0.5, y: 0.5 },
    });
    synth.addManualNode(stage.id, person.id, 'node-cara', {
      [nameVar.id]: 'Cara',
      [layoutVar.id]: { x: 0.75, y: 0.75 },
    });
    synth.addManualNode(stage.id, person.id, 'node-dana', {
      [nameVar.id]: 'Dana',
      [layoutVar.id]: null,
    });
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);
    const before = await page.evaluate(() => window.__test.getNetworkState());

    // Only nodes with the preset's layout variable set render; Dana (null) is
    // excluded.
    await expect(narrative.getNode('Alice')).toBeVisible();
    await expect(narrative.getNode('Bob')).toBeVisible();
    await expect(narrative.getNode('Cara')).toBeVisible();
    await expect(narrative.getNode('Dana')).toHaveCount(0);

    expect(await narrative.getNodeLeftPercent('Alice')).toBeCloseTo(25, 0);
    expect(await narrative.getNodeLeftPercent('Bob')).toBeCloseTo(50, 0);
    expect(await narrative.getNodeLeftPercent('Cara')).toBeCloseTo(75, 0);

    await expect(narrative.getPresetLabelButton('Social View')).toBeVisible();

    // Empty preset (no edges/group/highlight): no accordion sections render.
    await expect(narrative.getAccordionTrigger('Attributes')).toHaveCount(0);
    await expect(narrative.getAccordionTrigger('Links')).toHaveCount(0);
    await expect(narrative.getAccordionTrigger('Groups')).toHaveCount(0);

    // No behaviours configured: BehavioursPanel does not render.
    await expect(
      page.getByRole('button', {
        name: /Pause automatic layout|Enable drawing/,
      }),
    ).toHaveCount(0);

    // label / interviewScript are author-only and never rendered (base.ts).
    await expect(page.getByText('SECRET-LABEL-XYZ')).toHaveCount(0);
    await expect(page.getByText('SECRET-SCRIPT-XYZ')).toHaveCount(0);

    // Read-only: the network is untouched.
    const after = await page.evaluate(() => window.__test.getNetworkState());
    expect(after).toEqual(before);
  },
};

const multiplePresetsSwitchResets: ScenarioDefinition = {
  id: 'multiple-presets-switch-resets-toggles',
  covers: [
    'presets',
    'presets[].id',
    'presets[].edges.display',
    'presets[].highlight',
    'presets[].groupVariable',
  ],
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar } = buildBaseNarrative();
    const layoutA = person.addVariable({ type: 'layout', name: 'LayoutA' });
    const layoutB = person.addVariable({ type: 'layout', name: 'LayoutB' });
    const closeVar = person.addVariable({
      type: 'boolean',
      name: 'CloseFriend',
    });
    const trustedVar = person.addVariable({ type: 'boolean', name: 'Trusted' });
    const community = person.addVariable({
      type: 'categorical',
      name: 'Community',
      options: [
        { label: 'Family', value: 'family' },
        { label: 'Work', value: 'work' },
      ],
    });
    const friendship = synth.addEdgeType({ name: 'Friendship' });

    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
    });
    stage.addPreset({
      label: 'View A',
      layoutVariable: layoutA.id,
      edges: { display: [friendship.id] },
      highlight: [closeVar.id, trustedVar.id],
    });
    stage.addPreset({
      label: 'View B',
      layoutVariable: layoutB.id,
      groupVariable: community.id,
    });
    stage.addPreset({ label: 'View C', layoutVariable: layoutA.id });

    synth.addManualNode(stage.id, person.id, 'node-ada', {
      [nameVar.id]: 'Ada',
      [layoutA.id]: { x: 0.2, y: 0.2 },
      [layoutB.id]: { x: 0.7, y: 0.3 },
      [closeVar.id]: true,
      [trustedVar.id]: false,
      [community.id]: ['family'],
    });
    synth.addManualNode(stage.id, person.id, 'node-bev', {
      [nameVar.id]: 'Bev',
      [layoutA.id]: { x: 0.5, y: 0.5 },
      [layoutB.id]: { x: 0.3, y: 0.7 },
      [closeVar.id]: false,
      [trustedVar.id]: true,
      [community.id]: ['work'],
    });
    synth.addManualNode(stage.id, person.id, 'node-cy', {
      [nameVar.id]: 'Cy',
      [layoutA.id]: { x: 0.8, y: 0.8 },
      [layoutB.id]: { x: 0.6, y: 0.6 },
      [closeVar.id]: true,
      [trustedVar.id]: false,
      [community.id]: ['family'],
    });
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);

    // Preset 0 (View A): first preset, so Previous is disabled. It carries edges
    // and two highlight attributes, so Links + Attributes sections render (but
    // not Groups). The first highlight radio is checked by default.
    await expect(narrative.getPresetLabelButton('View A')).toBeVisible();
    expect(await narrative.isPreviousPresetDisabled()).toBe(true);
    await expect(narrative.getAccordionTrigger('Links')).toBeVisible();
    await expect(narrative.getAccordionTrigger('Attributes')).toBeVisible();
    await expect(narrative.getAccordionTrigger('Groups')).toHaveCount(0);
    await expect(narrative.getHighlightRadio('CloseFriend')).toBeChecked();

    // Select the second highlight attribute, then leave and return.
    await narrative.selectHighlightRadio('Trusted');
    await expect(narrative.getHighlightRadio('Trusted')).toBeChecked();

    // Preset 1 (View B): layout variable B repositions the nodes; only the
    // Groups section renders.
    await narrative.goToNextPreset();
    await expect(narrative.getPresetLabelButton('View B')).toBeVisible();
    await expect(narrative.getPresetLabelButton('View A')).toHaveCount(0);
    expect(await narrative.getNodeLeftPercent('Ada')).toBeCloseTo(70, 0);
    expect(await narrative.getNodeTopPercent('Ada')).toBeCloseTo(30, 0);
    await expect(narrative.getAccordionTrigger('Groups')).toBeVisible();
    await expect(narrative.getAccordionTrigger('Links')).toHaveCount(0);
    await expect(narrative.getAccordionTrigger('Attributes')).toHaveCount(0);

    // Preset 2 (View C): last preset, so Next is disabled.
    await narrative.goToNextPreset();
    await expect(narrative.getPresetLabelButton('View C')).toBeVisible();
    expect(await narrative.isNextPresetDisabled()).toBe(true);

    // Back to preset 0: the change resets the toggles, so Links/Attributes
    // render again and the highlight index is reset to the FIRST attribute
    // (not the previously-selected 'Trusted').
    await narrative.goToPreviousPreset();
    await narrative.goToPreviousPreset();
    await expect(narrative.getPresetLabelButton('View A')).toBeVisible();
    expect(await narrative.isPreviousPresetDisabled()).toBe(true);
    await expect(narrative.getAccordionTrigger('Links')).toBeVisible();
    await expect(narrative.getHighlightRadio('CloseFriend')).toBeChecked();
    await expect(narrative.getHighlightRadio('Trusted')).not.toBeChecked();
    expect(await narrative.getNodeLeftPercent('Ada')).toBeCloseTo(20, 0);
  },
};

const edgesDisplayAndLinksLegend: ScenarioDefinition = {
  id: 'edges-display-and-links-legend',
  covers: ['presets[].edges.display'],
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const friendship = synth.addEdgeType({ name: 'Friendship' });
    const professional = synth.addEdgeType({ name: 'Professional' });

    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
    });
    stage.addPreset({
      label: 'Friends',
      layoutVariable: layoutVar.id,
      edges: { display: [friendship.id] },
    });
    stage.addPreset({
      label: 'Colleagues',
      layoutVariable: layoutVar.id,
      edges: { display: [professional.id] },
    });

    const coords = [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.25, y: 0.75 },
      { x: 0.75, y: 0.75 },
    ];
    coords.forEach((coord, i) => {
      synth.addManualNode(stage.id, person.id, `node-${i}`, {
        [nameVar.id]: `Node${i}`,
        [layoutVar.id]: coord,
      });
    });

    synth.addEdges(
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      friendship.id,
    );
    synth.addEdges(
      [
        [0, 2],
        [1, 3],
      ],
      professional.id,
    );
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);

    // Preset 0 displays only the 3 Friendship edges; the Links legend names it.
    await expect(narrative.getEdgeLines()).toHaveCount(3);
    await expect(narrative.getAccordionTrigger('Links')).toBeVisible();
    await expect(page.getByText('Friendship')).toBeVisible();
    await expect(page.getByText('Professional')).toHaveCount(0);

    // Preset 1 swaps to the 2 Professional edges.
    await narrative.goToNextPreset();
    await expect(narrative.getEdgeLines()).toHaveCount(2);
    await expect(page.getByText('Professional')).toBeVisible();
    await expect(page.getByText('Friendship')).toHaveCount(0);

    // Collapsing the Links section hides every edge.
    await narrative.toggleAccordionSection('Links');
    await expect(narrative.getEdgeLines()).toHaveCount(0);
  },
};

const convexHullsGroups: ScenarioDefinition = {
  id: 'convex-hulls-groups-multi-membership-and-extras',
  covers: ['presets[].groupVariable'],
  visual: true,
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const community = person.addVariable({
      type: 'categorical',
      name: 'Community',
      options: [
        { label: 'Family', value: 'family' },
        { label: 'Work', value: 'work' },
      ],
    });

    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
    });
    stage.addPreset({
      layoutVariable: layoutVar.id,
      groupVariable: community.id,
    });

    // 3 family, 2 work, 1 multi-membership, 1 out-of-codebook ('imported'),
    // 1 ungrouped (null). Categorical values are stored as arrays.
    const members: {
      name: string;
      coord: { x: number; y: number };
      community: string[] | null;
    }[] = [
      { name: 'Fa', coord: { x: 0.2, y: 0.2 }, community: ['family'] },
      { name: 'Fb', coord: { x: 0.3, y: 0.25 }, community: ['family'] },
      { name: 'Fc', coord: { x: 0.25, y: 0.35 }, community: ['family'] },
      { name: 'Wa', coord: { x: 0.7, y: 0.7 }, community: ['work'] },
      { name: 'Wb', coord: { x: 0.8, y: 0.75 }, community: ['work'] },
      { name: 'Mx', coord: { x: 0.5, y: 0.5 }, community: ['family', 'work'] },
      { name: 'Im', coord: { x: 0.5, y: 0.85 }, community: ['imported'] },
      { name: 'Un', coord: { x: 0.15, y: 0.85 }, community: null },
    ];
    members.forEach((m, i) => {
      synth.addManualNode(stage.id, person.id, `node-${i}`, {
        [nameVar.id]: m.name,
        [layoutVar.id]: m.coord,
        [community.id]: m.community,
      });
    });
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);

    // One hull per group value: family, work, and the out-of-codebook
    // 'imported' value (appended after the known options).
    await expect(narrative.getHullPolygons()).toHaveCount(3);
    await expect
      .poll(async () => {
        const polys = await narrative.getHullPolygons().all();
        const vis = await Promise.all(
          polys.map((p) => p.getAttribute('visibility')),
        );
        return vis.every((v) => v === 'visible');
      })
      .toBe(true);

    const fills = await Promise.all(
      (await narrative.getHullPolygons().all()).map((p) =>
        p.getAttribute('fill'),
      ),
    );
    expect(fills).toEqual(['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)']);

    // Groups legend lists the three values, 'imported' last.
    await expect(narrative.getAccordionTrigger('Groups')).toBeVisible();
    await expect(page.getByText('Family', { exact: true })).toBeVisible();
    await expect(page.getByText('Work', { exact: true })).toBeVisible();
    await expect(page.getByText('imported', { exact: true })).toBeVisible();

    // Collapsing the Groups section removes every hull.
    await narrative.toggleAccordionSection('Groups');
    await expect(narrative.getHullPolygons()).toHaveCount(0);
  },
};

const highlightMultiAttribute: ScenarioDefinition = {
  id: 'highlight-multi-attribute-radio',
  covers: ['presets[].highlight'],
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const closeVar = person.addVariable({
      type: 'boolean',
      name: 'CloseFriend',
    });
    const trustedVar = person.addVariable({ type: 'boolean', name: 'Trusted' });

    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
    });
    stage.addPreset({
      layoutVariable: layoutVar.id,
      highlight: [closeVar.id, trustedVar.id],
    });

    synth.addManualNode(stage.id, person.id, 'node-alice', {
      [nameVar.id]: 'Alice',
      [layoutVar.id]: { x: 0.25, y: 0.25 },
      [closeVar.id]: true,
      [trustedVar.id]: false,
    });
    synth.addManualNode(stage.id, person.id, 'node-bob', {
      [nameVar.id]: 'Bob',
      [layoutVar.id]: { x: 0.5, y: 0.5 },
      [closeVar.id]: false,
      [trustedVar.id]: true,
    });
    synth.addManualNode(stage.id, person.id, 'node-cara', {
      [nameVar.id]: 'Cara',
      [layoutVar.id]: { x: 0.75, y: 0.75 },
      [closeVar.id]: true,
      [trustedVar.id]: false,
    });
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);

    // Default highlight = 'Close Friend': Alice + Cara highlighted, Bob not.
    await expect.poll(() => narrative.isNodeHighlighted('Alice')).toBe(true);
    expect(await narrative.isNodeHighlighted('Cara')).toBe(true);
    expect(await narrative.isNodeHighlighted('Bob')).toBe(false);

    // Switch to 'Trusted': only Bob highlighted.
    await narrative.selectHighlightRadio('Trusted');
    await expect.poll(() => narrative.isNodeHighlighted('Bob')).toBe(true);
    expect(await narrative.isNodeHighlighted('Alice')).toBe(false);
    expect(await narrative.isNodeHighlighted('Cara')).toBe(false);

    // Collapsing the Attributes section clears all highlighting.
    await narrative.toggleAccordionSection('Attributes');
    await expect.poll(() => narrative.isNodeHighlighted('Alice')).toBe(false);
    expect(await narrative.isNodeHighlighted('Bob')).toBe(false);
    expect(await narrative.isNodeHighlighted('Cara')).toBe(false);
  },
};

const allowRepositioningTrue: ScenarioDefinition = {
  id: 'allow-repositioning-readonly-invariant',
  covers: ['behaviours.allowRepositioning'],
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
      behaviours: { allowRepositioning: true },
    });
    stage.addPreset({ layoutVariable: layoutVar.id });
    synth.addManualNode(stage.id, person.id, 'node-alice', {
      [nameVar.id]: 'Alice',
      [layoutVar.id]: { x: 0.3, y: 0.3 },
    });
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);
    const before = await page.evaluate(() => window.__test.getNetworkState());

    const boxBefore = await narrative.getNode('Alice').boundingBox();
    if (!boxBefore) throw new Error('Alice has no bounding box');

    await narrative.dragNodeBy('Alice', 150, 100);

    // The node visibly follows the drag...
    await expect
      .poll(async () => {
        const box = await narrative.getNode('Alice').boundingBox();
        return box ? box.x - boxBefore.x : 0;
      })
      .toBeGreaterThan(80);
    const boxAfter = await narrative.getNode('Alice').boundingBox();
    if (!boxAfter) throw new Error('Alice lost its bounding box after drag');
    expect(boxAfter.y - boxBefore.y).toBeGreaterThan(50);

    // ...but the layout is never written back (persist:false).
    const after = await page.evaluate(() => window.__test.getNetworkState());
    expect(after).toEqual(before);
  },
};

const allowRepositioningFalse: ScenarioDefinition = {
  id: 'allow-repositioning-omitted-blocks-drag',
  covers: ['behaviours.allowRepositioning'],
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
    });
    stage.addPreset({ layoutVariable: layoutVar.id });
    synth.addManualNode(stage.id, person.id, 'node-alice', {
      [nameVar.id]: 'Alice',
      [layoutVar.id]: { x: 0.3, y: 0.3 },
    });
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);

    // No behaviours key: allowRepositioning defaults to false, so useCanvasDrag
    // bails out on pointer-down and the authored position never moves.
    expect(await narrative.getNodeLeftPercent('Alice')).toBeCloseTo(30, 1);

    await narrative.dragNodeBy('Alice', 150, 100);

    expect(await narrative.getNodeLeftPercent('Alice')).toBeCloseTo(30, 1);
    expect(await narrative.getNodeTopPercent('Alice')).toBeCloseTo(30, 1);
  },
};

const automaticLayoutPauseResume: ScenarioDefinition = {
  id: 'automatic-layout-identity-mock-pause-resume',
  covers: ['behaviours.automaticLayout', 'behaviours'],
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
      behaviours: { automaticLayout: true },
    });
    stage.addPreset({ layoutVariable: layoutVar.id });
    const coords = [
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.2 },
      { x: 0.6, y: 0.2 },
      { x: 0.2, y: 0.6 },
      { x: 0.4, y: 0.6 },
      { x: 0.6, y: 0.6 },
    ];
    coords.forEach((coord, i) => {
      synth.addManualNode(stage.id, person.id, `node-${i}`, {
        [nameVar.id]: `Node${i}`,
        [layoutVar.id]: coord,
      });
    });
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);
    await narrative.waitForSimulationSettled();

    // The identity mock worker echoes the authored seed positions unchanged.
    expect(await narrative.getNodeLeftPercent('Node0')).toBeCloseTo(20, 0);
    expect(await narrative.getNodeTopPercent('Node0')).toBeCloseTo(20, 0);

    const root = narrative.root();
    await expect(
      root.getByRole('button', { name: 'Pause automatic layout' }),
    ).toBeVisible();

    await narrative.toggleAutomaticLayout();
    await expect(
      root.getByRole('button', { name: 'Resume automatic layout' }),
    ).toBeVisible();

    await narrative.toggleAutomaticLayout();
    await expect(
      root.getByRole('button', { name: 'Pause automatic layout' }),
    ).toBeVisible();
  },
};

const freeDrawAnnotate: ScenarioDefinition = {
  id: 'free-draw-annotate-fade-freeze-reset',
  covers: ['behaviours.freeDraw'],
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
      behaviours: { freeDraw: true },
    });
    stage.addPreset({ layoutVariable: layoutVar.id });
    synth.addManualNode(stage.id, person.id, 'node-alice', {
      [nameVar.id]: 'Alice',
      [layoutVar.id]: { x: 0.2, y: 0.2 },
    });
    synth.addManualNode(stage.id, person.id, 'node-bob', {
      [nameVar.id]: 'Bob',
      [layoutVar.id]: { x: 0.8, y: 0.8 },
    });
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);
    const before = await page.evaluate(() => window.__test.getNetworkState());

    // No annotation layer mounts until drawing is explicitly enabled.
    await expect(narrative.getAnnotationPaths()).toHaveCount(0);
    await narrative.toggleDrawing();

    // Frozen strokes persist (isFading is gated off while frozen). Under the
    // e2e MotionConfig `skipAnimations`, an UNfrozen stroke's fade completes
    // instantly and the path unmounts, so freezing is the deterministic way to
    // prove a stroke was drawn.
    await narrative.toggleFreeze();
    await narrative.drawStroke([
      { x: 0.35, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.65, y: 0.5 },
    ]);
    await expect(narrative.getAnnotationPaths()).toHaveCount(1);
    const frozenOpacity = await narrative
      .getAnnotationPaths()
      .first()
      .evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(frozenOpacity).toBe(1);

    await narrative.drawStroke([
      { x: 0.4, y: 0.4 },
      { x: 0.6, y: 0.4 },
    ]);
    await expect(narrative.getAnnotationPaths()).toHaveCount(2);

    // Reset clears every annotation.
    await narrative.resetAnnotations();
    await expect(narrative.getAnnotationPaths()).toHaveCount(0);

    // Unfreezing: a fresh stroke now fades and unmounts (opacity animates to 0
    // and the line is removed) — the contrast that proves the fade behaviour
    // without any pixel-timing assertion.
    await narrative.toggleFreeze();
    await narrative.drawStroke([
      { x: 0.35, y: 0.55 },
      { x: 0.6, y: 0.55 },
    ]);
    await expect
      .poll(() => narrative.getAnnotationPaths().count(), { timeout: 10000 })
      .toBe(0);

    // Drawing never mutates the interview network.
    const after = await page.evaluate(() => window.__test.getNetworkState());
    expect(after).toEqual(before);
  },
};

const concentricCirclesBackground: ScenarioDefinition = {
  id: 'concentric-circles-background-variants',
  covers: [
    'background',
    'background.concentricCircles',
    'background.skewedTowardCenter',
  ],
  visual: true,
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();

    const stage0 = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
    });
    stage0.addPreset({ layoutVariable: layoutVar.id });

    const stage1 = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
      background: { concentricCircles: 6, skewedTowardCenter: false },
    });
    stage1.addPreset({ layoutVariable: layoutVar.id });

    const stage2 = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
      background: { concentricCircles: 0 },
    });
    stage2.addPreset({ layoutVariable: layoutVar.id });

    [stage0, stage1, stage2].forEach((stage, i) => {
      synth.addManualNode(stage.id, person.id, `node-${i}`, {
        [nameVar.id]: `Node${i}`,
        [layoutVar.id]: { x: 0.5, y: 0.5 },
      });
    });
    return synth;
  },
  run: async ({ page, interview }) => {
    const narrative = new NarrativeFixture(page);

    // Stage 0: no background key -> component default of 4 rings.
    await expect(narrative.getBackgroundCircles()).toHaveCount(4);

    // Stage 1: 6 evenly-spaced rings (skewedTowardCenter:false -> q=1).
    await interview.goto(1);
    await expect(narrative.getBackgroundCircles()).toHaveCount(6);
    const radii = (await narrative.getBackgroundCircleRadii()).toSorted(
      (a, b) => a - b,
    );
    const deltas = radii.slice(1).map((r, i) => r - radii[i]!);
    const maxDelta = Math.max(...deltas);
    const minDelta = Math.min(...deltas);
    expect(maxDelta - minDelta).toBeLessThan(0.5);

    // Stage 2: concentricCircles:0 -> no background rendered.
    await interview.goto(2);
    await expect(narrative.getBackgroundCircles()).toHaveCount(0);
  },
};

const filterDisplayScoping: ScenarioDefinition = {
  id: 'filter-stage-level-display-scoping',
  covers: ['filter'],
  seedNetwork: true,
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const statusVar = person.addVariable({ type: 'text', name: 'status' });

    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
      filter: {
        join: 'AND',
        rules: [
          {
            type: 'node',
            id: 'rule-status-active',
            options: {
              type: person.id,
              attribute: statusVar.id,
              operator: 'EXACTLY',
              value: 'active',
            },
          },
        ],
      },
    });
    stage.addPreset({ layoutVariable: layoutVar.id });

    const statuses = ['active', 'inactive', 'active', 'inactive', 'active'];
    statuses.forEach((status, i) => {
      synth.addManualNode(stage.id, person.id, `node-${i}`, {
        [nameVar.id]: `Node${i}`,
        [layoutVar.id]: { x: 0.2 + i * 0.12, y: 0.5 },
        [statusVar.id]: status,
      });
    });
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);

    // Only the 3 'active' nodes pass the stage filter and render on the canvas.
    await expect(narrative.getNode('Node0')).toBeVisible();
    await expect(narrative.getNode('Node2')).toBeVisible();
    await expect(narrative.getNode('Node4')).toBeVisible();
    await expect(narrative.getNode('Node1')).toHaveCount(0);
    await expect(narrative.getNode('Node3')).toHaveCount(0);

    // The filter is display-only: the underlying network still holds all 5.
    const network = await page.evaluate(() => window.__test.getNetworkState());
    expect(network?.nodes).toHaveLength(5);
  },
};

const subjectCodebookLookupAndScoping: ScenarioDefinition = {
  id: 'subject-codebook-lookup-and-type-scoping',
  covers: ['subject'],
  seedNetwork: true,
  build: () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const personName = person.addVariable({ type: 'text', name: 'name' });
    const personLayout = person.addVariable({ type: 'layout', name: 'Layout' });
    const closeVar = person.addVariable({
      type: 'boolean',
      name: 'CloseFriend',
    });
    const community = person.addVariable({
      type: 'categorical',
      name: 'Community',
      options: [
        { label: 'Family', value: 'family' },
        { label: 'Work', value: 'work' },
      ],
    });

    // A second, non-subject node type with its OWN layout variable. The
    // protocol schema forbids sharing a variable id across entity types
    // (CurrentProtocolSchema: "Variable record key reused across entity
    // types"), and getNetwork() only emits attributes declared on a node's own
    // type — so a Place node can never carry the Person layout variable that
    // the preset renders against.
    const place = synth.addNodeType({ name: 'Place' });
    const placeName = place.addVariable({ type: 'text', name: 'name' });
    const placeLayout = place.addVariable({ type: 'layout', name: 'Layout' });

    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
    });
    stage.addPreset({
      layoutVariable: personLayout.id,
      groupVariable: community.id,
      highlight: [closeVar.id],
    });

    synth.addManualNode(stage.id, person.id, 'p-alice', {
      [personName.id]: 'Alice',
      [personLayout.id]: { x: 0.3, y: 0.3 },
      [closeVar.id]: true,
      [community.id]: ['family'],
    });
    // A different type with its own layout variable set — it is in the network
    // but does NOT render, because it lacks the preset's (Person) layout
    // variable. Rendering is gated by the subject's layout variable presence.
    synth.addManualNode(stage.id, place.id, 'pl-library', {
      [placeName.id]: 'Library',
      [placeLayout.id]: { x: 0.6, y: 0.6 },
    });
    return synth;
  },
  run: async ({ page }) => {
    const narrative = new NarrativeFixture(page);

    // Legend labels resolve against the SUBJECT (Person) codebook.
    await expect(narrative.getHighlightRadio('CloseFriend')).toBeVisible();
    await expect(narrative.getAccordionTrigger('Groups')).toBeVisible();
    await expect(page.getByText('Family', { exact: true })).toBeVisible();
    await expect(page.getByText('Work', { exact: true })).toBeVisible();

    // The subject-type Person node renders; the non-subject Place node does
    // not (it lacks the preset's layout variable).
    await expect(narrative.getNode('Alice')).toBeVisible();
    await expect(narrative.getNode('Library')).toHaveCount(0);

    // The Place node is still present in the underlying network — display
    // scoping, not deletion.
    const network = await page.evaluate(() => window.__test.getNetworkState());
    expect(network?.nodes).toHaveLength(2);
  },
};

export const narrativeScenarios: InterfaceScenarios = {
  interfaceType: 'Narrative',
  scenarios: [
    layoutVariableNodeInclusion,
    multiplePresetsSwitchResets,
    edgesDisplayAndLinksLegend,
    convexHullsGroups,
    highlightMultiAttribute,
    allowRepositioningTrue,
    allowRepositioningFalse,
    automaticLayoutPauseResume,
    freeDrawAnnotate,
    concentricCirclesBackground,
    filterDisplayScoping,
    subjectCodebookLookupAndScoping,
  ],
};

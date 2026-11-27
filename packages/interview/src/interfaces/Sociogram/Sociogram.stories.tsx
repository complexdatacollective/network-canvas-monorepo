import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { SuperJSON } from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

function createSociogramInterview(seed: number) {
  const si = new SyntheticInterview(seed);
  const nt = si.addNodeType({ name: 'Person' });
  const layoutVar = si.addLayout({ name: 'Sociogram_Layout' });
  const highlightVar = nt.addVariable({
    type: 'boolean',
    name: 'Close Friend',
  });
  const et = si.addEdgeType({ name: 'Friendship' });
  return { si, nt, layoutVar, highlightVar, et };
}

function SociogramStoryWrapper({
  buildFn,
}: {
  buildFn: () => SyntheticInterview;
}) {
  const interview = useMemo(() => buildFn(), [buildFn]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta = {
  title: 'Interfaces/Sociogram',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj;

// --- Stories ---

const buildDefault = () => {
  const { si, layoutVar } = createSociogramInterview(1);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 5 },
  });
  stage.addPrompt();
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const Default: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildDefault} />,
};

const buildEmptyNetwork = () => {
  const { si, layoutVar } = createSociogramInterview(2);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', { layout: layoutVar.id });
  stage.addPrompt();
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const EmptyNetwork: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildEmptyNetwork} />,
};

const buildWithUnplacedNodes = () => {
  const { si, layoutVar } = createSociogramInterview(3);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 6 },
  });
  stage.addPrompt();
  for (let i = 3; i < 6; i++) {
    si.unsetNodeAttribute(i, layoutVar.id);
  }
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const WithUnplacedNodes: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildWithUnplacedNodes} />,
};

const buildConcentricCircles = () => {
  const { si, layoutVar } = createSociogramInterview(4);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 6 },
    background: { concentricCircles: 4, skewedTowardCenter: true },
  });
  stage.addPrompt();
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const ConcentricCircles: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildConcentricCircles} />,
};

const buildWithEdges = () => {
  const { si, layoutVar, et } = createSociogramInterview(5);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 5 },
  });
  stage.addPrompt({
    text: 'Tap two people who know each other to link them.',
    edges: { create: et.id, display: [et.id] },
  });
  si.addEdges([
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 4],
  ]);
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const WithEdges: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildWithEdges} />,
};

// Regression case: diamond nodes are rendered via a rotated background layer,
// which must not affect node centering (edge endpoints, drag position). The
// edges are directed, so the story also shows where an arrowhead meets a
// diamond: along an axis, on a diagonal, and at both ends of a reciprocal pair.
const buildDiamondNodes = () => {
  const { si, nt, layoutVar } = createSociogramInterview(14);
  nt.setShape({ default: 'diamond' });
  const follows = si.addEdgeType({ name: 'Follows', directed: true });
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 5 },
  });
  stage.addPrompt({
    text: 'Tap a person, then someone they follow.',
    edges: { create: follows.id, display: [follows.id] },
  });
  [
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.3 },
    { x: 0.3, y: 0.7 },
    { x: 0.7, y: 0.7 },
    { x: 0.5, y: 0.9 },
  ].forEach((position, index) => {
    si.setNodeAttribute(index, layoutVar.id, position);
  });
  si.addEdges(
    [
      [0, 1],
      [1, 0],
      [0, 2],
      [0, 3],
      [4, 3],
    ],
    follows.id,
  );
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const DiamondNodes: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildDiamondNodes} />,
  // Asserts the regression invariant: every line runs through the centres of
  // the bounding boxes of the two nodes it joins, i.e. the diamond's rotated
  // background layer does not shift the visual center. Each arrowhead's tip
  // sits on the diamond's edge: no nearer the centre than the middle of a
  // side, and no further out than a rounded corner.
  play: async ({ canvasElement }) => {
    const sociogram = await waitFor(() => {
      const el = canvasElement.querySelector<HTMLElement>(
        '[data-testid="sociogram"]',
      );
      expect(el).not.toBeNull();
      return el!;
    });

    // EdgeLayer creates the lines on mount but only positions them on the
    // next animation frame, so wait until every endpoint is populated.
    const svg = sociogram.querySelector('svg[viewBox="0 0 1 1"]')!;
    const { lines, tips } = await waitFor(() => {
      const found = [...svg.querySelectorAll<SVGLineElement>('line')];
      expect(found).toHaveLength(4);
      for (const line of found) {
        expect(line.getAttribute('x1')).not.toBeNull();
      }
      const heads = [
        ...svg.querySelectorAll<SVGPolygonElement>(
          'polygon[data-edge-arrowhead]',
        ),
      ];
      expect(heads).toHaveLength(5);
      for (const head of heads) {
        expect(head.getAttribute('visibility')).toBe('visible');
      }
      return {
        lines: found,
        tips: heads.map((head) => head.getAttribute('points')!.split(' ')[0]!),
      };
    });

    // Canvas nodes are the buttons positioned via inline left/top.
    const nodeBoxes = [
      ...sociogram.querySelectorAll<HTMLButtonElement>('button[aria-label]'),
    ]
      .filter((button) => button.style.left !== '')
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          radius: rect.width / 2,
        };
      });
    expect(nodeBoxes).toHaveLength(5);

    const svgRect = svg.getBoundingClientRect();
    const toScreen = (x: string | null, y: string | null) => ({
      x: svgRect.left + Number(x) * svgRect.width,
      y: svgRect.top + Number(y) * svgRect.height,
    });
    const nearest = (point: { x: number; y: number }) =>
      nodeBoxes.toSorted(
        (a, b) =>
          Math.hypot(a.x - point.x, a.y - point.y) -
          Math.hypot(b.x - point.x, b.y - point.y),
      )[0]!;

    for (const line of lines) {
      const start = toScreen(line.getAttribute('x1'), line.getAttribute('y1'));
      const end = toScreen(line.getAttribute('x2'), line.getAttribute('y2'));
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      for (const centre of [nearest(start), nearest(end)]) {
        const offLine =
          Math.abs(
            (end.x - start.x) * (start.y - centre.y) -
              (start.x - centre.x) * (end.y - start.y),
          ) / length;
        expect(offLine).toBeLessThan(2);
      }
    }

    for (const tip of tips) {
      const [x, y] = tip.split(',');
      const point = toScreen(x ?? null, y ?? null);
      const target = nearest(point);
      const reach = Math.hypot(point.x - target.x, point.y - target.y);
      expect(reach).toBeGreaterThan(target.radius * 0.85 - 2);
      expect(reach).toBeLessThan(target.radius * 1.05 + 2);
    }
  },
};

const buildWithHighlighting = () => {
  const { si, layoutVar, highlightVar } = createSociogramInterview(6);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 6 },
  });
  stage.addPrompt({
    text: 'Tap the people you are close to.',
    highlight: [{ variable: highlightVar.id }],
  });
  const hlValues = [true, false, true, null, true, false];
  hlValues.forEach((v, i) => {
    if (v === null) {
      si.unsetNodeAttribute(i, highlightVar.id);
    } else {
      si.setNodeAttribute(i, highlightVar.id, v);
    }
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const WithHighlighting: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildWithHighlighting} />,
};

const buildAutomaticLayout = () => {
  const { si, layoutVar, et } = createSociogramInterview(7);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 8 },
    behaviours: { automaticLayout: true },
  });
  stage.addPrompt({
    text: 'Tap two people who know each other to link them.',
    edges: { create: et.id, display: [et.id] },
  });
  si.addEdges([
    [0, 1],
    [0, 2],
    [1, 2],
    [3, 4],
    [4, 5],
    [6, 7],
  ]);
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const AutomaticLayout: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildAutomaticLayout} />,
};

const buildMultiplePrompts = () => {
  const { si, layoutVar, highlightVar } = createSociogramInterview(8);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 5 },
  });
  stage.addPrompt();
  stage.addPrompt({
    text: 'Now highlight people who are close friends.',
    highlight: [{ variable: highlightVar.id }],
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const MultiplePrompts: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildMultiplePrompts} />,
};

const buildManyNodes = () => {
  const { si, layoutVar } = createSociogramInterview(9);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 10 },
  });
  stage.addPrompt();
  si.addEdges([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [0, 4],
    [1, 6],
    [2, 8],
  ]);
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const ManyNodes: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildManyNodes} />,
};

const buildBackgroundImage = () => {
  const { si, layoutVar } = createSociogramInterview(10);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const bgAssetId = 'bg-map-1';
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 5 },
    background: { image: bgAssetId },
  });
  stage.addPrompt();
  si.addAsset({
    assetId: bgAssetId,
    url: 'https://picsum.photos/seed/sociogram/1200/1200',
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const BackgroundImage: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildBackgroundImage} />,
};

const buildAutomaticLayoutLarge = () => {
  const { si, layoutVar, et } = createSociogramInterview(11);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 20 },
    behaviours: { automaticLayout: true },
  });
  stage.addPrompt({
    text: 'Tap two people who know each other to link them.',
    edges: { create: et.id, display: [et.id] },
  });
  si.addEdges([
    [0, 1],
    [1, 2],
    [2, 3],
    [4, 5],
    [6, 7],
    [8, 9],
    [10, 11],
    [12, 13],
    [14, 15],
    [16, 17],
    [0, 9],
    [4, 14],
  ]);
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const AutomaticLayoutLarge: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildAutomaticLayoutLarge} />,
};

const buildEdgesAndHighlighting = () => {
  const { si, layoutVar, highlightVar, et } = createSociogramInterview(12);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 6 },
  });
  stage.addPrompt({
    text: 'Highlight your close friends.',
    edges: { display: [et.id] },
    highlight: [{ variable: highlightVar.id }],
  });
  const hlValues = [true, false, true, false, true, false];
  hlValues.forEach((v, i) => {
    si.setNodeAttribute(i, highlightVar.id, v);
  });
  si.addEdges([
    [0, 2],
    [0, 4],
    [2, 4],
    [1, 3],
  ]);
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const EdgesAndHighlighting: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildEdgesAndHighlighting} />,
};

const buildLongPrompt = () => {
  const { si, layoutVar } = createSociogramInterview(13);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 5 },
  });
  stage.addPrompt({
    text: 'Position each person on the map based on how emotionally close you feel to them. Place people you feel very close to near the center and those you feel less connected with further out.',
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

export const LongPrompt: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildLongPrompt} />,
};

const buildAllPlaced = () => {
  const { si, layoutVar } = createSociogramInterview(12);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 4 },
  });
  stage.addPrompt();
  for (let i = 0; i < 4; i++) {
    si.setNodeAttribute(i, layoutVar.id, { x: 0.2 + i * 0.15, y: 0.35 });
  }
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

// With every node placed the drawer is empty, but it stays available: it can
// be expanded to reveal the drop area, and a focused canvas node can be
// returned to it with Delete/Backspace.
export const UnplaceNodes: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildAllPlaced} />,
  play: async ({ canvasElement }) => {
    const tab = await waitFor(() => {
      const el = canvasElement.querySelector<HTMLButtonElement>(
        'button[data-zone-id="node-drawer"], [data-zone-id="node-drawer"] button',
      );
      expect(el).not.toBeNull();
      expect(el!.textContent).toContain('0 unplaced');
      return el!;
    });

    // The tab is clickable while empty and expands to reveal the drop area
    expect(tab.disabled).toBe(false);
    await userEvent.click(tab);
    await waitFor(() => {
      expect(tab.getAttribute('aria-expanded')).toBe('true');
      expect(canvasElement.textContent).toContain('Drop here to remove');
    });

    // Delete on a focused canvas node unplaces it into the drawer
    const node = canvasElement.querySelector<HTMLButtonElement>(
      '[data-zone-id="sociogram-canvas"] button[aria-label]',
    );
    expect(node).not.toBeNull();
    node!.focus();
    await userEvent.keyboard('{Delete}');
    await waitFor(() => {
      expect(tab.textContent).toContain('1 unplaced');
    });
  },
};

const buildTasks = (task: 'layout' | 'highlight' | 'connect') => () => {
  const { si, layoutVar, highlightVar, et } = createSociogramInterview(15);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 5 },
  });
  if (task === 'layout') {
    stage.addPrompt({ text: 'Place the people you know.' });
  }
  if (task === 'highlight') {
    stage.addPrompt({
      text: 'Tap your close friends.',
      highlight: [{ variable: highlightVar.id }],
    });
  }
  if (task === 'connect') {
    stage.addPrompt({
      text: 'Link people who know each other.',
      edges: { create: et.id, display: [et.id] },
    });
  }
  for (let i = 0; i < 5; i++) {
    si.setNodeAttribute(i, highlightVar.id, false);
  }
  // Two people are still in the drawer.
  for (let i = 3; i < 5; i++) {
    si.unsetNodeAttribute(i, layoutVar.id);
  }
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const sociogramParts = async (canvasElement: HTMLElement) =>
  waitFor(() => {
    const canvas = canvasElement.querySelector<HTMLElement>(
      '[data-testid="sociogram"] [role="application"]',
    );
    const drawer = canvasElement.querySelector<HTMLElement>(
      '[data-testid="node-drawer-nodes"]',
    );
    expect(canvas).not.toBeNull();
    expect(drawer).not.toBeNull();
    const placed = [...canvas!.querySelectorAll<HTMLButtonElement>('button')];
    const unplaced = [...drawer!.querySelectorAll<HTMLButtonElement>('button')];
    expect(placed).toHaveLength(3);
    expect(unplaced).toHaveLength(2);
    return { placed, unplaced };
  });

const buildLayoutTask = buildTasks('layout');
const buildHighlightTask = buildTasks('highlight');
const buildConnectTask = buildTasks('connect');

// In a layout task people in the drawer can be dragged onto the canvas, and
// placed people can be moved.
export const LayoutTask: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildLayoutTask} />,
  play: async ({ canvasElement }) => {
    const { placed, unplaced } = await sociogramParts(canvasElement);
    for (const node of unplaced) await expect(node).toBeEnabled();
    for (const node of placed) {
      await expect(node).toBeEnabled();
      await expect(node.style.cursor).toBe('grab');
    }
    const [first] = placed;
    const left = first!.style.left;
    first!.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(first!.style.left).not.toBe(left));
  },
};

// In a highlight task a tap toggles the highlight. Nobody can be moved, and
// people still in the drawer are dimmed.
export const HighlightTask: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildHighlightTask} />,
  play: async ({ canvasElement }) => {
    const { placed, unplaced } = await sociogramParts(canvasElement);
    for (const node of unplaced) await expect(node).toBeDisabled();
    const [first] = placed;
    await expect(first!.style.cursor).not.toBe('grab');
    await expect(first).not.toHaveAttribute('data-node-highlighted');
    await userEvent.click(first!);
    await waitFor(() =>
      expect(first).toHaveAttribute('data-node-highlighted', 'true'),
    );
    await userEvent.click(first!);
    await waitFor(() =>
      expect(first).not.toHaveAttribute('data-node-highlighted'),
    );
  },
};

// In a connect task tapping two people links them. Nobody can be moved, and
// people still in the drawer are dimmed.
export const ConnectTask: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildConnectTask} />,
  play: async ({ canvasElement }) => {
    const { placed, unplaced } = await sociogramParts(canvasElement);
    for (const node of unplaced) await expect(node).toBeDisabled();
    const [first, second] = placed;
    await expect(first!.style.cursor).not.toBe('grab');
    await expect(canvasElement.querySelectorAll('[data-edge-id]').length).toBe(
      0,
    );
    await userEvent.click(first!);
    await userEvent.click(second!);
    await waitFor(() =>
      expect(canvasElement.querySelectorAll('[data-edge-id]').length).toBe(1),
    );
  },
};

// The floating prompt panel collapses behind its chevron tab so the prompt
// text can be moved out of the way of the canvas.
export const CollapsiblePromptPanel: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildDefault} />,
  play: async ({ canvasElement }) => {
    const toggle = await waitFor(() => {
      const el = canvasElement.querySelector<HTMLButtonElement>(
        '[data-testid="prompts-toggle"]',
      );
      expect(el).not.toBeNull();
      return el!;
    });
    const content = canvasElement.querySelector<HTMLElement>(
      `[id="${toggle.getAttribute('aria-controls')}"]`,
    );
    expect(content).not.toBeNull();

    await userEvent.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(content!.getBoundingClientRect().height).toBe(0);
    });

    await userEvent.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(content!.getBoundingClientRect().height).toBeGreaterThan(0);
    });
  },
};

// Sets each node's name, in node order, through its type's name variable
// (the one `addNodeType` seeds first).
function nameNodes(
  si: SyntheticInterview,
  nodes: readonly { typeId: string; name: string }[],
) {
  nodes.forEach(({ typeId, name }, index) => {
    const [nameVariable] = si.getVariableIds(typeId);
    si.setNodeAttribute(index, nameVariable!, name);
  });
}

const labelsOf = (buttons: readonly HTMLButtonElement[]) =>
  buttons.map((button) => button.getAttribute('aria-label'));

const canvasButton = (canvasElement: HTMLElement, name: string) =>
  waitFor(() => {
    const button = canvasElement.querySelector<HTMLButtonElement>(
      `[data-testid="sociogram"] [role="application"] button[aria-label="${name}"]`,
    );
    expect(button).not.toBeNull();
    return button!;
  });

const lineCount = (canvasElement: HTMLElement) =>
  canvasElement.querySelectorAll('line[data-edge-id]').length;

const arrowheadCount = (canvasElement: HTMLElement) =>
  [
    ...canvasElement.querySelectorAll<SVGPolygonElement>(
      'polygon[data-edge-arrowhead]',
    ),
  ].filter((arrow) => arrow.getAttribute('visibility') === 'visible').length;

// Taps `first` and then `second`, waiting for `first` to be the pending
// source in between.
async function tapPair(first: HTMLButtonElement, second: HTMLButtonElement) {
  await userEvent.click(first);
  await waitFor(() => expect(first).toHaveAttribute('data-node-linking'));
  await userEvent.click(second);
  await waitFor(() => expect(first).not.toHaveAttribute('data-node-linking'));
}

const buildSeveralNodeTypes = () => {
  const si = new SyntheticInterview(16);
  const person = si.addNodeType({ name: 'Person' });
  const place = si.addNodeType({ name: 'Place', shape: { default: 'square' } });
  const layoutVar = si.addLayout({ name: 'Sociogram_Layout' });
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    subject: { entity: 'node', types: [person.id, place.id] },
    layout: layoutVar.id,
    initialNodes: { count: { [person.id]: 3, [place.id]: 2 } },
  });
  const [personName] = si.getVariableIds(person.id);
  stage.addPrompt({
    text: 'Place the people you know and the places you go.',
    sortOrder: [{ type: person.id, property: personName!, direction: 'asc' }],
    nodeTypeOrder: [place.id, person.id],
  });
  nameNodes(si, [
    { typeId: person.id, name: 'Casey' },
    { typeId: person.id, name: 'Blake' },
    { typeId: person.id, name: 'Alex' },
    { typeId: place.id, name: 'Park' },
    { typeId: place.id, name: 'Museum' },
  ]);
  // Casey and the museum are placed; the rest wait in the drawer.
  for (const index of [1, 2, 3]) si.unsetNodeAttribute(index, layoutVar.id);
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

// A Sociogram showing people and places. Both types are on the canvas and in
// the drawer, which lists places first, as the prompt's node type order says,
// and people by name.
export const SeveralNodeTypes: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildSeveralNodeTypes} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const canvas = canvasElement.querySelector<HTMLElement>(
        '[data-testid="sociogram"] [role="application"]',
      );
      const drawer = canvasElement.querySelector<HTMLElement>(
        '[data-testid="node-drawer-nodes"]',
      );
      expect(canvas).not.toBeNull();
      expect(drawer).not.toBeNull();
      expect(
        labelsOf([...canvas!.querySelectorAll('button')]).toSorted((a, b) =>
          (a ?? '').localeCompare(b ?? ''),
        ),
      ).toEqual(['Casey', 'Museum']);
      expect(labelsOf([...drawer!.querySelectorAll('button')])).toEqual([
        'Park',
        'Alex',
        'Blake',
      ]);
    });
  },
};

const buildDirected = (reciprocal: boolean) => () => {
  const si = new SyntheticInterview(17);
  const person = si.addNodeType({ name: 'Person' });
  const place = si.addNodeType({ name: 'Place', shape: { default: 'square' } });
  const layoutVar = si.addLayout({ name: 'Sociogram_Layout' });
  // People can go to people for advice, and to places; a place goes to
  // nobody.
  const advice = si.addEdgeType({
    name: 'Asks for advice',
    directed: true,
    endpointRules: [
      { sourceType: person.id, targetType: person.id },
      { sourceType: person.id, targetType: place.id },
    ],
  });
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    subject: { entity: 'node', types: [person.id, place.id] },
    layout: layoutVar.id,
    initialNodes: { count: { [person.id]: 3, [place.id]: 1 } },
  });
  stage.addPrompt({
    text: 'Tap a person, then someone or somewhere they go to for advice.',
    edges: { create: advice.id, display: [advice.id] },
  });
  nameNodes(si, [
    { typeId: person.id, name: 'Alex' },
    { typeId: person.id, name: 'Blake' },
    { typeId: person.id, name: 'Casey' },
    { typeId: place.id, name: 'Library' },
  ]);
  const positions = [
    { x: 0.25, y: 0.35 },
    { x: 0.7, y: 0.3 },
    { x: 0.35, y: 0.75 },
    { x: 0.75, y: 0.7 },
  ];
  positions.forEach((position, index) => {
    si.setNodeAttribute(index, layoutVar.id, position);
  });
  if (reciprocal) {
    si.addEdges(
      [
        [0, 1],
        [1, 0],
        [2, 0],
        [2, 3],
      ],
      advice.id,
    );
  }
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildDirectedConnect = buildDirected(false);
const buildReciprocalEdges = buildDirected(true);

// A directed connect task: tapping Alex then Blake adds Alex to Blake, tapping
// Blake then Alex adds the opposite edge, drawn on the same line with an
// arrowhead at each end, and tapping Alex then Blake again removes the first.
// The library can be a target but never a source, so it starts disabled.
export const DirectedConnect: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildDirectedConnect} />,
  play: async ({ canvasElement }) => {
    const alex = await canvasButton(canvasElement, 'Alex');
    const blake = await canvasButton(canvasElement, 'Blake');
    const library = await canvasButton(canvasElement, 'Library');
    await expect(library).toBeDisabled();

    await tapPair(alex, blake);
    await waitFor(() => {
      expect(lineCount(canvasElement)).toBe(1);
      expect(arrowheadCount(canvasElement)).toBe(1);
    });

    await tapPair(blake, alex);
    await waitFor(() => {
      expect(lineCount(canvasElement)).toBe(1);
      expect(arrowheadCount(canvasElement)).toBe(2);
    });

    await tapPair(alex, blake);
    await waitFor(() => {
      expect(lineCount(canvasElement)).toBe(1);
      expect(arrowheadCount(canvasElement)).toBe(1);
    });

    await userEvent.click(alex);
    await waitFor(() => expect(library).toBeEnabled());
  },
};

// Alex and Blake go to each other for advice, drawn as one line with an
// arrowhead at each end; Casey goes to Alex and to the library. Each
// arrowhead's tip touches the edge of the node it points to.
export const ReciprocalEdges: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildReciprocalEdges} />,
  play: async ({ canvasElement }) => {
    const svg = await waitFor(() => {
      const found = canvasElement.querySelector<SVGSVGElement>(
        '[data-testid="sociogram"] svg[viewBox="0 0 1 1"]',
      );
      expect(found).not.toBeNull();
      expect(lineCount(canvasElement)).toBe(3);
      expect(arrowheadCount(canvasElement)).toBe(4);
      return found!;
    });
    const reciprocal = canvasElement.querySelectorAll('line[data-edge-ids]');
    expect(reciprocal).toHaveLength(1);

    const nodes = await Promise.all(
      ['Alex', 'Blake', 'Casey', 'Library'].map((name) =>
        canvasButton(canvasElement, name),
      ),
    );
    const svgRect = svg.getBoundingClientRect();
    for (const arrow of svg.querySelectorAll('polygon[data-edge-arrowhead]')) {
      const [tip = ''] = (arrow.getAttribute('points') ?? '').split(' ');
      const [x = 0, y = 0] = tip.split(',').map(Number);
      const tipX = svgRect.left + x * svgRect.width;
      const tipY = svgRect.top + y * svgRect.height;
      // The tip lies on the boundary of a node: about one radius from the
      // nearest centre, not at the centre.
      const nearest = nodes
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            distance: Math.hypot(
              rect.left + rect.width / 2 - tipX,
              rect.top + rect.height / 2 - tipY,
            ),
            radius: rect.width / 2,
          };
        })
        .toSorted((a, b) => a.distance - b.distance)[0];
      expect(nearest).toBeDefined();
      const { distance, radius } = nearest!;
      expect(Math.abs(distance - radius)).toBeLessThan(radius * 0.25);
    }
  },
};

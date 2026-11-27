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
// which must not affect node centering (edge endpoints, drag position).
const buildDiamondNodes = () => {
  const { si, nt, layoutVar, et } = createSociogramInterview(14);
  nt.setShape({ default: 'diamond' });
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', {
    layout: layoutVar.id,
    initialNodes: { count: 5 },
  });
  stage.addPrompt({
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

export const DiamondNodes: Story = {
  render: () => <SociogramStoryWrapper buildFn={buildDiamondNodes} />,
  // Asserts the regression invariant: every edge endpoint (drawn at the
  // node's stored position) coincides with the center of that node's
  // bounding box, i.e. the diamond's rotated background layer does not
  // shift the visual center.
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
    const lines = await waitFor(() => {
      const found = [
        ...sociogram.querySelectorAll<SVGLineElement>(
          'svg[viewBox="0 0 1 1"] line',
        ),
      ];
      expect(found).toHaveLength(5);
      for (const line of found) {
        expect(line.getAttribute('x1')).not.toBeNull();
      }
      return found;
    });

    // Canvas nodes are the buttons positioned via inline left/top.
    const nodeCenters = [
      ...sociogram.querySelectorAll<HTMLButtonElement>('button[aria-label]'),
    ]
      .filter((button) => button.style.left !== '')
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
    expect(nodeCenters).toHaveLength(5);

    const svgRect = sociogram
      .querySelector('svg[viewBox="0 0 1 1"]')!
      .getBoundingClientRect();

    for (const line of lines) {
      for (const [xAttr, yAttr] of [
        ['x1', 'y1'],
        ['x2', 'y2'],
      ] as const) {
        const x =
          svgRect.left + Number(line.getAttribute(xAttr)) * svgRect.width;
        const y =
          svgRect.top + Number(line.getAttribute(yAttr)) * svgRect.height;
        const distanceToNearestCenter = Math.min(
          ...nodeCenters.map((c) => Math.hypot(c.x - x, c.y - y)),
        );
        expect(distanceToNearestCenter).toBeLessThan(2);
      }
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
